// Build final audit report: JSON + CSV + summary markdown
const fs = require('fs');
const DATA = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/umkm_data.json', 'utf8'));
const RES = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/verify_results.json', 'utf8'));
const resById = Object.fromEntries(RES.map(r => [r.id, r]));
const KW1 = ['baros','cipanengah','jalur','pelabuhan','nyomplong','degung','citamiang','cipendawa'];

function esc(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const rows = DATA.map(d => {
  const r = resById[d.id] || {};
  const flags = [];

  // ---- internal audit ----
  if (d.strategy === 'HIGH_LOW_REV' && d.rating < 5) flags.push('STRATEGY_MISMATCH');
  if (d.zone === 'Zona 1 (Baros/Jalur)' && !KW1.some(k => d.name.toLowerCase().includes(k))) flags.push('ZONE_FALLBACK');

  // ---- external audit ----
  let verdict = 'UNVERIFIED';
  if (r.cityFinal === 'Bandung' || r.cityFinal === 'Bogor' || r.cityFinal === 'Cianjur' || r.cityFinal === 'Garut') {
    verdict = 'WRONG_CITY'; flags.push('WRONG_CITY_' + r.cityFinal.toUpperCase());
  } else if (r.verified) {
    const dr = Math.abs((r.rating ?? 0) - d.rating);
    const pct = r.reviews !== undefined && d.reviews ? Math.abs(r.reviews - d.reviews) / d.reviews : 0;
    const lowConf = (r.address && !/sukabumi/i.test(r.address)) || (r.reviews <= 10 && d.reviews >= 50);
    if (dr >= 0.2) flags.push(`RATING_CLAIM_${d.rating}_AKTUAL_${r.rating}`);
    if (pct >= 0.5) flags.push(`REVIEW_CLAIM_${d.reviews}_AKTUAL_${r.reviews}`);
    if (lowConf) { verdict = 'LOW_CONFIDENCE_MATCH'; flags.push('GENERIC_QUERY_RESULT'); }
    else if (dr >= 0.2) verdict = 'RATING_OFF';
    else if (pct >= 0.5) verdict = 'REVIEW_OFF';
    else verdict = 'OK';
  }
  return {
    id: d.id, nama: d.name, kategori: d.category, zona: d.zone, strategi: d.strategy,
    claim_rating: d.rating, claim_reviews: d.reviews,
    actual_rating: r.rating ?? '', actual_reviews: r.reviews ?? '',
    kota_maps: r.cityFinal || '', alamat_maps: r.address || '',
    verdict, flags: flags.join('|'), alamat: r.address || ''
  };
});

const summary = rows.reduce((a, r) => (a[r.verdict] = (a[r.verdict] || 0) + 1, a), {});
fs.writeFileSync('/home/marwhal/nk-canvass/data_audit/audit_report.json',
  JSON.stringify({ generated: new Date().toISOString(), total: rows.length, verdict_summary: summary, entries: rows }, null, 2));

const headers = ['id','nama','kategori','zona','strategi','claim_rating','claim_reviews','actual_rating','actual_reviews','kota_maps','alamat_maps','verdict','flags'];
const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => esc(r[h])).join(','))).join('\n');
fs.writeFileSync('/home/marwhal/nk-canvass/data_audit/audit_report.csv', csv);
console.log('verdict summary:', JSON.stringify(summary, null, 2));
console.log('written: audit_report.json, audit_report.csv');
