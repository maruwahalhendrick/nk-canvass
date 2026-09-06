// Merge gaming: final_dataset_full.json (358) + gaming_final.json -> final_dataset_full.json
// ID baru mulai 359. City gate ketat (sama dengan merge_newcats.js). Kategori: Gaming.
const fs = require('fs');
const OLD = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/final_dataset_full.json', 'utf8'));
const NEW = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/gaming_final.json', 'utf8'));

const ZONE_RULES = [
  { zone: 'Zona 6 (Ekspedisi Wisata)', re: /cidahu|situgunung|situ gunung|tanakita|sukaraja|santa ?sea|batutapak|batu tapak|dinopark|milkyverse|de'? ?tani|pilar mas|cikakak|cisaat barat/i },
  { zone: 'Zona 2 (Cisaat/Cibadak)', re: /kec\.?\s*cisaat|cisaat|cibadak|cikiray|nagrak|caringin|kadudampit|cicurug|cibolang|cikembar|parungkuda|sukamanah|selajambe/i },
  { zone: 'Zona 5 (Timur/Utara)', re: /ryzzy|sukalarang|cibeureum|kosasih|subang ?jaya|selabintana|taman sari|cimanggu/i },
  { zone: 'Zona 1 (Baros/Jalur)', re: /kec\.?\s*baros|baros|cipanengah|nyomplong|pelabuhan|citamiang|cipendawa|warudoyong|lembursitu|degung/i },
  { zone: 'Zona 3 (Pusat Selatan)', re: /gunungpuyuh|sriwidari|karamat|bhayangkara|sudirman|selabintana road|kartini/i },
  { zone: 'Zona 4 (Jantung Kota)', re: /kec\.?\s*cikole|cikole|ahmad yani|martadinata|suryakencana|ciaul|otista|otto iskandardinata|pajagalan|veteran|siliwangi|asmita|babakan garung|mahmud|alun-alun/i },
];

function pickZone(name, address) {
  const hay = (name + ' ' + (address || ''));
  for (const r of ZONE_RULES) if (r.re.test(hay)) return r.zone;
  return 'Zona 4 (Jantung Kota)';
}

const added = [], skipped = [];
let nextId = OLD.length + 1; // 359
const usedNames = new Set(OLD.map(o => o.name.toLowerCase()));

for (const n of NEW) {
  if (!n.name || n.rating === undefined) { skipped.push(`${n.name}: no data`); continue; }
  const addr = n.address || '';
  const listed = n.listedAddress || '';
  const cityOk = n.city === 'Sukabumi' || n.city === 'Sukabumi?' || (n.city === 'unknown' && /sukabumi/i.test(listed));
  if (!cityOk) { skipped.push(`${n.name}: ${n.city}${addr ? ' | ' + addr.slice(0, 60) : ''}`); continue; }
  if (usedNames.has(n.name.toLowerCase())) { skipped.push(`${n.name}: duplikat nama`); continue; }
  usedNames.add(n.name.toLowerCase());

  const query = (/sukabumi/i.test(n.name) ? n.name : n.name + ' sukabumi');
  added.push({
    id: nextId++,
    name: n.name,
    category: 'Gaming',
    rating: n.rating,
    reviews: n.reviews ?? n.listedReviews ?? 0,
    strategy: n.rating === 5.0 ? 'HIGH_LOW_REV' : 'UNDER_5',
    zone: pickZone(n.name, addr),
    address: addr,
    phone: n.phone || '',
    phoneType: n.phoneType || '',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query),
    source: 'gaming-scrape',
  });
}

const FULL = OLD.concat(added);
fs.writeFileSync('/home/marwhal/nk-canvass/data_audit/final_dataset_full.json', JSON.stringify(FULL, null, 2));

const cat = FULL.reduce((a, x) => (a[x.category] = (a[x.category] || 0) + 1, a), {});
const zone = FULL.reduce((a, x) => (a[x.zone] = (a[x.zone] || 0) + 1, a), {});
console.log(`TOTAL: ${FULL.length} (${added.length} gaming baru, ${skipped.length} di-skip)`);
console.log('Gaming baru:');
added.forEach(a => console.log(`  #${a.id} ${a.name} | ${a.rating} | ${a.reviews} rev | ${a.zone}`));
console.log('\nSKIPPED:');
skipped.forEach(s => console.log('  ' + s));
