// Generate js/data.js from final_dataset.json + transform index.html
const fs = require('fs');
const FINAL = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/final_dataset.json', 'utf8'));

// ---------- 1. Generate js/data.js ----------
const entries = FINAL.map(e => ({
  name: e.name,
  category: e.category,
  rating: e.rating,
  reviews: e.reviews,
  strategy: e.strategy,
  zone: e.zone,
  address: e.address || '',
  mapsUrl: e.mapsUrl,
}));

const header = `// ============================================================
// NEURALKATS CANVASSING HUB — Master Data UMKM Sukabumi
// Sumber: scrape fresh Google Maps ${new Date().toISOString().slice(0, 10)} (pipeline: data_audit/)
// Total: ${entries.length} UMKM
//
// CARA NAMBAH DATA:
// 1. Copy template di bawah, paste di akhir array:
//    { name: "Nama Usaha", category: "F&B", rating: 4.8, reviews: 123, zone: "Zona 4 (Jantung Kota)", address: "Jl. ...", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Nama+Usaha+Sukabumi" },
//    - category: F&B | Beauty | Automotive | Lodging | Health | Services | Education | Retail | Event | Tourism
//    - strategy: BOLEH DIKOSONGKAN (otomatis dari rating: 5.0 = HIGH_LOW_REV, selain itu UNDER_5)
//    - zone: opsional. Kalau kosong, app nebak dari keyword nama. Zona valid:
//      "Zona 1 (Baros/Jalur)" | "Zona 2 (Cisaat/Cibadak)" | "Zona 3 (Pusat Selatan)"
//      "Zona 4 (Jantung Kota)" | "Zona 5 (Timur/Utara)" | "Zona 6 (Ekspedisi Wisata)"
// 2. Refresh halaman. Selesai. Status/notes per ID lama aman (tersimpan di localStorage).
// ============================================================
window.UMKM_DATA = [
`;

const body = entries.map(e => {
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `  { name: "${esc(e.name)}", category: "${e.category}", rating: ${e.rating}, reviews: ${e.reviews}, strategy: "${e.strategy}", zone: "${e.zone}", address: "${esc(e.address)}", mapsUrl: "${e.mapsUrl}" },`;
}).join('\n');

fs.mkdirSync('/home/marwhal/nk-canvass/js', { recursive: true });
fs.writeFileSync('/home/marwhal/nk-canvass/js/data.js', header + body + '\n];\n');
console.log('js/data.js written:', entries.length, 'entries');

// ---------- 2. Transform index.html ----------
let html = fs.readFileSync('/home/marwhal/nk-canvass/index.html', 'utf8');

// a) replace umkmData block (from comment to closing "];" of the array)
const startMarker = '        // Master Dataset of 189 UMKMs Sukabumi';
const startIdx = html.indexOf(startMarker);
if (startIdx === -1) throw new Error('umkmData start marker not found');
// find "const umkmData = [" then its closing "];"
const arrDecl = html.indexOf('const umkmData = [', startIdx);
let depth = 0, closeIdx = -1;
for (let i = html.indexOf('[', arrDecl); i < html.length; i++) {
  if (html[i] === '[') depth++;
  else if (html[i] === ']') { depth--; if (depth === 0) { closeIdx = html.indexOf('];', i); break; } }
}
if (closeIdx === -1) throw new Error('umkmData closing not found');
const blockEnd = closeIdx + '];'.length;

const replacement = `        // Master Dataset — ${entries.length} UMKM Sukabumi
        // Data fresh hasil scrape Google Maps. Dikelola di js/data.js (cara nambah data ada di comment file itu).
        const umkmData = window.UMKM_DATA;`;
html = html.slice(0, startIdx) + replacement + html.slice(blockEnd + 1); // +1: eat trailing newline remnant

// b) add script tag for js/data.js before main script
html = html.replace('    <script>\n        // Master Dataset', '    <script src="js/data.js"></script>\n    <script>\n        // Master Dataset');

// c) leadsData: prefer zone from data, fallback keyword; auto-compute strategy if missing
const oldMap = `        const leadsData = umkmData.map((lead, index) => {
            let assignedZone = "Zona 1 (Baros/Jalur)";
            for (const z of zones) {
                if (z.keywords.some(kw => lead.name.toLowerCase().includes(kw.toLowerCase()))) {
                    assignedZone = z.name;
                    break;
                }
            }`;
const newMap = `        const leadsData = umkmData.map((lead, index) => {
            // Zona dari data (basis alamat Maps). Fallback: keyword nama -> default Jantung Kota.
            let assignedZone = lead.zone;
            if (!assignedZone) {
                assignedZone = "Zona 4 (Jantung Kota)";
                for (const z of zones) {
                    if (z.keywords.some(kw => lead.name.toLowerCase().includes(kw.toLowerCase()))) {
                        assignedZone = z.name;
                        break;
                    }
                }
            }`;
if (!html.includes(oldMap)) throw new Error('leadsData block not found');
html = html.replace(oldMap, newMap);

const oldStrategy = `                strategy: lead.strategy,`;
// find inside the leadsData return; safer: patch the return block
const oldReturn = `            return {
                id: id,
                ...lead,
                zone: assignedZone,
                mapsUrl: lead.link,
                status: savedStatusMap[id] || "UNVISITED",
                notes: savedNotesMap[id] || "",
                wa: savedWaMap[id] || ""
            };`;
const newReturn = `            return {
                id: id,
                ...lead,
                zone: assignedZone,
                strategy: lead.strategy || (lead.rating === 5.0 ? "HIGH_LOW_REV" : "UNDER_5"),
                mapsUrl: lead.mapsUrl || lead.link,
                status: savedStatusMap[id] || "UNVISITED",
                notes: savedNotesMap[id] || "",
                wa: savedWaMap[id] || ""
            };`;
if (!html.includes(oldReturn)) throw new Error('leadsData return not found');
html = html.replace(oldReturn, newReturn);

fs.writeFileSync('/home/marwhal/nk-canvass/index.html', html);
console.log('index.html transformed');
