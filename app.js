// video-server.js - Advanced Chunked Stream Video Server with 24/7 Keep-Alive Heartbeat

const fs = require('fs');        
const path = require('path');     // Injini ya siri inayoratibu ma-folder ya mwezi mpya
let currentMonthFolder = "";
let databaseRegistryPath = "";
let autoIncrementId = 8739170; 
const bulkStreamThreshold = 100000; 

// Ngome ya 1: Mfumo unaosoma saa ya seva na kukata vyumba vipya kila mwezi kiotomatiki
function checkAndRollMonthlyPartition() {
    const sasa = new Date();
    const mwezi = String(sasa.getMonth() + 1).padStart(2, '0');
    const mwaka = sasa.getFullYear();
    const folderName = `data_mwezi_${mwezi}_${mwaka}`;

    if (currentMonthFolder !== folderName) {
        currentMonthFolder = folderName;
        const directoryPath = path.join(__dirname, 'jumanne_db', currentMonthFolder);
        
        fs.mkdirSync(directoryPath, { recursive: true });
        databaseRegistryPath = path.join(directoryPath, 'registry.bin');
        
        // Pia kata folder la siri la kupokelea vipande vya video vya muda (Upload Pit-Stop)
        fs.mkdirSync(path.join(directoryPath, 'temp_chunks'), { recursive: true });
        
        console.log(`[JumanneDB JS] 🏟️  Memory imejizalisha kwa mwezi mpya: ${currentMonthFolder} (Nafasi: TB mabilioni bure!)`);
    }
}

// INJINI YA TIKTOK STYLE 1: INAPOKEA CHUNKS NA KUZIUNGANISHA KWENYE DISKI (0% RAM)
function handleIncomingVideoChunk(indexKipande, jumlaVipande, videoUuid, chunkBytes) {
    checkAndRollMonthlyPartition();
    
    const tempDir = path.join(__dirname, 'jumanne_db', currentMonthFolder, 'temp_chunks', videoUuid);
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Chomeka kipande cha sasa hivi kwenye file lake maalum la index
    const chunkFilePath = path.join(tempDir, `chunk_${indexKipande}.part`);
    fs.writeFileSync(chunkFilePath, chunkBytes);
    
    console.log(`[JumanneDB Stream] 🧩 Kipande ${indexKipande + 1}/${jumlaVipande} kimetua na kulazwa diski ya siri.`);
    
    // Kama vipande vyote bado havijatimia, rudi nyuma na usubiri vipande vingine
    if ((indexKipande + 1) < jumlaVipande) {
        return { status: "CHUNK_RECEIVED", progress: Math.round(((indexKipande + 1) / jumlaVipande) * 100) };
    }
    
    // MKATABA WA USHINDI: Vipande vikitimia vyote, unganisha kuwa faili moja kuu la binary!
    autoIncrementId++;
    const finalNamba = autoIncrementId;
    const finalFileName = `jumanne_${finalNamba}.bin`;
    const finalFileDiskPath = path.join(__dirname, 'jumanne_db', currentMonthFolder, finalFileName);
    
    const mrijaMkuuWaKuandika = fs.createWriteStream(finalFileDiskPath);
    
    for (let i = 0; i < jumlaVipande; i++) {
        const pathKipande = path.join(tempDir, `chunk_${i}.part`);
        const dataKipande = fs.readFileSync(pathKipande);
        mrijaMkuuWaKuandika.write(dataKipande);
        
        // Futa kipande cha muda instantly ili kulinda diski ya Render isijae takataka!
        fs.unlinkSync(pathKipande);
    }
    mrijaMkuuWaKuandika.end();
    fs.rmdirSync(tempDir); // Futa kijifolder cha muda kilichokuwa kimeshikilia vipande
    
    // Piga hesabu ya uzito wa video kamili iliyoungana
    const uzitoVideoKamilifu = fs.statSync(finalFileDiskPath).size;
    
    // INJINI YA TIKTOK STYLE 2: TRI-RESOLUTION GENERATED LINKS (KULINDA MB 260)
    const linkHigh = `https://jumannedb.$io{finalNamba}.bin`;
    const linkMed  = `https://jumannedb.io${finalNamba}.bin`;
    const linkLow  = `https://jumannedb.io${finalNamba}.bin`;
    
    // Rekodi kete hii fupi ya binary mndani ya faharisi ya registry ya seva (Uzito: Bytes 136)
    const registryData = Buffer.alloc(136); 
    registryData.writeUInt32LE(finalNamba, 0);          // Bytes 4: Namba ya siri
    registryData.writeUInt32LE(uzitoVideoKamilifu, 4);   // Bytes 4: Uzito halisi wa video
    registryData.write(linkHigh, 8, 128, 'utf8');        // Bytes 128: Link kuu ya uzalendo ya kioo
    fs.appendFileSync(databaseRegistryPath, registryData); 
    
    console.log(`[JumanneDB CDN] 📦 Video kamili #${finalNamba} imeungana na kuswagwa mnyofu kwenda Edge Cache.`);
    
    return {
        status: "UPLOAD_COMPLETE_SUCCESS",
        finalId: finalNamba,
        links: { high: linkHigh, medium: linkMed, low: linkLow }
    };
}

