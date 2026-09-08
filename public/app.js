// =====================================================================
// Arena Breakout Loot Tracker — Frontend logic
// i18n toggle, smart autocomplete, CRUD against the Express/SQLite API
// =====================================================================

const API_URL = '/api/items';
const LIBRARY_URL = 'items-data.json';

// ---------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------
const translations = {
  en: {
    pageTitle: 'BORHANE / WADIE TOOL',
    brand: 'BORHANE / WADIE TOOL',
    addItem: 'Add Item',
    searchPlaceholder: 'Search items...',
    allGrids: 'All Grid Sizes',
    allRarities: 'All Rarities',
    rarityGold: 'Gold',
    rarityPurple: 'Purple',
    rarityBlue: 'Blue',
    clearFilters: 'Clear filters',
    totalValue: 'Total Value:',
    koen: 'Koen',
    noItems: 'No items found. Start by adding your first loot item.',
    itemNameEn: 'Item Name (English)',
    itemNameAr: 'Item Name (Arabic)',
    itemNamePlaceholder: 'Type to search library...',
    autocompleteHint: 'Pick from the library or type a custom name.',
    itemNameArPlaceholder: 'Arabic name (optional)',
    imageUrl: 'Image URL',
    imageUrlPlaceholder: 'https://...',
    uploadImage: 'Or upload a photo from your device',
    price: 'Price (Koen)',
    gridSize: 'Grid / Slots',
    rarity: 'Rarity',
    cancel: 'Cancel',
    save: 'Save',
    edit: 'Edit',
    delete: 'Delete',
    confirmDeleteTitle: 'Confirm Delete',
    confirmDeleteBody: 'Are you sure you want to delete this item? This action cannot be undone.',
    itemCount: (n) => `${n} item${n === 1 ? '' : 's'}`,
    addedMsg: 'Item added successfully.',
    updatedMsg: 'Item updated successfully.',
    deletedMsg: 'Item deleted.',
    errorMsg: 'Something went wrong. Please try again.',
    customEntry: 'Custom entry',
    slots: 'slots'
  },
  ar: {
    pageTitle: 'BORHANE / WADIE TOOL',
    brand: 'BORHANE / WADIE TOOL',
    addItem: 'إضافة عنصر',
    searchPlaceholder: 'ابحث عن عنصر...',
    allGrids: 'كل أحجام الشبكة',
    allRarities: 'كل الندرة',
    rarityGold: 'ذهبي',
    rarityPurple: 'بنفسجي',
    rarityBlue: 'أزرق',
    clearFilters: 'مسح الفلاتر',
    totalValue: 'القيمة الإجمالية:',
    koen: 'كوين',
    noItems: 'لا توجد عناصر. ابدأ بإضافة أول عنصر غنيمة.',
    itemNameEn: 'اسم العنصر (إنجليزي)',
    itemNameAr: 'اسم العنصر (عربي)',
    itemNamePlaceholder: 'اكتب للبحث في المكتبة...',
    autocompleteHint: 'اختر من المكتبة أو اكتب اسمًا مخصصًا.',
    itemNameArPlaceholder: 'الاسم بالعربي (اختياري)',
    imageUrl: 'رابط الصورة',
    imageUrlPlaceholder: 'https://...',
    uploadImage: 'أو ارفع صورة من جهازك',
    price: 'السعر (كوين)',
    gridSize: 'حجم الشبكة / الخانات',
    rarity: 'الندرة',
    cancel: 'إلغاء',
    save: 'حفظ',
    edit: 'تعديل',
    delete: 'حذف',
    confirmDeleteTitle: 'تأكيد الحذف',
    confirmDeleteBody: 'هل أنت متأكد أنك تريد حذف هذا العنصر؟ لا يمكن التراجع عن هذا الإجراء.',
    itemCount: (n) => `${n} عنصر`,
    addedMsg: 'تمت إضافة العنصر بنجاح.',
    updatedMsg: 'تم تحديث العنصر بنجاح.',
    deletedMsg: 'تم حذف العنصر.',
    errorMsg: 'حدث خطأ ما. حاول مرة أخرى.',
    customEntry: 'إدخال مخصص',
    slots: 'خانة'
  }
};

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
let currentLang = localStorage.getItem('abt_lang') || 'en';
let items = [];
let library = [];
let filters = { search: '', grid: 'all', rarity: 'all' };
let editingId = null;
let pendingDeleteId = null;
let activeAutocompleteIndex = -1;
let selectedLibraryMatch = null;

