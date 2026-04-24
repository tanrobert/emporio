// @ts-check
/**
 * modal.js — open/close modal + language toggle (IT/EN)
 */

// ── Data ─────────────────────────────────────────────────────────────────────

const dataEl = document.getElementById('items-data');
if (!dataEl) throw new Error('items-data script tag not found');

/** @type {any[]} */
const ITEMS = JSON.parse(dataEl.textContent ?? '[]');
/** @type {Map<string, any>} */
const ITEMS_MAP = new Map(ITEMS.map(i => [i.id, i]));

// ── Elements ──────────────────────────────────────────────────────────────────

const overlay   = document.getElementById('modal-overlay');
const content   = document.getElementById('modal-content');
const titleEl   = document.getElementById('modal-title');
const metaEl    = document.getElementById('modal-meta');
const pricesEl  = document.getElementById('modal-prices');
const descEl    = document.getElementById('modal-description');
const closeBtn  = document.getElementById('modal-close');
const btnIt     = document.getElementById('lang-it');
const btnEn     = document.getElementById('lang-en');

// ── Language state ────────────────────────────────────────────────────────────

let currentLang = 'it';
/** @type {any|null} */
let currentItem = null;
/** @type {HTMLElement|null} */
let lastFocused = null;

function setLang(lang) {
  currentLang = lang;
  btnIt?.classList.toggle('active', lang === 'it');
  btnEn?.classList.toggle('active', lang === 'en');
  btnIt?.setAttribute('aria-pressed', String(lang === 'it'));
  btnEn?.setAttribute('aria-pressed', String(lang === 'en'));

  // Re-render description if modal is open
  if (currentItem && descEl) {
    descEl.innerHTML = buildDescription(currentItem);
  }
}

btnIt?.addEventListener('click', () => setLang('it'));
btnEn?.addEventListener('click', () => setLang('en'));

// ── Modal open/close ──────────────────────────────────────────────────────────

function openModal(itemId) {
  const item = ITEMS_MAP.get(itemId);
  if (!item || !overlay || !titleEl || !metaEl || !pricesEl || !descEl) return;

  currentItem = item;

  titleEl.textContent = item.name;
  metaEl.innerHTML    = buildMeta(item);
  pricesEl.innerHTML  = buildPrices(item);
  descEl.innerHTML    = buildDescription(item);

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  // Focus close button
  setTimeout(() => closeBtn?.focus(), 50);
}

function closeModal() {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = '';
  currentItem = null;
  lastFocused?.focus();
}

// ── Content builders ──────────────────────────────────────────────────────────

const RARITY_LABELS = {
  'common':    'Comune',
  'uncommon':  'Non Comune',
  'rare':      'Raro',
  'very rare': 'Molto Raro',
  'legendary': 'Leggendario',
  'artifact':  'Artefatto',
  'varies':    'Variabile',
  'unknown':   'Sconosciuta',
};

function rarityClass(r) {
  return 'rarity-' + (r ?? '').toLowerCase().replace(/\s+/g, '-');
}

function buildMeta(item) {
  const rLabel = RARITY_LABELS[item.rarity] ?? item.rarity ?? '';
  const rBadge = `<span class="rarity-badge ${rarityClass(item.rarity)}">${rLabel}</span>`;
  const typeTag = item.type ? `<span class="modal-tag">${item.type}</span>` : '';
  const srcTag  = `<span class="modal-tag">${item.source}${item.page ? ` p.${item.page}` : ''}</span>`;
  const attTag  = item.attunement
    ? `<span class="modal-tag modal-attune-tag">◆ Sintonia${item.attunementNote ? ': ' + item.attunementNote : ''}</span>`
    : '';
  return [rBadge, typeTag, srcTag, attTag].filter(Boolean).join('');
}

function buildPrices(item) {
  const fmt = v => v || null;

  const prices = [
    { label: 'MSRP Comune', value: fmt(item.msrpCommon), cls: '' },
    { label: 'MSRP Raro',   value: fmt(item.msrpRare),   cls: '' },
  ].filter(p => p.value);

  if (!prices.length) return '<p style="color:var(--text-dim); font-style:italic; font-size:0.85rem;">Nessun dato prezzo disponibile.</p>';

  return prices.map(p =>
    `<div class="price-cell ${p.cls}">
      <span class="price-label">${p.label}</span>
      <span class="price-value">${p.value}</span>
    </div>`
  ).join('');
}

function buildDescription(item) {
  const entries = currentLang === 'it' ? item.entriesIt : item.entriesEn;
  if (entries) return entries;

  // Fallback: try the other language
  const fallback = currentLang === 'it' ? item.entriesEn : item.entriesIt;
  if (fallback) {
    const note = currentLang === 'it'
      ? '<p style="color:var(--text-dim); font-size:0.8rem; font-style:italic;">Traduzione italiana non disponibile — mostrato in inglese.</p>'
      : '<p style="color:var(--text-dim); font-size:0.8rem; font-style:italic;">Italian translation not available — showing English.</p>';
    return note + fallback;
  }

  return '<p class="no-description">Descrizione non disponibile.</p>';
}

// ── Delegation: open modal on row click ───────────────────────────────────────

document.getElementById('items-table')?.addEventListener('click', e => {
  const btn = /** @type {HTMLElement} */ (e.target).closest('.item-link');
  if (!btn) return;
  lastFocused = /** @type {HTMLElement} */ (btn);
  const row = btn.closest('tr');
  if (row) openModal(row.dataset.itemId ?? '');
});

// ── Close button ──────────────────────────────────────────────────────────────

closeBtn?.addEventListener('click', closeModal);

overlay?.addEventListener('click', e => {
  if (e.target === overlay) closeModal();
});

// ── Keyboard: Escape + focus trap ─────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && overlay && !overlay.hidden) {
    closeModal();
    return;
  }
});

content?.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || !content) return;
  const focusable = /** @type {HTMLElement[]} */ ([
    ...content.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')
  ]).filter(el => !el.hasAttribute('disabled'));
  if (!focusable.length) return;
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
