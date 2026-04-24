// @ts-check
/**
 * Genera un report dei DMG items in items.json (nome EN) vs nomi IT in magic_items_with_description.json
 * Per costruire la mappatura IT→EN da usare nello script di merge.
 */
import { readFileSync, writeFileSync } from 'fs';

const itItems = JSON.parse(readFileSync('magic_items_with_description.json', 'utf-8'));
const enItems = JSON.parse(readFileSync('src/data/items.json', 'utf-8'))
  .filter(i => i.source === 'DMG');

// Rarità: 0=common 1=uncommon 2=rare 3=very rare 4=legendary
const rarityMap = { 0: 'common', 1: 'uncommon', 2: 'rare', 3: 'very rare', 4: 'legendary' };

// Categoria IT → tipo EN (parziale, per filtrare)
const categoryMap = {
  'Anello': 'Ring',
  'Armatura': 'Armor',
  'Bacchetta': 'Wand',
  'Bastone': 'Staff',
  'Pozione': 'Potion',
  'Scudo': 'Shield',
  'Verga': 'Rod',
  'Pergamena': 'Scroll',
};

const report = [];

for (const it of itItems) {
  const rarity = rarityMap[it.rarity];
  const typeHint = categoryMap[it.category]; // undefined per Arma/Oggetto Meraviglioso

  // Candidati filtrati per rarità (e tipo se disponibile)
  const candidates = enItems.filter(en => {
    if (en.rarity !== rarity) return false;
    if (typeHint && !en.type?.includes(typeHint)) return false;
    return true;
  });

  report.push({
    it_name: it.name,
    it_rarity: rarity,
    it_category: it.category,
    candidates: candidates.map(c => ({ id: c.id, name: c.name, type: c.type }))
  });
}

writeFileSync('scripts/mapping-report.json', JSON.stringify(report, null, 2), 'utf-8');
console.log(`Report generato: ${report.length} oggetti IT`);
console.log(`Oggetti con 1 solo candidato: ${report.filter(r => r.candidates.length === 1).length}`);
console.log(`Oggetti con 0 candidati: ${report.filter(r => r.candidates.length === 0).length}`);
console.log(`Oggetti con 2+ candidati: ${report.filter(r => r.candidates.length >= 2).length}`);
