/**
 * fetch-data.mjs
 * Merge CSV pricing data + 5etools descriptions (IT + EN) into src/data/items.json
 * Also adds all 5etools items NOT in the CSV, with estimated prices.
 *
 * Run: node scripts/fetch-data.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'src/data/items.csv');
const OUT_PATH = path.join(ROOT, 'src/data/items.json');

const TOOLS_IT_URLS = [
  'https://raw.githubusercontent.com/chalda-pnuzig/5etools-ita.github.io/master/data/items.json',
  'https://raw.githubusercontent.com/chalda-pnuzig/5etools-ita.github.io/master/data/items-base.json',
];
const TOOLS_EN_URLS = [
  'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/items.json',
  'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/items-base.json',
];

// ── Synonym map: CSV name (normalized) → 5etools name (normalized) or null ──
const SYNONYMS = {
  'spell scroll (level 0)': 'spell scroll (cantrip)',
  'spell scroll (level 1)': 'spell scroll (1st level)',
  'spell scroll (level 2)': 'spell scroll (2nd level)',
  'spell scroll (level 3)': 'spell scroll (3rd level)',
  'spell scroll (level 4)': 'spell scroll (4th level)',
  'spell scroll (level 5)': 'spell scroll (5th level)',
  'spell scroll (level 6)': 'spell scroll (6th level)',
  'spell scroll (level 7)': 'spell scroll (7th level)',
  'spell scroll (level 8)': 'spell scroll (8th level)',
  'spell scroll (level 9)': 'spell scroll (9th level)',
  'ammunition +1 (ea)': null,
  'ammunition +2 (ea)': null,
  'ammunition +3 (ea)': null,
};

// ── 5etools type code → human-readable ──────────────────────────────────────
// Covers both bare codes (items-base) and "CODE|SOURCE" variants (items.json)
const TYPE_MAP = {
  // Weapons & armor
  M:    'Melee Weapon',       R:    'Ranged Weapon',
  LA:   'Light Armor',        MA:   'Medium Armor',       HA:  'Heavy Armor',
  S:    'Shields',            A:    'Ammunition',
  AF:   'Ammunition',
  // Magic item categories
  P:    'Potions & Oils',     SC:   'Spell Scrolls',
  WD:   'Wands',              ST:   'Staffs',              RD:  'Rods',
  RG:   'Rings',              SCF:  'Spellcasting Focus',
  // Gear & tools
  G:    'Adventuring Gear',
  AT:   "Artisan's Tools",    T:    'Tools',
  GS:   'Gaming Set',         INS:  'Musical Instrument',
  // Transport
  MNT:  'Mount',              VEH:  'Vehicle',             SHP: 'Ship',
  SPC:  'Spelljammer Ship',   AIR:  'Aircraft',
  // Goods & treasure
  TG:   'Trade Good',         FD:   'Food and Drink',
  TB:   'Trade Bar',          TAH:  'Tack and Harness',
  // Special treasure ($ prefix = art objects / gemstones / currency)
  '$A': 'Art Object',         '$G': 'Gemstone',            '$C': 'Currency',
  // Misc
  OTH:  'Other',
};

function resolveType(item) {
  if (item.typeText) return item.typeText;
  const raw = item.type ?? '';
  // Strip "|SOURCE" suffix from codes like "MA|XPHB", "$G|XDMG", etc.
  const code = raw.includes('|') ? raw.split('|')[0] : raw;
  return TYPE_MAP[code] ?? (raw.includes('|') ? '' : raw);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function norm(name) {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function stripTags(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\{@\w+ ([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@\w+\}/g, '');
}

function renderEntries(entries) {
  if (!entries || !Array.isArray(entries)) return null;
  return entries.map(e => {
    if (typeof e === 'string') return `<p>${stripTags(e)}</p>`;
    if (!e || typeof e !== 'object') return '';
    if (e.type === 'entries') {
      const inner = renderEntries(e.entries);
      return e.name ? `<h4>${stripTags(e.name)}</h4>${inner ?? ''}` : (inner ?? '');
    }
    if (e.type === 'list') {
      const items = (e.items ?? []).map(i => {
        if (typeof i === 'string') return `<li>${stripTags(i)}</li>`;
        if (i.type === 'item' && i.name) return `<li><strong>${stripTags(i.name)}.</strong> ${stripTags(i.entry ?? '')}</li>`;
        return `<li>${stripTags(JSON.stringify(i))}</li>`;
      }).join('');
      return `<ul>${items}</ul>`;
    }
    if (e.type === 'table') {
      const headers = (e.colLabels ?? []).map(h => `<th>${stripTags(h)}</th>`).join('');
      const rows = (e.rows ?? []).map(r => {
        const cells = (Array.isArray(r) ? r : r.row ?? []).map(c => {
          const txt = typeof c === 'string' ? c : (c?.roll ? `${c.roll.min}–${c.roll.max}` : JSON.stringify(c));
          return `<td>${stripTags(txt)}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    if (e.type === 'quote') {
      return `<blockquote>${renderEntries(e.entries) ?? ''}</blockquote>`;
    }
    if (e.type === 'inset' || e.type === 'insetReadaloud') {
      return `<aside>${e.name ? `<h4>${stripTags(e.name)}</h4>` : ''}${renderEntries(e.entries) ?? ''}</aside>`;
    }
    if (e.entries) return renderEntries(e.entries);
    return '';
  }).join('');
}

function buildLookup(items) {
  const map = new Map();
  for (const item of items) {
    if (!item.name) continue;
    const n = norm(item.name);
    const src = (item.source ?? '').toUpperCase();
    map.set(n + '|' + src, item);
    if (!map.has(n)) map.set(n, item);
  }
  return map;
}

/**
 * Find match — returns { item, key } or null.
 * key is the canonical "norm(name)|SOURCE" used to track matched items.
 */
