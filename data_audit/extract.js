// Extract umkmData + zones from index.html, output JSON for audit
const fs = require('fs');
const html = fs.readFileSync('/home/marwhal/nk-canvass/index.html', 'utf8');

// Isolate the umkmData array block
const start = html.indexOf('const umkmData = [');
if (start === -1) { console.error('umkmData not found'); process.exit(1); }
const arrStart = html.indexOf('[', start);
// find matching closing bracket by scanning
let depth = 0, end = -1;
for (let i = arrStart; i < html.length; i++) {
  if (html[i] === '[') depth++;
  else if (html[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
}
const arrText = html.slice(arrStart, end + 1);
const umkmData = eval(arrText);

// zones array
const zStart = html.indexOf('const zones = [');
const zArrStart = html.indexOf('[', zStart);
depth = 0; let zEnd = -1;
for (let i = zArrStart; i < html.length; i++) {
  if (html[i] === '[') depth++;
  else if (html[i] === ']') { depth--; if (depth === 0) { zEnd = i; break; } }
}
const zones = eval(html.slice(zArrStart, zEnd + 1));

// Replicate app's zone assignment
const leads = umkmData.map((lead, index) => {
  let assignedZone = 'Zona 1 (Baros/Jalur)';
  for (const z of zones) {
    if (z.keywords.some(kw => lead.name.toLowerCase().includes(kw.toLowerCase()))) {
      assignedZone = z.name; break;
    }
  }
  return { id: index + 1, ...lead, zone: assignedZone };
});

fs.mkdirSync('/home/marwhal/nk-canvass/data_audit', { recursive: true });
fs.writeFileSync('/home/marwhal/nk-canvass/data_audit/umkm_data.json', JSON.stringify(leads, null, 2));
console.log('total entries:', leads.length);
console.log('categories:', JSON.stringify(leads.reduce((a, l) => (a[l.category] = (a[l.category] || 0) + 1, a), {})));
console.log('zones:', JSON.stringify(leads.reduce((a, l) => (a[l.zone] = (a[l.zone] || 0) + 1, a), {})));
console.log('strategies:', JSON.stringify(leads.reduce((a, l) => (a[l.strategy] = (a[l.strategy] || 0) + 1, a), {})));