// ---------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------
const el = (id) => document.getElementById(id);
const itemsContainer = el('itemsContainer');
const emptyState = el('emptyState');
const searchInput = el('searchInput');
const filterGrid = el('filterGrid');
const filterRarity = el('filterRarity');
const itemModalEl = el('itemModal');
const deleteModalEl = el('deleteModal');
const itemModal = new bootstrap.Modal(itemModalEl);
const deleteModal = new bootstrap.Modal(deleteModalEl);
const toastEl = el('mainToast');
const toast = new bootstrap.Toast(toastEl, { delay: 2600 });
const topLoadingBar = el('topLoadingBar');

// ---------------------------------------------------------------------
// Global "top bar" loading indicator — fills while a save/edit/delete
// request is in flight, so the user gets visible feedback instead of
// tapping the button repeatedly on a slow connection.
// ---------------------------------------------------------------------
let activeRequests = 0;
function startLoading() {
  activeRequests++;
  if (activeRequests > 1) return;
  topLoadingBar.classList.add('is-active');
  topLoadingBar.style.transition = 'none';
  topLoadingBar.style.width = '0%';
  // Force reflow so the transition below actually animates from 0%.
  void topLoadingBar.offsetWidth;
  topLoadingBar.style.transition = 'width 8s cubic-bezier(0.12, 0.6, 0.2, 1)';
  topLoadingBar.style.width = '88%';
  // Also briefly ignore clicks on item cards while something is in flight,
  // so a user can't fire off a second edit/delete before the first lands.
  itemsContainer.classList.add('is-busy');
}
function stopLoading() {
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests > 0) return;
  itemsContainer.classList.remove('is-busy');
  topLoadingBar.style.transition = 'width 0.25s ease-out';
  topLoadingBar.style.width = '100%';
  setTimeout(() => {
    topLoadingBar.classList.remove('is-active');
    topLoadingBar.style.transition = 'none';
    topLoadingBar.style.width = '0%';
  }, 300);
}

