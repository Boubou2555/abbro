// =====================================================================
// متجر الحسابات — واجهة الزبون (عرض فقط)
// =====================================================================

const API_URL = '/api/accounts';

// عدّل هذا الرقم لتفعيل زر "تواصل معنا" (تنسيق دولي بدون + أو أصفار،
// مثال جزائري: "213555123456"). اتركه فارغاً لإخفاء الزر.
const WHATSAPP_NUMBER = '';

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
let accounts = [];
let filters = { search: '', sort: 'newest' };

// ---------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------
const el = (id) => document.getElementById(id);
const accountsContainer = el('accountsContainer');
const emptyState = el('emptyState');
const searchInput = el('searchInput');
const sortSelect = el('sortSelect');
const topLoadingBar = el('topLoadingBar');
const toastEl = el('mainToast');
const toast = new bootstrap.Toast(toastEl, { delay: 2400 });
const detailModalEl = el('detailModal');
const detailModal = new bootstrap.Modal(detailModalEl);

// ---------------------------------------------------------------------
// Contact button
// ---------------------------------------------------------------------
if (WHATSAPP_NUMBER) {
  const contactBtn = el('contactBtn');
  contactBtn.href = `https://wa.me/${WHATSAPP_NUMBER}`;
  contactBtn.classList.remove('d-none');
}

// ---------------------------------------------------------------------
// Loading indicator
// ---------------------------------------------------------------------
function startLoading() {
  topLoadingBar.classList.add('is-active');
  topLoadingBar.style.transition = 'none';
  topLoadingBar.style.width = '0%';
  void topLoadingBar.offsetWidth;
  topLoadingBar.style.transition = 'width 1.2s cubic-bezier(0.12, 0.6, 0.2, 1)';
  topLoadingBar.style.width = '88%';
}
function stopLoading() {
  topLoadingBar.style.transition = 'width 0.25s ease-out';
  topLoadingBar.style.width = '100%';
  setTimeout(() => {
    topLoadingBar.classList.remove('is-active');
    topLoadingBar.style.transition = 'none';
    topLoadingBar.style.width = '0%';
  }, 300);
}

function showToast(message) {
  el('toastBody').textContent = message;
  toast.show();
}

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------
async function fetchAccounts() {
  startLoading();
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('Failed to load accounts');
    accounts = await res.json();
    renderAccounts();
  } catch (err) {
    console.error(err);
    showToast('حدث خطأ أثناء تحميل الحسابات.');
  } finally {
    stopLoading();
  }
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}
function formatMoney(n) {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
const PLACEHOLDER_IMG = 'https://placehold.co/160x160/f2f2f7/9a9aa0?text=%3F';

async function copyCode(code) {
  const text = String(code || '');
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    // Fallback for browsers/contexts where the Clipboard API is blocked.
    const tmp = document.createElement('textarea');
    tmp.value = text;
    tmp.style.position = 'fixed';
    tmp.style.opacity = '0';
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
  }
  showToast('تم نسخ الكود ✅ الصقه وأرسله لنا لإتمام الشراء');
}

