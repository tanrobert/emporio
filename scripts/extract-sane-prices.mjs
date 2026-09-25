// @ts-check
/**
 * Estrae le tabelle prezzi da Sane_Magical_Prices.pdf → src/data/sane-prices.json
 * Ogni riga del PDF è "Nome | Prezzo | Pagina DMG | Rarità [| Pagina MM]", ma nel testo
 * estratto le colonne sono attaccate (es. "Potion of Healing50187Common").
 * Ogni oggetto compare due volte (tabella per categoria + indice alfabetico):
 * lo script verifica che le due occorrenze coincidano.
 * Uso: node scripts/extract-sane-prices.mjs  (richiede pdf-parse, già in devDependencies)
 */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const pdfParse = createRequire(import.meta.url)('pdf-parse');

const PDF_PATH = 'Sane_Magical_Prices.pdf';
const OUT_PATH = 'src/data/sane-prices.json';

// Il nome può finire con "Level N" o "+N": quella cifra appartiene al nome, non al prezzo
const ROW = /^(.*?(?:Level \d|\+\d)?)(\d+)(\d{3})(Common|Uncommon|Rare|Very Rare|Legendary|Artifact)(?:\d{3})?\s*$/;
const norm = s => s.toLowerCase().replace(/['’`]/g, '').replace(/[^a-z0-9+]+/g, ' ').trim();

const { text } = await pdfParse(readFileSync(PDF_PATH));

/** @type {Map<string, { name: string, price: number, page: number, rarity: string }>} */
const prices = new Map();
const conflicts = [];
let inTable = false;
let buf = [];

for (const raw of text.split('\n')) {
  const line = raw.trim();
  if (line.startsWith('NamePricePageRarity')) { inTable = true; buf = []; continue; }
  if (!inTable) continue;
  if (line === '') { inTable = false; continue; }

  // Righe spezzate su più linee: ricongiunge, rimuovendo la sillabazione ("Read-" + "ing")
  buf.push(line);
  const joined = buf
    .map((s, i) => i === buf.length - 1 ? s : s.endsWith('-') ? s.slice(0, -1) : s + ' ')
    .join('')
    .replace(/\s+/g, ' ');
  const m = joined.match(ROW);
  if (!m) {
    if (buf.length > 4) { console.warn(`[sane] riga non riconosciuta: ${joined}`); buf = []; }
    continue;
  }
  buf = [];
  if (m[1].includes('*')) continue; // Robe of Useful Items: prezzo a formula, non numerico

  const row = { name: m[1].trim(), price: Number(m[2]), page: Number(m[3]), rarity: m[4].toLowerCase() };
  const prev = prices.get(norm(row.name));
  if (prev && (prev.price !== row.price || prev.rarity !== row.rarity)) conflicts.push([prev, row]);
  if (!prev) prices.set(norm(row.name), row);
}

if (conflicts.length) {
  console.error('[sane] prezzi diversi tra tabella e indice:', conflicts);
  process.exit(1);
}

const out = [...prices.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf-8');
console.log(`[sane] ${out.length} prezzi estratti → ${OUT_PATH}`);
