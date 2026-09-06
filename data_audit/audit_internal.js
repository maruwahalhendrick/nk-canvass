const data = require('/home/marwhal/nk-canvass/data_audit/umkm_data.json');

console.log('=== 1. STRATEGY vs RATING CONSISTENCY ===');
const badHighLow = data.filter(d => d.strategy === 'HIGH_LOW_REV' && d.rating < 5.0);
const badUnder5 = data.filter(d => d.strategy === 'UNDER_5' && d.rating === 5.0);
console.log(`HIGH_LOW_REV tapi rating < 5.0 (kontradiksi label "Push Volume Rating 5.0"): ${badHighLow.length}`);
badHighLow.forEach(d => console.log(`  #${d.id} [${d.category}] ${d.name} — rating ${d.rating}, reviews ${d.reviews}`));
console.log(`UNDER_5 tapi rating 5.0: ${badUnder5.length}`);
badUnder5.forEach(d => console.log(`  #${d.id} ${d.name}`));

console.log('\n=== 2. DUPLICATES / NEAR-DUPLICATES ===');
const seen = {};
data.forEach(d => {
  const key = d.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  (seen[key] = seen[key] || []).push(d);
});
Object.entries(seen).filter(([k, v]) => v.length > 1).forEach(([k, v]) => {
  console.log(`DUP EXACT: ${v.map(x => `#${x.id} ${x.name}`).join(' | ')}`);
});
// near-dup: same first 3 words
const near = {};
data.forEach(d => {
  const key = d.name.toLowerCase().split(/\s+/).slice(0, 3).join(' ');
  (near[key] = near[key] || []).push(d);
});
Object.entries(near).filter(([k, v]) => v.length > 1).forEach(([k, v]) => {
  console.log(`NEAR-DUP (3 kata awal sama): ${v.map(x => `#${x.id} "${x.name}" (${x.reviews} rev)`).join(' | ')}`);
});

console.log('\n=== 3. NAMA GENERIK / MURNI GENERIC QUERY (rawan salah sasaran) ===');
const generic = data.filter(d => /^(Wedding Planner|Florist|Jaya Motor|Bengkel motor|Servis|Service|Catering Murah|Kampoeng|butler)/i.test(d.name) || d.name.split(/\s+/).length <= 2);
generic.forEach(d => console.log(`  #${d.id} [${d.category}] "${d.name}" link-query: ${decodeURIComponent(d.link.split('query=')[1])}`));

console.log('\n=== 4. LINK vs NAMA MISMATCH ===');
data.forEach(d => {
  const q = decodeURIComponent((d.link.split('query=')[1] || '')).replace(/\+/g, ' ').toLowerCase();
  const nm = d.name.toLowerCase();
  // name tokens (drop stopwords) missing from query
  const stop = new Set(['&', '-', 'x', 'dan', 'di', 'the', 'of']);
  const missing = nm.split(/[\s&-]+/).filter(t => t && !stop.has(t) && !q.includes(t));
  if (missing.length) console.log(`  #${d.id} "${d.name}" — query gak mengandung: ${missing.join(', ')} | query: "${q}"`);
});

console.log('\n=== 5. ANOMALI RATING/REVIEW ===');
data.filter(d => d.rating < 3 || d.rating > 5).forEach(d => console.log(`  #${d.id} ${d.name} rating ${d.rating} reviews ${d.reviews}`));
const sorted = [...data].sort((a, b) => a.reviews - b.reviews);
console.log('5 review terendah:', sorted.slice(0, 5).map(d => `${d.name}(${d.reviews})`).join(', '));
console.log('5 review tertinggi:', sorted.slice(-5).map(d => `${d.name}(${d.reviews})`).join(', '));

console.log('\n=== 6. ZONA: keyword match vs fallback ===');
const zona1 = data.filter(d => d.zone === 'Zona 1 (Baros/Jalur)');
console.log(`Zona 1 total ${zona1.length}, di antaranya nama yg BENAR2 mengandung keyword zona1 (Baros/Cipanengah/JALUR/Pelabuhan/Nyomplong/Degung/Citamiang/Cipendawa):`);
const kw1 = ['baros','cipanengah','jalur','pelabuhan','nyomplong','degung','citamiang','cipendawa'];
const trueZ1 = zona1.filter(d => kw1.some(k => d.name.toLowerCase().includes(k)));
console.log(`  -> hanya ${trueZ1.length}: ${trueZ1.map(d => d.name).join(', ') || '(kosong)'}`);
console.log(`  -> ${zona1.length - trueZ1.length} lainnya fallback (zona info gak berarti)`);

console.log('\n=== 7. KATEGORI vs NAMA Janggal ===');
const checks = [
  { cat: 'Retail', re: /(mochi|jajanan|bika|oleh-oleh|puding)/i, why: 'makanan di Retail' },
  { cat: 'Tourism', re: /(kids story|cafe)/i, why: '' },
];
// simple heuristic: names containing food terms but category not F&B
const foodTerms = /(mochi|bakery|cake|kopi|coffee|resto|rumah makan|jajanan|puding|bika|catering|burger|cheesecuit|sambal)/i;
const janggal = data.filter(d => foodTerms.test(d.name) && !['F&B', 'Retail'].includes(d.category));
janggal.forEach(d => console.log(`  #${d.id} [${d.category}] "${d.name}" — mengandung istilah F&B`));