// ---------------------------------------------------------------------
// Filtering / sorting
// ---------------------------------------------------------------------
function getFilteredAccounts() {
  let list = accounts.filter((acc) => {
    if (!filters.search) return true;
    const q = filters.search;
    return (
      (acc.code && acc.code.toLowerCase().includes(q)) ||
      (acc.title && acc.title.toLowerCase().includes(q))
    );
  });

  switch (filters.sort) {
    case 'price_asc':
      list = list.slice().sort((a, b) => Number(a.price_usd) - Number(b.price_usd));
      break;
    case 'price_desc':
      list = list.slice().sort((a, b) => Number(b.price_usd) - Number(a.price_usd));
      break;
    case 'gems_desc':
      list = list.slice().sort((a, b) => Number(b.gems) - Number(a.gems));
      break;
    default:
      // "newest" — accounts already come sorted newest-first from the API.
      break;
  }
  return list;
}

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------
function accountCardHtml(acc, idx) {
  const img = acc.image_url || PLACEHOLDER_IMG;
  const title = acc.title || `حساب #${acc.id}`;
  const isSold = acc.status === 'sold';

  return `
    <div class="acc-row${isSold ? ' is-sold' : ''}" style="animation-delay:${Math.min(idx, 12) * 25}ms" data-id="${acc.id}">
      <div class="acc-thumb-wrap">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(title)}" class="acc-thumb" loading="lazy"
             onerror="this.src='${PLACEHOLDER_IMG}'">
        ${isSold ? '<span class="acc-sold-badge">مباع</span>' : ''}
      </div>

      <div class="acc-info">
        <div class="acc-title">${escapeHtml(title)}</div>
        <div class="acc-chips">
          <span class="acc-chip"><img src="assets/gems-icon.png" alt="" class="stat-icon">${formatNumber(acc.gems)}</span>
          <span class="acc-chip"><img src="assets/shards-icon.png" alt="" class="stat-icon">${formatNumber(acc.gold_bars)}</span>
        </div>
        <div class="acc-chips">
          <span class="acc-chip price-chip">$${formatMoney(acc.price_usd)}</span>
          <span class="acc-chip price-chip">${formatMoney(acc.price_flexy)} دج فليكسي</span>
          <span class="acc-chip price-chip">${formatMoney(acc.price_baridimob)} دج بريدي</span>
        </div>
      </div>

      <div class="acc-trailing">
        <button class="ios-copy-btn" data-action="copy" data-code="${escapeHtml(acc.code)}" title="نسخ" ${isSold ? 'disabled' : ''}>
          <i class="bi bi-clipboard-check"></i>
        </button>
      </div>
    </div>
  `;
}

function renderAccounts() {
  const filtered = getFilteredAccounts();

  accountsContainer.innerHTML = filtered.map((acc, idx) => accountCardHtml(acc, idx)).join('');
  emptyState.classList.toggle('d-none', filtered.length > 0);
  el('itemCountLabel').textContent = `${filtered.length} حساب متاح`;
}

// ---------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------
searchInput.addEventListener('input', (e) => {
  filters.search = e.target.value.trim().toLowerCase();
  renderAccounts();
});
sortSelect.addEventListener('change', (e) => {
  filters.sort = e.target.value;
  renderAccounts();
});
el('clearFiltersBtn').addEventListener('click', () => {
  filters = { search: '', sort: 'newest' };
  searchInput.value = '';
  sortSelect.value = 'newest';
  renderAccounts();
});

let activeDetailAccount = null;

accountsContainer.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('button[data-action="copy"]');
  if (copyBtn) {
    e.stopPropagation();
    copyCode(copyBtn.getAttribute('data-code'));
    copyBtn.classList.add('is-copied');
    setTimeout(() => copyBtn.classList.remove('is-copied'), 1200);
    return;
  }
  const row = e.target.closest('.acc-row');
  if (row) {
    const acc = accounts.find((a) => Number(a.id) === Number(row.getAttribute('data-id')));
    if (acc) openDetailModal(acc);
  }
});

function openDetailModal(acc) {
  activeDetailAccount = acc;
  el('detailModalTitle').textContent = acc.title || `حساب #${acc.id}`;
  const img = acc.image_url || PLACEHOLDER_IMG;
  el('detailModalBody').innerHTML = `
    <img src="${escapeHtml(img)}" class="detail-modal-img mb-3" alt=""
         onerror="this.src='${PLACEHOLDER_IMG}'">
    <div class="acc-chips mb-2">
      <span class="acc-chip"><img src="assets/gems-icon.png" alt="" class="stat-icon">${formatNumber(acc.gems)}</span>
      <span class="acc-chip"><img src="assets/shards-icon.png" alt="" class="stat-icon">${formatNumber(acc.gold_bars)}</span>
    </div>
    <div class="acc-chips mb-2">
      <span class="acc-chip price-chip">$${formatMoney(acc.price_usd)}</span>
      <span class="acc-chip price-chip">${formatMoney(acc.price_flexy)} دج فليكسي</span>
      <span class="acc-chip price-chip">${formatMoney(acc.price_baridimob)} دج بريدي موب</span>
    </div>
    ${acc.note ? `<p class="text-muted mb-0">${escapeHtml(acc.note)}</p>` : ''}
  `;
  detailModal.show();
}

el('detailCopyCodeBtn').addEventListener('click', () => {
  if (activeDetailAccount) copyCode(activeDetailAccount.code);
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
fetchAccounts();
