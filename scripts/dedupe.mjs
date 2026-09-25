// @ts-check
/**
 * Rimuove i duplicati per nome da src/data/items.json (tipicamente edizione 2014 vs 2024).
 * Per ogni gruppo tiene una sola copia, scelta in ordine di priorità:
 *   1. fonte recente (2024)  2. ha la traduzione IT  3. ha la descrizione EN
 * Dalle copie scartate recupera: il prezzo migliore (reale > stimato > nessuno),
 * la traduzione IT e la descrizione EN se mancano.
 * Scrive src/data/id-aliases.json (id rimosso → id tenuto), usato da merge-italian.mjs.
 */
import { readFileSync, writeFileSync } from 'fs';

const ITEMS_PATH   = 'src/data/items.json';
const ALIASES_PATH = 'src/data/id-aliases.json';

/** Fonti che sostituiscono una versione precedente dello stesso oggetto */
const NEWER_SOURCES = new Set(['XDMG', 'XPHB', 'XMM', 'FRHOF']);
const PRICE_FIELDS  = ['msrpCommon', 'msrpRare', 'sanePrice', 'dmpgPrice', 'xgePrice'];

const items = JSON.parse(readFileSync(ITEMS_PATH, 'utf-8'));

/** 2 = prezzo reale, 1 = stimato dalla rarità, 0 = nessuno */
const priceRank = i => !PRICE_FIELDS.some(f => i[f] != null && i[f] !== '') ? 0 : i.priceEstimated ? 1 : 2;
const hasIt    = i => !!i.entriesIt && i.entriesIt !== i.entriesEn;
const score    = i => [NEWER_SOURCES.has(i.source), hasIt(i), !!i.entriesEn];

/** Ordina per priorità decrescente (a prima di b se a è migliore) */
function compare(a, b) {
  const sa = score(a), sb = score(b);
  for (let k = 0; k < sa.length; k++) if (sa[k] !== sb[k]) return sa[k] ? -1 : 1;
  return 0;
}

const groups = new Map();
for (const item of items) {
  const key = item.name.trim().toLowerCase();
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(item);
}

const aliases = {};
const result = [];
let filledPrice = 0, filledIt = 0;

for (const group of groups.values()) {
  if (group.length === 1) { result.push(group[0]); continue; }

  const [kept, ...dropped] = [...group].sort(compare);
  for (const other of dropped) {
    aliases[other.id] = kept.id;
    if (priceRank(other) > priceRank(kept)) {
      for (const f of [...PRICE_FIELDS, 'priceEstimated']) kept[f] = other[f];
      filledPrice++;
    }
    if (!hasIt(kept) && hasIt(other)) { kept.entriesIt = other.entriesIt; filledIt++; }
    if (!kept.entriesEn && other.entriesEn) kept.entriesEn = other.entriesEn;
  }
  result.push(kept);
}

// Mantiene gli alias di esecuzioni precedenti (items.json già deduplicato)
let previous = {};
try { previous = JSON.parse(readFileSync(ALIASES_PATH, 'utf-8')); } catch {}
const allAliases = { ...previous, ...aliases };

writeFileSync(ITEMS_PATH, JSON.stringify(result, null, 2), 'utf-8');
writeFileSync(ALIASES_PATH, JSON.stringify(allAliases, null, 2), 'utf-8');

console.log(`[dedupe] ${items.length} → ${result.length} oggetti (rimossi ${items.length - result.length})`);
console.log(`[dedupe] prezzi recuperati: ${filledPrice}, traduzioni IT recuperate: ${filledIt}`);