// Disables a button and swaps its label for a small spinner + text while
// an async action runs, so a slow request can't be triggered twice by
// repeated taps. Always restores the button afterward, even on error.
async function withButtonLoading(btn, loadingLabel, fn) {
  const originalHtml = btn.innerHTML;
  const originalDisabled = btn.disabled;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${loadingLabel}`;
  try {
    return await fn();
  } finally {
    btn.disabled = originalDisabled;
    btn.innerHTML = originalHtml;
  }
}

// ---------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------
function t(key) {
  return translations[currentLang][key] ?? key;
}

function applyTranslations() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.body.classList.toggle('lang-ar', currentLang === 'ar');

  document.querySelectorAll('[data-i18n]').forEach((elm) => {
    const key = elm.getAttribute('data-i18n');
    const val = t(key);
    if (typeof val === 'string') elm.textContent = val;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((elm) => {
    elm.setAttribute('placeholder', t(elm.getAttribute('data-i18n-placeholder')));
  });

  document.querySelectorAll('[data-i18n-title]').forEach((elm) => {
    elm.setAttribute('title', t(elm.getAttribute('data-i18n-title')));
  });

  // Bootstrap CSS swap for RTL
  const bsLink = el('bootstrap-css');
  bsLink.href = currentLang === 'ar'
    ? 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css'
    : 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';

  el('langToggleLabel').textContent = currentLang === 'ar' ? 'English' : 'العربية';
  document.title = t('pageTitle');

  renderItems();
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('abt_lang', lang);
  applyTranslations();
}

el('langToggleBtn').addEventListener('click', () => {
  setLanguage(currentLang === 'ar' ? 'en' : 'ar');
});

// ---------------------------------------------------------------------
// Toast helper
// ---------------------------------------------------------------------
function showToast(message) {
  el('toastBody').textContent = message;
  toast.show();
}

// ---------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------
async function fetchItems() {
  startLoading();
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('Failed to load items');
    items = await res.json();
    renderItems();
  } catch (err) {
    console.error(err);
    showToast(t('errorMsg'));
  } finally {
    stopLoading();
  }
}

async function fetchLibrary() {
  try {
    const res = await fetch(LIBRARY_URL);
    library = await res.json();
  } catch (err) {
    console.error('Could not load item library', err);
    library = [];
  }
}

async function saveItem(payload, id) {
  const url = id ? `${API_URL}/${id}` : API_URL;
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Save failed');
  }
  return res.json();
}

async function deleteItemRequest(id) {
  const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
}

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------
function formatPrice(n) {
  return Number(n || 0).toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US');
}

function getFilteredItems() {
  return items.filter((item) => {
    const matchesSearch =
      !filters.search ||
      item.name?.toLowerCase().includes(filters.search) ||
      (item.name_ar && item.name_ar.includes(filters.search));
    const matchesGrid = filters.grid === 'all' || String(item.grid_size) === filters.grid;
    const matchesRarity = filters.rarity === 'all' || item.rarity === filters.rarity;
    return matchesSearch && matchesGrid && matchesRarity;
  });
}

function renderItems() {
  const filtered = getFilteredItems();

  itemsContainer.innerHTML = '';
  emptyState.classList.toggle('d-none', filtered.length > 0);

  el('itemCountLabel').textContent = t('itemCount')(filtered.length);
  const total = filtered.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  el('totalValueLabel').textContent = formatPrice(total);

  filtered.forEach((item) => {
    const col = document.createElement('div');
    col.className = 'col-6 col-md-4 col-lg-3';

    const displayName = item.name;
    const displayNameAr = item.name_ar;

    col.innerHTML = `
      <div class="item-card rarity-${item.rarity}">
        <div class="card-img-wrap">
          <img src="${escapeHtml(item.image_url || 'https://placehold.co/128x128/2a2a2a/777?text=?')}"
               alt="${escapeHtml(displayName)}"
               onerror="this.src='https://placehold.co/128x128/2a2a2a/777?text=?'">
        </div>
        <div class="card-body">
          <div class="item-name">${escapeHtml(displayName)}</div>
          ${displayNameAr ? `<div class="item-name-ar">${escapeHtml(displayNameAr)}</div>` : ''}
          <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
            <span class="badge badge-rarity-${item.rarity}">${t('rarity' + capitalize(item.rarity))}</span>
            <span class="badge badge-grid">${item.grid_size} ${t('slots')}</span>
          </div>
          <div class="d-flex justify-content-between align-items-center">
            <span class="item-price">${formatPrice(item.price)} <small class="text-muted">${t('koen')}</small></span>
            <div class="item-actions d-flex gap-1">
              <button class="btn btn-sm btn-outline-light" data-action="edit" data-id="${item.id}" title="${t('edit')}">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${item.id}" title="${t('delete')}">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    itemsContainer.appendChild(col);
  });
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------------------------------------------------------------------
// Filters & Search
// ---------------------------------------------------------------------
searchInput.addEventListener('input', (e) => {
  filters.search = e.target.value.trim().toLowerCase();
  renderItems();
});
filterGrid.addEventListener('change', (e) => {
  filters.grid = e.target.value;
  renderItems();
});
filterRarity.addEventListener('change', (e) => {
  filters.rarity = e.target.value;
  renderItems();
});
el('clearFiltersBtn').addEventListener('click', () => {
  filters = { search: '', grid: 'all', rarity: 'all' };
  searchInput.value = '';
  filterGrid.value = 'all';
  filterRarity.value = 'all';
  renderItems();
});

// ---------------------------------------------------------------------
// Item list click delegation (edit / delete)
// ---------------------------------------------------------------------
itemsContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = Number(btn.getAttribute('data-id'));
  const action = btn.getAttribute('data-action');

  if (action === 'edit') openEditModal(id);
  if (action === 'delete') openDeleteModal(id);
});

