// Regenerate: node backend/tests/fixtures/gen_sonar_vectors.js docs/reference/Baytara_sonar_v6_2.html backend/tests/fixtures/sonar_vectors.json
// Runs the client's original calculator script against a stub DOM and records what it
// computed: the age per measurement (via makeBadge) and the averaged age (from the report).
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const fields = {};
const el = (id) => fields[id] || (fields[id] = { id, value: '', textContent: '', innerHTML: '', style: {},
  classList: { add() {}, remove() {} }, insertAdjacentHTML() {} });
global.document = { getElementById: el, createElement: () => ({}), body: { appendChild() {}, removeChild() {} } };
global.window = { scrollTo() {} };
global.alert = () => {};
const run = new Function(script + '\nreturn { calculateAndSave, setBadge: (f) => { makeBadge = f; }, report: () => sessionTextReport };');
const api = run();
let badges = [];
api.setBadge((label, val, age) => { badges.push(age); return ''; });
const ids = { vesicle: 'vesicle', eye_orbit: 'eyeOrbit', crl: 'crl', bpd: 'bpd', hl: 'hl', trunk: 'trunk', placentome: 'placentome' };
const values = [0.5, 1, 2.5, 3, 7.5, 10, 12.3, 18, 24, 25, 27.5, 28, 33, 40, 55, 80, 120, 250];
const out = [];
// What each species measures in the source (V6.2): the rest are hidden and ignored there.
const SMALL = ['canine_small', 'canine_large', 'feline'];
const uses = (species, m) => !(species === 'equine' && m === 'placentome')
  && !(SMALL.includes(species) && ['eye_orbit', 'hl', 'placentome'].includes(m));
for (const species of ['bovine', 'buffalo', 'equine', 'ovine', 'caprine', ...SMALL]) {
  for (const [measure, id] of Object.entries(ids)) {
    if (!uses(species, measure)) continue;
    for (const v of values) {
      Object.values(ids).forEach((x) => { el(x).value = ''; });
      el('species').value = species; el('animalId').value = 'x';
      el(id).value = String(v);
      badges = [];
      api.calculateAndSave();
      out.push({ species, measures: { [measure]: v }, ages: badges.slice(), age: Number(api.report().match(/العمر: (-?\d+)/)[1]) });
    }
  }
  // all measures together, to check the averaging
  for (const v of [3, 9.5, 21, 44]) {
    Object.entries(ids).forEach(([m, x]) => { el(x).value = uses(species, m) ? String(v) : ''; });
    el('species').value = species;
    badges = [];
    api.calculateAndSave();
    const measures = Object.fromEntries(Object.keys(ids).filter((m) => uses(species, m)).map((m) => [m, v]));
    out.push({ species, measures, ages: badges.slice(), age: Number(api.report().match(/العمر: (-?\d+)/)[1]) });
  }
}
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(out.length, 'vectors');