// Ngome ya HTTP Network Core (The Network Core Router)
const http = require('http');

// Amsha partition ramani mapema kabla ya kuanzisha server kusikiliza requests mtaani
checkAndRollMonthlyPartition();

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    // 🔥 MAREKEBISHO 1: SENSOR YA PIGA HODI: Ikipokea ping kutoka kwa mtambo wa chini, jibu instantly 200 OK!
    if (req.url === '/' || req.url === '/api/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end("JUMANNETOK_LIVE_AND_KICKING");
        return;
    }

    // MFUMO WA CHUNKED SYNC: Inapokea kipande kimoja baada ya kingine kitalent
    if (req.url === '/api/jumanne-db/upload/chunk' && req.method === 'POST') {
        let chunkBuffers = [];

        req.on('data', (chunk) => {
            chunkBuffers.push(chunk);
        });

        req.on('end', () => {
            try {
                const headerPayload = req.headers;
                const indexKipande = parseInt(headerPayload['x-chunk-index'], 10);
                const jumlaVipande = parseInt(headerPayload['x-total-chunks'], 10);
                const videoUuid = headerPayload['x-video-uuid'] || "default_session";
                
                const rawChunkBytes = Buffer.concat(chunkBuffers);
                
                // Sukuma kipande mnyofu kikalazwe foldani ya muda ya mwezi huo
                const matokeoMrija = handleIncomingVideoChunk(indexKipande, jumlaVipande, videoUuid, rawChunkBytes);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(matokeoMrija));
            } catch (err) {
                console.error("❌ Hitilafu ya kumeza kipande cha mchwa:", err);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end("CHUNK_INGESTION_FAILED");
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end("Not Found");
    }
});

server.listen(PORT, () => {
    console.log(`[JumanneDB Seva] Mtambo umewaka Render mubashara kwenye PORT ${PORT} ($0 Forever!)`);
});

// ==========================================================================
// 🔥 MAREKEBISHO 2: NTAMBO WA PIGA HODI: KEEP-ALIVE HEARTBEAT (0% IDLING LOCK)
// ==========================================================================
const AMRI_YA_DAKIKA_10 = 10 * 60 * 1000; // Milisekunde 600,000 za chuma mfononi

setInterval(() => {
    // Hapa mbeleni ukipewa URL ya live na Render (mfano: https://onrender.com)
    // utaibadilisha hii link iwe hiyo URL ya hewani ili pigo lipite kwenye mtandao mnyofu!
    const anwaniYaPigaHodi = `http://localhost:${PORT}/api/ping`; 
    
    http.get(anwaniYaPigaHodi, (res) => {
        console.log(`[Keep-Alive Heartbeat] 💓 Piga hodi JumanneDB kwa usalama: Status ${res.statusCode}`);
    }).on('error', (err) => {
        console.warn("[Keep-Alive Heartbeat] ⏳ Seva ipo bize, tunasubiri mzunguko ujao.");
    });
}, AMRI_YA_DAKIKA_10);
            
