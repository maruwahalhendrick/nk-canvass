// Generate js/data.js from final_dataset.json + phone_results.json (rerunnable)
const fs = require('fs');
const FINAL = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/final_dataset_full.json', 'utf8'));
const PHONES = fs.existsSync('/home/marwhal/nk-canvass/data_audit/phone_results.json')
  ? Object.fromEntries(JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/phone_results.json', 'utf8')).filter(r => r.phone).map(r => [r.id, r]))
  : {};

const entries = FINAL.map(e => {
  const p = PHONES[e.id] || (e.phone ? { phone: e.phone, phoneType: e.phoneType } : null);
  return {
    name: e.name,
    category: e.category,
    rating: e.rating,
    reviews: e.reviews,
    strategy: e.strategy,
    zone: e.zone,
    address: e.address || '',
    phone: p ? p.phone : '',
    phoneType: p ? p.phoneType : '',
    mapsUrl: e.mapsUrl,
  };
});

const withPhone = entries.filter(e => e.phone).length;
const header = `// ============================================================
// NEURALKATS CANVASSING HUB — Master Data UMKM Sukabumi
// Sumber: scrape fresh Google Maps ${new Date().toISOString().slice(0, 10)} (pipeline: data_audit/)
// Total: ${entries.length} UMKM | ${withPhone} ada nomor telepon (dari listing Maps publik)
//
// CARA NAMBAH DATA:
// 1. Copy template di bawah, paste di akhir array:
//    { name: "Nama Usaha", category: "F&B", rating: 4.8, reviews: 123, zone: "Zona 4 (Jantung Kota)", address: "Jl. ...", phone: "0812xxx", phoneType: "mobile", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Nama+Usaha+Sukabumi" },
//    - category: F&B | Beauty | Automotive | Lodging | Health | Services | Education | Retail | Event | Tourism
//    - strategy: BOLEH DIKOSONGKAN (otomatis dari rating: 5.0 = HIGH_LOW_REV, selain itu UNDER_5)
//    - zone: opsional. Kalau kosong, app nebak dari keyword nama. Zona valid:
//      "Zona 1 (Baros/Jalur)" | "Zona 2 (Cisaat/Cibadak)" | "Zona 3 (Pusat Selatan)"
//      "Zona 4 (Jantung Kota)" | "Zona 5 (Timur/Utara)" | "Zona 6 (Ekspedisi Wisata)"
//    - phone: opsional. phoneType: "mobile" (bisa WA) atau "landline" (telpon saja).
//      Kalau phoneType "mobile", tombol WA otomatis aktif kecuali lu isi No. WA manual di app.
// 2. Refresh halaman. Selesai. Status/notes/WA per ID lama aman (tersimpan di localStorage).
// ============================================================
window.UMKM_DATA = [
`;

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const body = entries.map(e => `  { name: "${esc(e.name)}", category: "${e.category}", rating: ${e.rating}, reviews: ${e.reviews}, strategy: "${e.strategy}", zone: "${e.zone}", address: "${esc(e.address)}", phone: "${e.phone}", phoneType: "${e.phoneType}", mapsUrl: "${e.mapsUrl}" },`).join('\n');

fs.writeFileSync('/home/marwhal/nk-canvass/js/data.js', header + body + '\n];\n');
console.log(`js/data.js written: ${entries.length} entries, ${withPhone} with phone`);