// ---------------------------------------------------------------------
// Add / Edit Modal
// ---------------------------------------------------------------------
const itemForm = el('itemForm');
const itemNameInput = el('itemNameInput');
const itemNameArInput = el('itemNameArInput');
const imageUrlInput = el('imageUrlInput');
const imageFileInput = el('imageFileInput');
const imagePreview = el('imagePreview');
const priceInput = el('priceInput');
const gridSizeInput = el('gridSizeInput');
const autocompleteList = el('autocompleteList');

// Holds a base64 data URL when the user picks a photo from their device.
// Takes priority over imageUrlInput's value when saving, and is cleared
// whenever the user types a URL instead.
let uploadedImageData = null;

// Reads an image file, downsizes it (so it doesn't bloat the database),
// and resolves with a compact base64 JPEG data URL.
function resizeImageFile(file, maxDim = 500, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

imageFileInput.addEventListener('change', async () => {
  const file = imageFileInput.files && imageFileInput.files[0];
  if (!file) return;
  try {
    const dataUrl = await resizeImageFile(file);
    uploadedImageData = dataUrl;
    imageUrlInput.value = '';
    imagePreview.src = dataUrl;
  } catch (err) {
    console.error(err);
    showToast(t('errorMsg'));
  }
});

el('openAddModalBtn').addEventListener('click', () => {
  openAddModal();
});

function resetForm() {
  editingId = null;
  selectedLibraryMatch = null;
  uploadedImageData = null;
  el('itemId').value = '';
  itemForm.reset();
  imageFileInput.value = '';
  imagePreview.src = 'https://placehold.co/80x80/2a2a2a/777?text=?';
  hideAutocomplete();
  document.querySelector('input[name="rarity"][value="purple"]').checked = true;
}

function openAddModal() {
  resetForm();
  el('itemModalTitle').textContent = t('addItem');
  itemModal.show();
  setTimeout(() => itemNameInput.focus(), 300);
}

function openEditModal(id) {
  // Compare loosely by numeric value: depending on how the database driver
  // serializes the id column, item.id and the id read off the button's
  // data-id attribute aren't always the exact same JS type, and `===` on
  // mismatched types (e.g. a string vs a number) silently fails, which is
  // why Edit could do nothing when clicked.
  const item = items.find((i) => Number(i.id) === Number(id));
  if (!item) return;
  resetForm();
  editingId = id;
  el('itemId').value = id;
  el('itemModalTitle').textContent = t('edit');
  itemNameInput.value = item.name;
  itemNameArInput.value = item.name_ar || '';
  const isDataImage = !!(item.image_url && item.image_url.startsWith('data:'));
  imageUrlInput.value = isDataImage ? '' : (item.image_url || '');
  uploadedImageData = isDataImage ? item.image_url : null;
  imagePreview.src = item.image_url || 'https://placehold.co/80x80/2a2a2a/777?text=?';
  priceInput.value = item.price;
  gridSizeInput.value = item.grid_size;
  const radio = document.querySelector(`input[name="rarity"][value="${item.rarity}"]`);
  if (radio) radio.checked = true;
  itemModal.show();
}

imageUrlInput.addEventListener('input', () => {
  uploadedImageData = null;
  imageFileInput.value = '';
  imagePreview.src = imageUrlInput.value || 'https://placehold.co/80x80/2a2a2a/777?text=?';
});

itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const rarity = itemForm.querySelector('input[name="rarity"]:checked')?.value || 'blue';

  const payload = {
    name: itemNameInput.value.trim(),
    name_ar: itemNameArInput.value.trim() || null,
    image_url: uploadedImageData || imageUrlInput.value.trim() || null,
    price: Number(priceInput.value) || 0,
    grid_size: Number(gridSizeInput.value),
    rarity
  };

  if (!payload.name) return;

  const saveBtn = itemForm.querySelector('button[type="submit"]');
  startLoading();
  try {
    await withButtonLoading(saveBtn, t('save'), () => saveItem(payload, editingId));
    itemModal.hide();
    showToast(editingId ? t('updatedMsg') : t('addedMsg'));
    await fetchItems();
  } catch (err) {
    console.error(err);
    showToast(t('errorMsg'));
  } finally {
    stopLoading();
  }
});