function findMatch(csvName, csvSource, lookup) {
  const normalizedCsvName = norm(csvName);
  const synonymKey = SYNONYMS[normalizedCsvName];

  if (synonymKey === null) return null;

  const resolvedName = synonymKey ?? normalizedCsvName;
  const src = csvSource.toUpperCase();

  const t1 = lookup.get(resolvedName + '|' + src);
  if (t1) return { item: t1, key: norm(t1.name) + '|' + (t1.source ?? '').toUpperCase() };

  const stripped = resolvedName.replace(/\s*\([^)]*\)/g, '').trim();
  if (stripped !== resolvedName) {
    const t2 = lookup.get(stripped + '|' + src);
    if (t2) return { item: t2, key: norm(t2.name) + '|' + (t2.source ?? '').toUpperCase() };
  }

  const t3 = lookup.get(resolvedName);
  if (t3) return { item: t3, key: norm(t3.name) + '|' + (t3.source ?? '').toUpperCase() };

  const fuzzy = resolvedName.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  for (const [key, item] of lookup) {
    if (!key.includes('|')) continue;
    const keyName = key.split('|')[0].replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (keyName === fuzzy) return { item, key: norm(item.name) + '|' + (item.source ?? '').toUpperCase() };
  }

  return null;
}

// ── Price estimation helpers ──────────────────────────────────────────────────

