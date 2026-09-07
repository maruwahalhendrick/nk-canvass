// Merge hasil phone_rescrape_niche.json -> phone_results.json -> regen data.js + CSV
// Rules:
//  - cuma entry processed dengan phone valid (9-13 digit) yang masuk
//  - nameScore >= 0.5 (panel = bisnis yang bener), kalau rendah -> skip konservatif
//  - jangan overwrite entry phone_results.json yang udah punya nomor
//  - nomor manual user di app (localStorage) gak tersentuh — effectiveWa() menang
const fs = require('fs');

const BASE = '/home/marwhal/nk-canvass/data_audit';
const rescrape = JSON.parse(fs.readFileSync(`${BASE}/phone_rescrape_niche.json`, 'utf8'));
const phones = JSON.parse(fs.readFileSync(`${BASE}/phone_results.json`, 'utf8'));

const valid = rescrape.filter(r => r.processed && r.phone && r.phone.length >= 9 && r.phone.length <= 13 && (r.nameScore === undefined || r.nameScore >= 0.5));
const rejectedJunk = rescrape.filter(r => r.processed && r.phone && (r.phone.length < 9 || r.phone.length > 13));
const lowMatch = rescrape.filter(r => r.processed && r.phone && r.phone.length >= 9 && (r.nameScore !== undefined && r.nameScore < 0.5));

const existing = new Map(phones.map(p => [p.id, p]));
let added = 0, skippedExisting = 0;
valid.forEach(r => {
  const ex = existing.get(r.id);
  if (ex && ex.phone) { skippedExisting++; return; }
  existing.set(r.id, { id: r.id, name: r.name, processed: true, phone: r.phone, phoneType: r.phoneType, phoneRaw: r.phoneRaw, source: 'rescrape_niche' });
  added++;
});

const merged = [...existing.values()].sort((a, b) => a.id - b.id);
fs.writeFileSync(`${BASE}/phone_results.json`, JSON.stringify(merged, null, 2));
console.log(`rescrape: ${rescrape.filter(r => r.processed).length} processed | valid ${valid.length} | added ${added} | skipExisting ${skippedExisting}`);
console.log(`junk rejected: ${rejectedJunk.length} ${JSON.stringify(rejectedJunk.map(r => ({ id: r.id, ph: r.phone })))}`);
console.log(`lowMatch skipped: ${lowMatch.length} ${JSON.stringify(lowMatch.map(r => ({ id: r.id, sc: r.nameScore })))}`);
console.log(`phone_results.json total dengan nomor: ${merged.filter(p => p.phone).length}`);
