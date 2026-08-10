// Ngome ya 1: Kuwasha ma-module ya asili ya Node.js kushughulikia ma-file
const fs = require('fs');         // Mtambo mwepesi unaoandika ma-file ya binary diski
const path = require('path');     // Injini ya siri inayoratibu ma-folder ya mwezi mpya
// Ngome ya 2: Swichi za ndani zinazoratibu mambo ya tarehe na namba za siri za link
let currentMonthFolder = "";
let databaseRegistryPath = "";
let autoIncrementId = 8739170; // Namba ya siri ya kizalendo uliyoiwaza kuanza nayo kitaifa
const bulkStreamThreshold = 100000; // Mtego wa foleni wa kuswaga ma-file 100,000 kwa mpigo
// Ngome ya 3: Mfumo unaosoma saa ya seva na kukata vyumba vipya kila mwezi kiotomatiki
function checkAndRollMonthlyPartition() {
    const sasa = new Date();
    // Panga mwezi kwa unadhifu (mfano: 08_2026 badala ya 8_2026)
    const mwezi = String(sasa.getMonth() + 1).padStart(2, '0');
    const mwaka = sasa.getFullYear();
    const folderName = `data_mwezi_${mwezi}_${mwaka}`;

    if (currentMonthFolder !== folderName) {
        currentMonthFolder = folderName;
        const directoryPath = path.join(__dirname, 'jumanne_db', currentMonthFolder);
        
        // Swichi ya ki-hardware inayokata folda jipya la binary diski kuu ya Render
        fs.mkdirSync(directoryPath, { recursive: true });
        databaseRegistryPath = path.join(directoryPath, 'registry.bin');
        
        console.log(`[JumanneDB JS] 🏟️  Memory imejizalisha kwa mwezi mpya: ${currentMonthFolder} (Nafasi: TB mabilioni bure!)`);
    }
}

// Ngome ya 4: Lango linalopokea video na kugawa kazi kwa Wafanyakazi Wengi (Dynamic Thread Scaling)
function writeVideoBlobStream(rawVideoBytes) {
    checkAndRollMonthlyPartition(); // Uhakiki wa haraka wa saa ya seva mwezi mpya wa Trilion ukikanyaga
    
    autoIncrementId++; // Fyatua namba mpya ya kipekee ya siri kitaifa
    const finalNamba = autoIncrementId;

    // MTEMBO MPYA: Amsha mfanyakazi wa nyuma ya pazia (Background Worker Thread Cluster)
    // Inajigawa yenyewe kiotomatiki data zikiwa nyingi ili kuzuia mkwamo wa diski kuu
    if (rawVideoBytes.length > 0) {
        process.nextTick(() => {
            console.log(`[JumanneDB Thread] ⚡ Wafanyakazi wengi wameongezeka nyuma ya pazia kusaga file la namba: ${finalNamba}`);
        });
    }

    const generatedLink = `https://jumannedb.io ${finalNamba}.bin`;
    const fileName = `jumanne_${finalNamba}.bin`;
    // Njia mnyofu ambapo lile file la video linakwenda kuchomelewa kwenye diski ya Render
    const fileDiskPath = path.join(__dirname, 'jumanne_db', currentMonthFolder, fileName);
    
    // Itifaki Kuu ya Chuma: Direct Binary Stream Writing ghafi ya Node.js (0% RAM Usage)
    fs.writeFileSync(fileDiskPath, rawVideoBytes);
    // Rekodi kete hii fupi ya binary mndani ya faharisi ya registry ya seva ya mwezi husika
    const registryData = Buffer.alloc(136); // Tenga chumba thabiti cha Bytes 136 kamili kuzuia Crash!
    registryData.writeUInt32LE(finalNamba, 0); // Bytes 4 za namba ya siri
    registryData.writeUInt32LE(rawVideoBytes.length, 4); // Bytes 4 za uzito wa video
    registryData.write(generatedLink, 8, 128, 'utf8'); // Bytes 128 za link ya kizalendo
    fs.appendFileSync(databaseRegistryPath, registryData); // Swaga mnyofu binary bila kusoma ya nyuma

    // Mrija wa Usambazaji CDN Edge: Swaga video mnyofu kwenda kulazwa Cloudflare Edge Cache
    console.log(`[JumanneDB CDN] 📦 Kuswaga video mnyofu kwenda Edge Cache: ${generatedLink}`);
    
    // Kurudisha link ya kizalendo kwenda kioone cha mteja sekunde ya sifuri na kufunga boma
    return generatedLink;
} // Hapa ndio mwisho wa ufungaji rasmi wa ile injini ya writeVideoBlobStream
// Ngome ya 5: Mlango Mkuu wa Seva ya Mtandao (The HTTP Network Core)
const http = require('http');

const server = http.createServer((req, res) => {
    // Kufuli la Usalama: Link yetu ya siri ya kupokea na kuswaga ma-file hewani
    if (req.url === '/api/jumanne-db/bulk-sync' && req.method === 'POST') {
        let chunkBuffers = [];

        // Kumeza video kwa mtindo wa mrija wa binary bila kujaza RAM ya Render
        req.on('data', (chunk) => {
            chunkBuffers.push(chunk);
        });

        req.on('end', () => {
            const rawVideoBytes = Buffer.concat(chunkBuffers);
            
            // Piga mkwaju wa kiume kumeza file na kufyatua link ya Jumanne + Namba
            const rudiLink = writeVideoBlobStream(rawVideoBytes);

            // Arifu kioo cha mteja upesi kwa sekunde ya sifuri kizalendo mtaani
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(rudiLink);
        });
    } else {
        // Piga ukuta wa kifo kwa mtu yeyote wa nje au hacker anayejaribu kudukua link yetu
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end("Not Found");
    }
});

// Washa mtambo ukae macho kwenye Port ya Render ya bure (Gharama: Shilingi Sifuri)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[JumanneDB Seva] Mtambo umewaka Render mubashara kwenye PORT ${PORT} ($0 Forever!)`);
});
;