// Compare claimed data vs verified Google Maps data -> discrepancy report
const fs = require('fs');
const res = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/verify_results.json', 'utf8'));

const report = { generated: new Date().toISOString(), summary: {}, issues: [] };

const verified = res.filter(r => r.verified);
const cityMismatch = res.filter(r => r.cityMismatch);
const noResults = res.filter(r => r.noResults);
const errors = res.filter(r => r.error);
const captchas = res.filter(r => r.captcha);

report.summary = {
  total: res.length,
  verified: verified.length,
  cityMismatch: cityMismatch.length,
  noResults: noResults.length,
  errors: errors.length,
  captcha: captchas.length,
};

// rating/review discrepancy thresholds
const ratingOff = [], reviewOff = [];
for (const r of verified) {
  const dr = Math.abs((r.rating ?? 0) - r.claimed.rating);
  if (dr >= 0.2) ratingOff.push({ id: r.id, name: r.name, claimed: r.claimed.rating, actual: r.rating, delta: +(r.rating - r.claimed.rating).toFixed(1) });
  if (r.reviews !== undefined) {
    const diff = r.reviews - r.claimed.reviews;
    const pct = r.claimed.reviews ? diff / r.claimed.reviews : (r.reviews > 0 ? 1 : 0);
    if (Math.abs(pct) >= 0.5 || (r.claimed.reviews === 0 && r.reviews > 0)) {
      reviewOff.push({ id: r.id, name: r.name, claimed: r.claimed.reviews, actual: r.reviews, pct: +(pct * 100).toFixed(0) });
    }
  }
}
report.summary.ratingDiscrepancy = ratingOff.length;
report.summary.reviewDiscrepancy = reviewOff.length;

report.issues.push({ type: 'CITY_MISMATCH', count: cityMismatch.length, items: cityMismatch.map(r => ({ id: r.id, name: r.name, address: r.address })) });
report.issues.push({ type: 'RATING_OFF', count: ratingOff.length, items: ratingOff });
report.issues.push({ type: 'REVIEW_OFF', count: reviewOff.length, items: reviewOff });
report.issues.push({ type: 'NO_RESULTS', count: noResults.length, items: noResults.map(r => ({ id: r.id, name: r.name })) });
if (errors.length) report.issues.push({ type: 'ERRORS', count: errors.length, items: errors.map(r => ({ id: r.id, name: r.name, error: r.error })) });
if (captchas.length) report.issues.push({ type: 'CAPTCHA', count: captchas.length, items: captchas.map(r => ({ id: r.id, name: r.name })) });

// unresolved (isPlace false but verified via panel) — informational
const notPlace = res.filter(r => !r.isPlace && r.verified);
report.summary.resolvedViaSearchPanel = notPlace.length;

fs.writeFileSync('/home/marwhal/nk-canvass/data_audit/discrepancy_report.json', JSON.stringify(report, null, 2));

// human-readable
console.log('=== SUMMARY ===');
console.log(JSON.stringify(report.summary, null, 2));
console.log('\n=== CITY MISMATCH (bukan Sukabumi!) ===');
cityMismatch.forEach(r => console.log(` #${r.id} ${r.name}\n    -> ${r.address}`));
console.log('\n=== RATING BERBEDA (delta >= 0.2) ===');
ratingOff.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).forEach(r => console.log(` #${r.id} ${r.name}: claim ${r.claimed} vs aktual ${r.actual} (${r.delta > 0 ? '+' : ''}${r.delta})`));
console.log('\n=== REVIEW MELESET (>=50%) ===');
reviewOff.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 40).forEach(r => console.log(` #${r.id} ${r.name}: claim ${r.claimed} vs aktual ${r.actual} (${r.pct > 0 ? '+' : ''}${r.pct}%)`));
if (noResults.length) console.log('\n=== TIDAK KETEMU DI MAPS ===');
noResults.forEach(r => console.log(` #${r.id} ${r.name}`));