// ---------------------------------------------------------------------
// Delete Modal
// ---------------------------------------------------------------------
function openDeleteModal(id) {
  pendingDeleteId = id;
  deleteModal.show();
}

el('confirmDeleteBtn').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  const btn = el('confirmDeleteBtn');
  startLoading();
  try {
    await withButtonLoading(btn, t('delete'), () => deleteItemRequest(pendingDeleteId));
    deleteModal.hide();
    showToast(t('deletedMsg'));
    await fetchItems();
  } catch (err) {
    console.error(err);
    showToast(t('errorMsg'));
  } finally {
    stopLoading();
    pendingDeleteId = null;
  }
});

// ---------------------------------------------------------------------
// Smart Auto-Complete (name -> library lookup)
// ---------------------------------------------------------------------
itemNameInput.addEventListener('input', () => {
  selectedLibraryMatch = null;
  const query = itemNameInput.value.trim().toLowerCase();
  activeAutocompleteIndex = -1;

  if (!query) return hideAutocomplete();

  const matches = library.filter((it) => it.name.toLowerCase().includes(query)).slice(0, 8);
  renderAutocomplete(matches);
});

itemNameInput.addEventListener('keydown', (e) => {
  const optionsEls = autocompleteList.querySelectorAll('.autocomplete-item');
  if (!optionsEls.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeAutocompleteIndex = Math.min(activeAutocompleteIndex + 1, optionsEls.length - 1);
    highlightAutocomplete(optionsEls);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeAutocompleteIndex = Math.max(activeAutocompleteIndex - 1, 0);
    highlightAutocomplete(optionsEls);
  } else if (e.key === 'Enter') {
    if (activeAutocompleteIndex >= 0) {
      e.preventDefault();
      optionsEls[activeAutocompleteIndex].click();
    }
  } else if (e.key === 'Escape') {
    hideAutocomplete();
  }
});

function highlightAutocomplete(optionsEls) {
  optionsEls.forEach((o, idx) => o.classList.toggle('active', idx === activeAutocompleteIndex));
  if (activeAutocompleteIndex >= 0) {
    optionsEls[activeAutocompleteIndex].scrollIntoView({ block: 'nearest' });
  }
}

function renderAutocomplete(matches) {
  if (!matches.length) {
    autocompleteList.innerHTML = `<div class="autocomplete-empty">${t('customEntry')}</div>`;
    autocompleteList.classList.remove('d-none');
    return;
  }

  autocompleteList.innerHTML = matches.map((item, idx) => `
    <div class="autocomplete-item" data-index="${idx}">
      <img src="${escapeHtml(item.image_url)}" alt="">
      <div class="ac-name">
        <div>${escapeHtml(item.name)}</div>
        ${item.name_ar ? `<div class="ac-name-ar">${escapeHtml(item.name_ar)}</div>` : ''}
      </div>
      <span class="badge badge-rarity-${item.rarity}">${t('rarity' + capitalize(item.rarity))}</span>
    </div>
  `).join('');

  autocompleteList.classList.remove('d-none');

  autocompleteList.querySelectorAll('.autocomplete-item').forEach((elm) => {
    elm.addEventListener('click', () => {
      const idx = Number(elm.getAttribute('data-index'));
      applyLibraryItem(matches[idx]);
    });
  });
}

function applyLibraryItem(libItem) {
  selectedLibraryMatch = libItem;
  itemNameInput.value = libItem.name;
  itemNameArInput.value = libItem.name_ar || '';
  imageUrlInput.value = libItem.image_url || '';
  imagePreview.src = libItem.image_url || 'https://placehold.co/80x80/2a2a2a/777?text=?';
  gridSizeInput.value = libItem.grid_size;
  const radio = document.querySelector(`input[name="rarity"][value="${libItem.rarity}"]`);
  if (radio) radio.checked = true;
  hideAutocomplete();
}

function hideAutocomplete() {
  autocompleteList.classList.add('d-none');
  autocompleteList.innerHTML = '';
  activeAutocompleteIndex = -1;
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#itemNameInput') && !e.target.closest('#autocompleteList')) {
    hideAutocomplete();
  }
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
(async function init() {
  applyTranslations();
  await fetchLibrary();
  await fetchItems();
})();
