// @ts-check
/**
 * Assegna il prezzo "Sane" (src/data/sane-prices.json, dal PDF Sane Magical Prices)
 * agli oggetti di items.json che non hanno un sanePrice reale (vuoto o stimato dalla rarità).
 * I prezzi reali già presenti non vengono toccati: le differenze col PDF sono solo segnalate.
 */
import { readFileSync, writeFileSync } from 'fs';

const ITEMS_PATH = 'src/data/items.json';
const SANE_PATH  = 'src/data/sane-prices.json';

/** Nome nel PDF → nomi in items.json, dove l'abbinamento automatico non basta */
const ALIAS = {
  'Ammunition +1 (each)':          ['Ammunition +1 (Ea)'],
  'Prayer Bead - Bless':           ['Necklace Of Prayer Beads (Blessing)'],
  'Prayer Bead - Smiting':         ['Necklace Of Prayer Beads (Smiting)'],
  'Prayer Bead - Curing':          ['Necklace Of Prayer Beads (Curing)'],
  'Prayer Bead - Favor':           ['Necklace Of Prayer Beads (Favor)'],
  'Prayer Bead Summons':           ['Necklace Of Prayer Beads (Summons)'],
  'Prayer Bead Wind Walking':      ['Necklace Of Prayer Beads (Wind Walking)'],
  'Sunblade':                      ['Sun Blade (longsword)', 'Sun Blade'],
  'Luckstone':                     ['Stone Of Good Luck (Luckstone)', 'Stone of Good Luck'],
  'Helm of Comprehend Languages':  ['Helm of Comprehending Languages'],
  'Horseshoes of the Zephyr':      ['Horseshoes of a Zephyr'],
  'Necklace of Adaption':          ['Necklace of Adaptation'],
  'Instrument of the Bards - Fochulan Bandlore':
    ['Instrument of the Bards (Fochulan Bandore)', 'Instrument of the Bards, Fochlucan Bandore'],
  'Ivory Goat(Travail)':           ['Figurine of Wondrous Power (Ivory Goats - Travail)'],
  'Ivory Goat (Traveling)':        ['Figurine of Wondrous Power (Ivory Goats - Travelling)'],
  'Ivory Goat(Terror)':            ['Figurine of Wondrous Power (Ivory Goats - Terror)'],
  'Goldean Lion (ea)':             ['Figurine of Wondrous Power (Golden Lions)', 'Figurine of Wondrous Power, Golden Lions'],
  'Potion of Greater Healing':     ['Potion Of Healing (Greater)'],
  'Potion of Superior Healing':    ['Potion Of Healing (Superior)'],
  'Potion of Supreme Healing':     ['Potion Of Healing (Supreme)'],
  'Spell Scroll Level 0':          ['Spell Scroll (Cantrip)'],
};
const BEADS = ['One bead', 'Two beads', 'Three beads', 'Four beads', 'Five beads', 'Six beads'];
BEADS.forEach((b, i) => { ALIAS[`Necklace of Fireballs (${b})`] = [`Necklace of Fireballs (${i + 1} Bead${i ? 's' : ''})`]; });
for (const f of ['Onyx Dog', 'Silver Raven', 'Marble Elephant', 'Ebony Fly', 'Bronze Griffon', 'Serpentine Owl', 'Obsidian Steed'])
  ALIAS[f] = [`Figurine of Wondrous Power (${f})`, `Figurine of Wondrous Power, ${f}`];
for (const h of ['Silver', 'Brass', 'Bronze', 'Iron'])
  ALIAS[`${h} Horn of Valhalla`] = [`Horn Of Valhalla (${h})`, `Horn of Valhalla, ${h}`];
for (const n of [1, 2, 3]) for (const w of ['Weapon', 'Armor', 'Shield'])
  ALIAS[`+${n} ${w}`] = [`${w}, +${n}`];

/** Fonti coperte dal PDF: solo qui sono ammessi abbinamenti "larghi" */
const DMG_SOURCES = new Set(['DMG', 'XDMG']);

const norm = s => s.toLowerCase().replace(/['’`]/g, '').replace(/[^a-z0-9+]+/g, ' ').trim();
const num  = v => Number(String(v).replace(/[^0-9.]/g, ''));
const fmt  = n => n.toLocaleString('en-US');

/** Varianti di nome: "Frost Brand (any sword)" → "frost brand", "Ioun Stone, Agility" → "agility ioun stone" */
function looseKeys(name) {
  const keys = [];
  const paren = name.match(/^(.*?)\s*\(([^)]*)\)$/);
  if (paren) keys.push(norm(paren[1]));
  const comma = name.match(/^(.*),\s*([^,]+)$/);
  if (comma) keys.push(norm(`${comma[2]} ${comma[1]}`));
  return keys;
}

const items = JSON.parse(readFileSync(ITEMS_PATH, 'utf-8'));
const sane  = JSON.parse(readFileSync(SANE_PATH, 'utf-8'));

const aliasByKey = new Map(Object.entries(ALIAS).map(([k, v]) => [norm(k), v]));

const exact = new Map();
const loose = new Map();
for (const item of items) {
  const k = norm(item.name);
  if (!exact.has(k)) exact.set(k, []);
  exact.get(k).push(item);
  if (!DMG_SOURCES.has(item.source)) continue;
  for (const lk of looseKeys(item.name)) {
    if (!loose.has(lk)) loose.set(lk, []);
    loose.get(lk).push(item);
  }
}

/** item.id → { entry, strong } — un match esatto/alias vince su uno "largo" */
const assigned = new Map();
const unmatched = [];
for (const entry of sane) {
  const strong = [...(exact.get(norm(entry.name)) ?? [])];
  for (const alias of aliasByKey.get(norm(entry.name)) ?? []) {
    const found = exact.get(norm(alias));
    if (!found) console.warn(`[sane] alias non trovato: "${alias}"`);
    else strong.push(...found);
  }
  const weak = loose.get(norm(entry.name)) ?? [];
  if (!strong.length && !weak.length) unmatched.push(entry.name);

  for (const item of strong) assigned.set(item.id, { entry, strong: true });
  for (const item of weak) if (!assigned.get(item.id)?.strong) assigned.set(item.id, { entry, strong: false });
}

let filled = 0, same = 0;
const diffs = [];
for (const item of items) {
  const match = assigned.get(item.id);
  if (!match) continue;
  const { price } = match.entry;
  const hasReal = item.sanePrice != null && item.sanePrice !== '' && !item.priceEstimated;
  if (!hasReal) {
    item.sanePrice = fmt(price);
    item.priceEstimated = false;
    filled++;
  } else if (num(item.sanePrice) === price) {
    same++;
  } else {
    diffs.push(`  ${item.name} [${item.source}]: ${item.sanePrice} (dati) vs ${fmt(price)} (PDF)`);
  }
}

writeFileSync(ITEMS_PATH, JSON.stringify(items, null, 2), 'utf-8');

console.log(`[sane] ${sane.length} voci PDF → ${assigned.size} oggetti abbinati`);
console.log(`[sane] prezzi assegnati: ${filled}, già uguali: ${same}, diversi (non modificati): ${diffs.length}`);
if (unmatched.length) console.log(`[sane] voci PDF senza oggetto: ${unmatched.join(', ')}`);
if (diffs.length) console.log(diffs.join('\n'));
