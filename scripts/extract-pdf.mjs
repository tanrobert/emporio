// @ts-check
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const buffer = readFileSync('public/5e BASE Guida del dungeon master.pdf');

// Estrae solo le pagine specificate (1-based)
async function extractPages(fromPage, toPage) {
  let currentPage = 0;
  const data = await pdfParse(buffer, {
    pagerender(pageData) {
      currentPage++;
      if (currentPage >= fromPage && currentPage <= toPage) {
        return pageData.getTextContent().then(tc =>
          tc.items.map(i => i.str).join(' ')
        );
      }
      return Promise.resolve('');
    }
  });
  return data.text;
}

// Argomento: "toc" per indice, o "N-M" per pagine N-M
const arg = process.argv[2] || 'toc';

if (arg === 'toc') {
  console.log('Estrazione indice (pagine 1-8)...');
  const text = await extractPages(1, 8);
  writeFileSync('scripts/dmg-toc.txt', text, 'utf-8');
  console.log(`Salvato in scripts/dmg-toc.txt (${text.length} caratteri)`);
} else {
  const [from, to] = arg.split('-').map(Number);
  console.log(`Estrazione pagine ${from}-${to}...`);
  const text = await extractPages(from, to);
  const out = `scripts/dmg-p${from}-${to}.txt`;
  writeFileSync(out, text, 'utf-8');
  console.log(`Salvato in ${out} (${text.length} caratteri)`);
}