function parseGp(str) {
  if (!str) return null;
  const m = str.replace(/,/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!existsSync(CSV_PATH)) {
  console.warn(`[fetch-data] WARN: CSV not found at ${CSV_PATH}`);
  console.warn(`[fetch-data] Export your Excel as CSV and save it to src/data/items.csv, then run: npm run fetch-data`);
  writeFileSync(OUT_PATH, '[]', 'utf-8');
  process.exit(0);
}

console.log('[fetch-data] Reading CSV…');
const csvText = readFileSync(CSV_PATH, 'utf-8');
const allRows = csvText.split(/\r?\n/).map(parseCSVLine);

const headerIdx = allRows.findIndex(r => r.includes('Item') && r.includes('Rarity'));
if (headerIdx === -1) {
  console.error('[fetch-data] ERROR: Could not find header row in CSV');
  process.exit(1);
}

const header = allRows[headerIdx];
const COL = {
  item:       header.indexOf('Item'),
  msrpCommon: header.findIndex(h => h.toLowerCase().includes('msrp') && h.toLowerCase().includes('common')),
  msrpRare:   header.findIndex(h => h.toLowerCase().includes('msrp') && h.toLowerCase().includes('rare')),
  sane:       header.findIndex(h => h.toLowerCase().includes('sane')),
  dmpg:       header.findIndex(h => h.toLowerCase().includes('dmpg')),
  xge:        header.findIndex(h => h.toLowerCase().includes('xge')),
  rarity:     header.indexOf('Rarity'),
  source:     header.indexOf('Source'),
  page:       header.indexOf('Page'),
  type:       header.indexOf('Type'),
  attunement: header.indexOf('Attunement'),
};

const csvItems = allRows
  .slice(headerIdx + 1)
  .filter(r => r[COL.item]?.trim())
  .map(r => ({
    name:       r[COL.item].trim(),
    msrpCommon: COL.msrpCommon >= 0 ? (r[COL.msrpCommon]?.trim() || null) : null,
    msrpRare:   COL.msrpRare >= 0 ? (r[COL.msrpRare]?.trim() || null) : null,
    sanePrice:  COL.sane >= 0 ? (r[COL.sane]?.trim() || null) : null,
    dmpgPrice:  COL.dmpg >= 0 ? (r[COL.dmpg]?.trim() || null) : null,
    xgePrice:   COL.xge >= 0 ? (r[COL.xge]?.trim() || null) : null,
    rarity:     r[COL.rarity]?.trim() || '',
    source:     r[COL.source]?.trim() || '',
    page:       r[COL.page]?.trim() || '',
    type:       r[COL.type]?.trim() || '',
    attunement: ['yes', 'true', '1', 'si', 'sì'].includes(r[COL.attunement]?.trim().toLowerCase() ?? ''),
  }));

console.log(`[fetch-data] CSV items: ${csvItems.length}`);

// ── Fetch 5etools ─────────────────────────────────────────────────────────────

async function fetchToolsItems(urls) {
  const all = [];
  for (const url of urls) {
    try {
      console.log(`[fetch-data] Fetching ${url}…`);
      const res = await fetch(url);
      if (!res.ok) { console.warn(`[fetch-data] WARN: ${url} → ${res.status}`); continue; }
      const json = await res.json();
      const key = json.item ? 'item' : json.baseitem ? 'baseitem' : null;
      if (key) all.push(...json[key]);
    } catch (err) {
      console.warn(`[fetch-data] WARN: Could not fetch ${url}: ${err.message}`);
    }
  }
  return all;
}

const [toolsItItems, toolsEnItems] = await Promise.all([
  fetchToolsItems(TOOLS_IT_URLS),
  fetchToolsItems(TOOLS_EN_URLS),
]);

console.log(`[fetch-data] 5etools IT: ${toolsItItems.length} items`);
console.log(`[fetch-data] 5etools EN: ${toolsEnItems.length} items`);

const lookupIt = buildLookup(toolsItItems);
const lookupEn = buildLookup(toolsEnItems);

// ── Phase 1: CSV items merge ──────────────────────────────────────────────────

const matchedEnKeys = new Set();
let withDesc = 0;
const noMatch = [];

const merged = csvItems.map(csv => {
  const mIt = findMatch(csv.name, csv.source, lookupIt);
  const mEn = findMatch(csv.name, csv.source, lookupEn);

  if (mEn) matchedEnKeys.add(mEn.key);
  if (mIt) matchedEnKeys.add(mIt.key); // also mark IT matches so we don't duplicate

  const entriesIt = mIt ? renderEntries(mIt.item.entries) : null;
  const entriesEn = mEn ? renderEntries(mEn.item.entries) : null;

  if (entriesIt || entriesEn) withDesc++;
  else noMatch.push(`${csv.name} (${csv.source})`);

  const reqAttune = mEn?.item.reqAttune ?? mIt?.item.reqAttune;
  const attunementNote = typeof reqAttune === 'string' ? reqAttune : null;

  return {
    id:             slugify(csv.name + '-' + csv.source),
    name:           csv.name,
    source:         csv.source,
    page:           csv.page,
    type:           csv.type,
    rarity:         csv.rarity.toLowerCase() || 'mundane',
    attunement:     csv.attunement,
    attunementNote,
    msrpCommon:     csv.msrpCommon,
    msrpRare:       csv.msrpRare,
    sanePrice:      csv.sanePrice,
    dmpgPrice:      csv.dmpgPrice,
    xgePrice:       csv.xgePrice,
    priceEstimated: false,
    entriesIt,
    entriesEn,
  };
});

console.log(`[fetch-data] CSV matched descriptions: ${withDesc}/${merged.length}`);
if (noMatch.length > 0 && noMatch.length <= 20) {
  console.log('[fetch-data] No description for:', noMatch.join(', '));
} else if (noMatch.length > 20) {
  console.log(`[fetch-data] No description for: ${noMatch.length} items`);
}

// ── Price estimation buckets (built from CSV data) ────────────────────────────

const priceBuckets = {};
for (const item of merged) {
  const gp = parseGp(item.sanePrice);
  if (gp === null) continue;
  const byBoth = `${item.rarity}|${(item.type ?? '').toLowerCase()}`;
  const byRar  = item.rarity;
  (priceBuckets[byBoth] ??= []).push(gp);
  (priceBuckets[byRar]  ??= []).push(gp);
}

function estimatePrice(rarity, type) {
  const byBoth = `${rarity}|${(type ?? '').toLowerCase()}`;
  const m = median(priceBuckets[byBoth] ?? []) ?? median(priceBuckets[rarity] ?? []);
  if (!m) return null;
  return `~${m.toLocaleString('en')} gp`;
}

// ── Phase 2: 5etools-only items ───────────────────────────────────────────────

const seenIds = new Set(merged.map(i => i.id));
const extraItems = [];

for (const enItem of toolsEnItems) {
  if (!enItem.name) continue;
  const key = norm(enItem.name) + '|' + (enItem.source ?? '').toUpperCase();
  if (matchedEnKeys.has(key)) continue;  // already in CSV → skip

  const id = slugify(enItem.name + '-' + (enItem.source ?? ''));
  if (seenIds.has(id)) continue;         // duplicate id → skip
  seenIds.add(id);

  const itItem = lookupIt.get(key) ?? lookupIt.get(norm(enItem.name));
  const entriesEn = renderEntries(enItem.entries);
  const entriesIt = itItem ? renderEntries(itItem.entries) : null;

  const rarity = enItem.rarity === 'none' ? 'mundane' : (enItem.rarity ?? 'unknown').toLowerCase();
  const type   = resolveType(enItem);
  const est    = estimatePrice(rarity, type);

  const reqAttune = enItem.reqAttune;
  const attunementNote = typeof reqAttune === 'string' ? reqAttune : null;

  extraItems.push({
    id,
    name:           enItem.name,
    source:         (enItem.source ?? '').toUpperCase(),
    page:           String(enItem.page ?? ''),
    type,
    rarity,
    attunement:     !!enItem.reqAttune,
    attunementNote,
    msrpCommon:     null,
    msrpRare:       null,
    sanePrice:      est,
    dmpgPrice:      null,
    xgePrice:       null,
    priceEstimated: est !== null,
    entriesIt,
    entriesEn,
  });
}

console.log(`[fetch-data] 5etools extra items: ${extraItems.length} (${extraItems.filter(i => i.priceEstimated).length} with estimated price)`);

// ── Final merge: sort alphabetically ─────────────────────────────────────────

const allItems = [...merged, ...extraItems]
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));

const totalWithDesc = allItems.filter(i => i.entriesIt || i.entriesEn).length;
console.log(`[fetch-data] Total: ${allItems.length} items (${totalWithDesc} with description)`);

writeFileSync(OUT_PATH, JSON.stringify(allItems, null, 2), 'utf-8');
console.log(`[fetch-data] Written: ${OUT_PATH}`);
