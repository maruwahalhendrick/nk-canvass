// Merge niche generik: final_dataset_full.json + <NICHE_FILE> -> final_dataset_full.json
// Env: NICHE_FILE (wajib), NICHE_NAME (kategori), NICHE_EXCLUDE (nama persis, pipe-sep, opsional)
// City gate ketat + zona dari alamat + ID auto lanjut.
const fs = require('fs');
const FILE = '/home/marwhal/nk-canvass/data_audit/final_dataset_full.json';
const OLD = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const NEW = JSON.parse(fs.readFileSync(process.env.NICHE_FILE, 'utf8'));
const CAT = process.env.NICHE_NAME || 'Lainnya';
const EXCLUDE = new Set((process.env.NICHE_EXCLUDE || '').split('|').filter(Boolean).map(s => s.toLowerCase()));

const ZONE_RULES = [
  { zone: 'Zona 6 (Ekspedisi Wisata)', re: /cidahu|situgunung|situ gunung|tanakita|sukaraja|santa ?sea|batutapak|batu tapak|dinopark|milkyverse|de'? ?tani|pilar mas|cikakak|cisaat barat/i },
  { zone: 'Zona 2 (Cisaat/Cibadak)', re: /kec\.?\s*cisaat|cisaat|cibadak|cikiray|nagrak|caringin|kadudampit|cicurug|cibolang|cikembar|parungkuda|sukamanah|selajambe/i },
  { zone: 'Zona 5 (Timur/Utara)', re: /ryzzy|sukalarang|cibeureum|kosasih|subang ?jaya|selabintana|taman sari|cimanggu/i },
  { zone: 'Zona 1 (Baros/Jalur)', re: /kec\.?\s*baros|baros|cipanengah|nyomplong|pelabuhan|citamiang|warudoyong|lembursitu|degung|nanggeleng/i },
  { zone: 'Zona 3 (Pusat Selatan)', re: /gunungpuyuh|sriwidari|karamat|bhayangkara|sudirman|selabintana road|kartini/i },
  { zone: 'Zona 4 (Jantung Kota)', re: /kec\.?\s*cikole|cikole|ahmad yani|martadinata|suryakencana|ciaul|otista|otto iskandardinata|pajagalan|veteran|siliwangi|asmita|babakan garung|mahmud|alun-alun|gunungparang|cikundul|merdeka|pabuaran/i },
];
function pickZone(name, address) {
  const hay = (name + ' ' + (address || ''));
  // Pitfall: "Sukaraja" ada 2 (kelurahan Cibeureum = Zona 5 vs wisata Cisaat = Zona 6).
  // Kalau alamat nyebut Cibeureum, Zona 5 menang. Kalau nyebut Cisaat, biarkan Zona 6 match.
  if (/cibeureum/i.test(hay)) {
    for (const r of ZONE_RULES) if (r.zone.startsWith('Zona 5') && r.re.test(hay)) return r.zone;
  }
  for (const r of ZONE_RULES) if (r.re.test(hay)) return r.zone;
  return 'Zona 4 (Jantung Kota)';
}

const added = [], skipped = [];
let nextId = OLD.length + 1;
const usedNames = new Set(OLD.map(o => o.name.toLowerCase()));

for (const n of NEW) {
  if (!n.name || n.rating === undefined) { skipped.push(`${n.name}: no data`); continue; }
  if (EXCLUDE.has(n.name.toLowerCase())) { skipped.push(`${n.name}: exclude (dup/out-of-niche)`); continue; }
  const addr = n.address || '';
  const listed = n.listedAddress || '';
  const cityOk = n.city === 'Sukabumi' || n.city === 'Sukabumi?' || (n.city === 'unknown' && /sukabumi/i.test(listed));
  if (!cityOk) { skipped.push(`${n.name}: ${n.city}${addr ? ' | ' + addr.slice(0, 55) : ''}`); continue; }
  if (usedNames.has(n.name.toLowerCase())) { skipped.push(`${n.name}: duplikat nama`); continue; }
  usedNames.add(n.name.toLowerCase());

  const query = (/sukabumi/i.test(n.name) ? n.name : n.name + ' sukabumi');
  added.push({
    id: nextId++,
    name: n.name,
    category: CAT,
    rating: n.rating,
    reviews: n.reviews ?? n.listedReviews ?? 0,
    strategy: n.rating === 5.0 ? 'HIGH_LOW_REV' : 'UNDER_5',
    zone: pickZone(n.name, addr),
    address: addr,
    phone: n.phone || '',
    phoneType: n.phoneType || '',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query),
    source: 'niche-scrape',
  });
}

const FULL = OLD.concat(added);
fs.writeFileSync(FILE, JSON.stringify(FULL, null, 2));
console.log(`TOTAL: ${FULL.length} (${added.length} ${CAT} baru, ${skipped.length} di-skip)`);
added.forEach(a => console.log(`  #${a.id} ${a.name} | ${a.rating} | ${a.reviews} rev | ${a.zone}`));
console.log('SKIPPED:');
skipped.forEach(s => console.log('  ' + s));
