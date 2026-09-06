// Merge v1 + v2 + replacements -> FINAL dataset (accurate rating/reviews/zone)
const fs = require('fs');
const V1 = Object.fromEntries(JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/verify_results.json', 'utf8')).map(r => [r.id, r]));
const V2 = Object.fromEntries(JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/verify_results_v2.json', 'utf8')).map(r => [r.id, r]));
const DATA = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/umkm_data.json', 'utf8'));

// Per-ID overrides where v2 list-pick was wrong/collided; value: {rating, reviews, source}
// decision log (see conversation): prefer v1 direct-panel over v2 name-mismatched/tiny collisions
const OVERRIDES = {
  28:  { rating: 4.8, reviews: 419,  src: 'v1-panel (Dr Metz Skincare Jl. Bhayangkara; v2 pick = cabang Cibadak, beda usaha)' },
  45:  { rating: 4.3, reviews: 711,  src: 'v1-panel (Cuci Steam @ Jl. Pelabuhan II 711 rev; v2 pick KPM Carwash 4 rev, venue kecil)' },
  82:  { rating: 5.0, reviews: 15,   src: 'v1-panel (Villa Mochi Classic; v2 pick duplikat listing "Private Private")' },
  108: { rating: 4.9, reviews: 32,   src: 'REPLACED-listing (Service mesin cuci Sukabumi @ Jl. Sukamanah 141; v1 salah resolve ke SERVICE KULKAS)' },
  111: { rating: 5.0, reviews: 104,  src: 'v1-panel (AA LAUNDRY @ Jl. Letda Asmita; v2 pick "Aa Laundry" lain 1 rev)' },
  125: { rating: 4.9, reviews: 28,   src: 'v1-panel (Bimbel ILC; v2 pick listing ILC lain 3 rev)' },
  120: { rating: 4.6, reviews: 139,  src: 'v1-panel (VANSERVIS; v2 no pick)' },
  143: { rating: 4.7, reviews: 10,   src: 'v1-panel (Kelana; v2 no pick; claim 530 SANGAT meleset)' },
  178: { rating: 4.4, reviews: 27,   src: 'v1-panel (Story Land @ alamat benar; hanya 27 rev — kemungkinan listing duplikat, perlu cek manual)' },
  186: { rating: 4.6, reviews: 1806, src: 'v2-pick (Cidahu Camping Ground)' },
  1:   { rating: 5.0, reviews: 1,    src: 'REPLACED (Ayam Goreng SS Super Sambal Sukabumi @ Jl. Royal Kabandungan; entry lama = tempat di BANDUNG)' },
  83:  { rating: 4.8, reviews: 22,   src: 'REPLACED (APOTEK AFIAT FARMA SUKABUMI @ Jl. Karamat; entry lama Apotek Utari = Bandung)' },
};

const NAME_OVERRIDE = {
  1: 'Ayam Goreng SS Super Sambal Sukabumi',
  83: 'APOTEK AFIAT FARMA SUKABUMI',
  108: 'Service mesin cuci Sukabumi',
};
const QUERY_OVERRIDE = {
  1: 'Ayam Goreng SS Super Sambal Sukabumi',
  83: 'Apotek Afiat Farma Sukabumi',
  108: 'Service mesin cuci Sukabumi',
};

// ---------- ZONE ASSIGNMENT ----------
// Basis: kecamatan/jalan dari alamat hasil scrape -> zona; fallback keyword nama (aturan asli); fallback terakhir best-guess
const ZONE_RULES = [
  { zone: 'Zona 6 (Ekspedisi Wisata)', re: /cidahu|situgunung|situ gunung|tanakita|sukaraja|santa ?sea|batutapak|batu tapak|dinopark|milkyverse|de'? ?tani|pilar mas|cikakak|cisaat barat/i, basis: 'alamat/keyword-wisata' },
  { zone: 'Zona 2 (Cisaat/Cibadak)', re: /kec\.?\s*cisaat|cisaat|cibadak|cikiray|nagrak|caringin|kadudampit|cicurug|cibolang|cikembar|parungkuda|sukamanah/i, basis: 'alamat/keyword' },
  { zone: 'Zona 5 (Timur/Utara)', re: /ryzzy|sukalarang|cibeureum|kosasih|subang ?jaya|selabintana|taman sari|cimanggu/i, basis: 'alamat/keyword' },
  { zone: 'Zona 1 (Baros/Jalur)', re: /kec\.?\s*baros|baros|cipanengah|nyomplong|pelabuhan|citamiang|cipendawa|warudoyong|lembursitu|degung/i, basis: 'alamat/keyword' },
  { zone: 'Zona 3 (Pusat Selatan)', re: /gunungpuyuh|sriwidari|karamat|bhayangkara|sudirman|selabintana road|kartini/i, basis: 'alamat/keyword' },
  { zone: 'Zona 4 (Jantung Kota)', re: /kec\.?\s*cikole|cikole|ahmad yani|martadinata|suryakencana|ciaul|otista|otto iskandardinata|pajagalan|veteran|siliwangi|asmita|babakan garung|mahmud/i, basis: 'alamat/keyword' },
];

function pickZone(entry, address) {
  const hay = (entry.name + ' ' + (address || '')) || '';
  for (const r of ZONE_RULES) if (r.re.test(hay)) return r;
  return null;
}

// ---------- BUILD ----------
const out = [];
const issues = [];
for (const d of DATA) {
  const v2 = V2[d.id] || {};
  const v1 = V1[d.id] || {};
  let rating, reviews, address, srcNote, replaced = false;

  if (OVERRIDES[d.id]) {
    ({ rating, reviews, src: srcNote } = OVERRIDES[d.id]);
    replaced = !!NAME_OVERRIDE[d.id];
    address = (v2.address && !NAME_OVERRIDE[d.id]) ? v2.address : (v1.address || v2.address || '');
    if (NAME_OVERRIDE[d.id]) address = (d.id === 83) ? 'Jl. Karamat Kelurahan No.130, RT.01/RW.04, Karamat, Kec. Gunungpuyuh, Kota Sukabumi' : (d.id === 1) ? 'Jl. Royal Kabandungan No.9 Blok C, Sukabumi' : 'Jl. Sukamanah No.141, Sukabumi';
  } else if (v2.mode === 'panel' && v2.rating !== undefined && v2.reviews !== undefined) {
    rating = v2.rating; reviews = v2.reviews; address = v2.address || ''; srcNote = 'v2-panel';
  } else if (v2.picked && v2.picked.rating !== undefined) {
    rating = v2.picked.rating; reviews = v2.picked.reviews; address = v2.picked.address || ''; srcNote = 'v2-listpick';
  } else if (v1.verified) {
    rating = v1.rating; reviews = v1.reviews; address = v1.address || ''; srcNote = 'v1-fallback';
  } else {
    rating = d.rating; reviews = d.reviews; address = ''; srcNote = 'UNRESOLVED-keep-old';
    issues.push(`#${d.id} ${d.name}: gak ke-resolve, data lama dipertahankan`);
  }

  const name = NAME_OVERRIDE[d.id] || d.name;
  const query = QUERY_OVERRIDE[d.id] || decodeURIComponent(d.link.split('query=')[1]).replace(/\+/g, ' ');
  const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
  const strategy = rating === 5.0 ? 'HIGH_LOW_REV' : 'UNDER_5';

  const zr = pickZone({ name }, address);
  let zone, zoneBasis;
  if (zr) { zone = zr.zone; zoneBasis = zr.basis; }
  else { zone = 'Zona 4 (Jantung Kota)'; zoneBasis = 'FALLBACK-kota (alamat minim)'; issues.push(`#${d.id} ${name}: zona fallback (alamat gak spesifik) -> Zona 4`); }

  out.push({ id: d.id, name, category: d.category, rating, reviews, strategy, zone, zoneBasis, address, source: srcNote, mapsUrl, replaced });
}

fs.writeFileSync('/home/marwhal/nk-canvass/data_audit/final_dataset.json', JSON.stringify(out, null, 2));

// summary
const strat = out.reduce((a, x) => (a[x.strategy] = (a[x.strategy] || 0) + 1, a), {});
const zones = out.reduce((a, x) => (a[x.zone] = (a[x.zone] || 0) + 1, a), {});
const srcs = out.reduce((a, x) => (a[x.source.split(' ')[0]] = (a[x.source.split(' ')[0]] || 0) + 1, a), {});
console.log('total:', out.length);
console.log('strategies:', JSON.stringify(strat));
console.log('zones:', JSON.stringify(zones, null, 2));
console.log('sources:', JSON.stringify(srcs));
console.log('\nISSUES (' + issues.length + '):');
issues.forEach(i => console.log('  ' + i));
console.log('\nREPLACED entries:');
out.filter(x => x.replaced).forEach(x => console.log(`  #${x.id} -> ${x.name} (${x.rating}/${x.reviews})`));
