// @ts-check
/**
 * table.js — filter, sort, search for the items table
 * Runs client-side after page load.
 */

const table   = document.getElementById('items-table');
const tbody   = table?.querySelector('tbody');
const search  = /** @type {HTMLInputElement} */ (document.getElementById('search'));
const selRar  = /** @type {HTMLSelectElement} */ (document.getElementById('filter-rarity'));
const selType = /** @type {HTMLSelectElement} */ (document.getElementById('filter-type'));
const selSrc  = /** @type {HTMLSelectElement} */ (document.getElementById('filter-source'));
const chkAtt  = /** @type {HTMLInputElement} */ (document.getElementById('filter-attunement'));
const countEl = document.getElementById('result-count');
const emptyEl = document.getElementById('empty-state');

if (!table || !tbody) throw new Error('Table not found');

const allRows = /** @type {HTMLTableRowElement[]} */ ([...tbody.querySelectorAll('tr')]);

const state = {
  search: '',
  rarity: '',
  type: '',
  source: '',
  attunement: false,
  sortCol: 'name',
  sortDir: 1, // 1 = asc, -1 = desc
};

// ── Filter ──────────────────────────────────────────────────────────────────

function applyFilters() {
  const q = state.search.toLowerCase();
  let visible = 0;

  for (const row of allRows) {
    const nameBtn = row.querySelector('.item-link');
    const name = nameBtn?.textContent?.toLowerCase() ?? '';

    const show =
      (!q || name.includes(q)) &&
      (!state.rarity || row.dataset.rarity === state.rarity) &&
      (!state.type || row.dataset.type === state.type) &&
      (!state.source || row.dataset.source === state.source) &&
      (!state.attunement || row.dataset.attunement === 'true');

    row.hidden = !show;
    if (show) visible++;
  }

  if (countEl) countEl.textContent = `${visible} oggett${visible === 1 ? 'o' : 'i'}`;
  if (emptyEl) emptyEl.hidden = visible > 0;
}

// ── Sort ─────────────────────────────────────────────────────────────────────

const COL_SELECTOR = {
  name:   '.item-link',
  type:   'td:nth-child(2)',
  rarity: 'td:nth-child(3)',
  source:      'td:nth-child(5)',
  msrpCommon:  'td:nth-child(6)',
  msrpRare:    'td:nth-child(7)',
};

function parsePrice(str) {
  if (!str) return -1;
  const m = str.replace(/[.,]/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : -1;
}

function cellText(row, col) {
  const sel = COL_SELECTOR[col];
  return row.querySelector(sel)?.textContent?.trim() ?? '';
}

function applySortUI() {
  for (const th of table.querySelectorAll('th.sortable')) {
    const col = /** @type {HTMLElement} */ (th).dataset.col;
    th.classList.toggle('sort-asc',  col === state.sortCol && state.sortDir === 1);
    th.classList.toggle('sort-desc', col === state.sortCol && state.sortDir === -1);
  }
}

function applySort() {
  const sorted = [...allRows].sort((a, b) => {
    const av = cellText(a, state.sortCol);
    const bv = cellText(b, state.sortCol);
    if (state.sortCol === 'msrpCommon' || state.sortCol === 'msrpRare') {
      return (parsePrice(av) - parsePrice(bv)) * state.sortDir;
    }
    if (state.sortCol === 'rarity') {
      const order = ['mundane', 'common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact', 'varies', 'unknown'];
      const ai = order.indexOf(a.dataset.rarity ?? '');
      const bi = order.indexOf(b.dataset.rarity ?? '');
      return ((ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)) * state.sortDir;
    }
    return av.localeCompare(bv, 'it') * state.sortDir;
  });
  for (const row of sorted) tbody.appendChild(row);
  applySortUI();
}

// ── Event wiring ─────────────────────────────────────────────────────────────

search?.addEventListener('input', e => {
  state.search = /** @type {HTMLInputElement} */ (e.target).value;
  applyFilters();
});

selRar?.addEventListener('change', e => {
  state.rarity = /** @type {HTMLSelectElement} */ (e.target).value;
  applyFilters();
});

selType?.addEventListener('change', e => {
  state.type = /** @type {HTMLSelectElement} */ (e.target).value;
  applyFilters();
});

selSrc?.addEventListener('change', e => {
  state.source = /** @type {HTMLSelectElement} */ (e.target).value;
  applyFilters();
});

chkAtt?.addEventListener('change', e => {
  state.attunement = /** @type {HTMLInputElement} */ (e.target).checked;
  applyFilters();
});

for (const th of table.querySelectorAll('th.sortable')) {
  th.addEventListener('click', () => {
    const col = /** @type {HTMLElement} */ (th).dataset.col ?? 'name';
    if (state.sortCol === col) {
      state.sortDir *= -1;
    } else {
      state.sortCol = col;
      state.sortDir = 1;
    }
    applySort();
    applyFilters();
  });
}

// Initial state
applySortUI();
applyFilters();
