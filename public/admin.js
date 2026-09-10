// =====================================================================
// لوحة التحكم — إدارة حسابات المتجر
// =====================================================================

const API_BASE = '/api/admin/accounts';
const LOGIN_URL = '/api/admin/login';
const SETUP_STATUS_URL = '/api/admin/setup-status';
const SETUP_URL = '/api/admin/setup';
const REGENERATE_PASSWORD_URL = '/api/admin/regenerate-password';
const PASSWORD_STORAGE_KEY = 'store_admin_password';

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
let accounts = [];
let filters = { code: '', status: 'all' };
let editingId = null;
let pendingDeleteId = null;
let uploadedImageData = null;

// ---------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------
const el = (id) => document.getElementById(id);
const setupScreen = el('setupScreen');
const loginScreen = el('loginScreen');
const adminPanel = el('adminPanel');
const loginForm = el('loginForm');
const loginPasswordInput = el('loginPasswordInput');
const loginError = el('loginError');

const setupBeforeGenerate = el('setupBeforeGenerate');
const setupAfterGenerate = el('setupAfterGenerate');
const generatePasswordBtn = el('generatePasswordBtn');
const generatedPasswordDisplay = el('generatedPasswordDisplay');
const copyGeneratedPasswordBtn = el('copyGeneratedPasswordBtn');
const continueToLoginBtn = el('continueToLoginBtn');

const regeneratePasswordBtn = el('regeneratePasswordBtn');
const newPasswordModalEl = el('newPasswordModal');
const newPasswordDisplay = el('newPasswordDisplay');
const copyNewPasswordBtn = el('copyNewPasswordBtn');
const closeNewPasswordModalBtn = el('closeNewPasswordModalBtn');

const accountsContainer = el('accountsContainer');
const emptyState = el('emptyState');
const codeSearchInput = el('codeSearchInput');
const statusFilter = el('statusFilter');
const topLoadingBar = el('topLoadingBar');
const toastEl = el('mainToast');
const toast = new bootstrap.Toast(toastEl, { delay: 2600 });

const itemModalEl = el('itemModal');
const deleteModalEl = el('deleteModal');
const itemModal = new bootstrap.Modal(itemModalEl);
const deleteModal = new bootstrap.Modal(deleteModalEl);
const newPasswordModal = new bootstrap.Modal(newPasswordModalEl);

const itemForm = el('itemForm');
const titleInput = el('titleInput');
const imageUrlInput = el('imageUrlInput');
const imageFileInput = el('imageFileInput');
const imagePreview = el('imagePreview');
const gemsInput = el('gemsInput');
const goldBarsInput = el('goldBarsInput');
const priceUsdInput = el('priceUsdInput');
const priceFlexyInput = el('priceFlexyInput');
const priceBaridimobInput = el('priceBaridimobInput');
const noteInput = el('noteInput');
const codeFieldWrap = el('codeFieldWrap');
const codeDisplay = el('codeDisplay');
const regenerateCodeBtn = el('regenerateCodeBtn');

const PLACEHOLDER_IMG = 'https://placehold.co/80x80/1a1a1a/777?text=?';

function getStoredPassword() {
  return localStorage.getItem(PASSWORD_STORAGE_KEY) || '';
}

function authHeaders() {
  return { 'x-admin-password': getStoredPassword() };
}

function showToast(message) {
  el('toastBody').textContent = message;
  toast.show();
}

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

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}
function formatMoney(n) {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// =====================================================================
// Auth
// =====================================================================
async function tryAutoLogin() {
  let configured = true;
  try {
    const res = await fetch(SETUP_STATUS_URL);
    const data = await res.json();
    configured = !!data.configured;
  } catch (err) {
    console.error(err);
  }

  if (!configured) return showSetup();

  const saved = getStoredPassword();
  if (!saved) return showLogin();
  const ok = await checkPassword(saved);
  if (ok) showPanel();
  else showLogin();
}

async function checkPassword(password) {
  try {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    return res.ok;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function hideAllScreens() {
  setupScreen.classList.add('d-none');
  loginScreen.classList.add('d-none');
  adminPanel.classList.add('d-none');
}

function showSetup() {
  hideAllScreens();
  setupScreen.classList.remove('d-none');
  setupBeforeGenerate.classList.remove('d-none');
  setupAfterGenerate.classList.add('d-none');
}

function showLogin() {
  hideAllScreens();
  loginScreen.classList.remove('d-none');
  setTimeout(() => loginPasswordInput.focus(), 100);
}

function showPanel() {
  hideAllScreens();
  adminPanel.classList.remove('d-none');
  fetchAccounts();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('d-none');
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  const password = loginPasswordInput.value;
  await withButtonLoading(submitBtn, 'جارٍ التحقق...', async () => {
    const ok = await checkPassword(password);
    if (ok) {
      localStorage.setItem(PASSWORD_STORAGE_KEY, password);
      showPanel();
    } else {
      loginError.classList.remove('d-none');
    }
  });
});

el('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem(PASSWORD_STORAGE_KEY);
  showLogin();
});

// ---------------------------------------------------------------------
// First-time setup: generate a random password, stored (hashed) in the
// database. Shown only once, then the user must log in normally.
// ---------------------------------------------------------------------
let lastGeneratedPassword = '';

generatePasswordBtn.addEventListener('click', async () => {
  await withButtonLoading(generatePasswordBtn, 'جارٍ التوليد...', async () => {
    try {
      const res = await fetch(SETUP_URL, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'فشل توليد كلمة المرور');
        if (data.code === 'ALREADY_CONFIGURED') showLogin();
        return;
      }
      lastGeneratedPassword = data.password;
      generatedPasswordDisplay.value = data.password;
      setupBeforeGenerate.classList.add('d-none');
      setupAfterGenerate.classList.remove('d-none');
    } catch (err) {
      console.error(err);
      showToast('تعذر الاتصال بالخادم');
    }
  });
});

copyGeneratedPasswordBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lastGeneratedPassword);
    showToast('تم نسخ كلمة المرور');
  } catch (err) {
    console.error(err);
  }
});

continueToLoginBtn.addEventListener('click', () => {
  loginPasswordInput.value = lastGeneratedPassword;
  showLogin();
});

// ---------------------------------------------------------------------
// Regenerate password from inside the already-logged-in panel.
// ---------------------------------------------------------------------
regeneratePasswordBtn.addEventListener('click', async () => {
  if (!confirm('سيتم إنشاء كلمة مرور جديدة وإلغاء القديمة نهائياً. هل تريد المتابعة؟')) return;
  await withButtonLoading(regeneratePasswordBtn, 'جارٍ التوليد...', async () => {
    try {
      const newPassword = await apiRequest(REGENERATE_PASSWORD_URL, { method: 'POST' });
      localStorage.setItem(PASSWORD_STORAGE_KEY, newPassword.password);
      newPasswordDisplay.value = newPassword.password;
      newPasswordModal.show();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'فشل توليد كلمة مرور جديدة');
    }
  });
});

copyNewPasswordBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(newPasswordDisplay.value);
    showToast('تم نسخ كلمة المرور');
  } catch (err) {
    console.error(err);
  }
});

closeNewPasswordModalBtn.addEventListener('click', () => {
  newPasswordModal.hide();
});

// =====================================================================
// API calls
// =====================================================================
async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), ...authHeaders() }
  });
  if (res.status === 401) {
    showToast('انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مجدداً.');
    localStorage.removeItem(PASSWORD_STORAGE_KEY);
    showLogin();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Request failed');
  }
  return res.json();
}

async function fetchAccounts() {
  startLoading();
  try {
    let url = API_BASE;
    if (filters.code.trim()) {
      url = `${API_BASE}/search?code=${encodeURIComponent(filters.code.trim())}`;
    }
    accounts = await apiRequest(url);
    renderAccounts();
  } catch (err) {
    console.error(err);
    if (err.message !== 'Unauthorized') showToast('حدث خطأ أثناء تحميل الحسابات.');
  } finally {
    stopLoading();
  }
}

async function saveAccount(payload, id) {
  const url = id ? `${API_BASE}/${id}` : API_BASE;
  const method = id ? 'PUT' : 'POST';
  return apiRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function deleteAccountRequest(id) {
  return apiRequest(`${API_BASE}/${id}`, { method: 'DELETE' });
}

async function regenerateCodeRequest(id) {
  return apiRequest(`${API_BASE}/${id}/regenerate-code`, { method: 'POST' });
}

// =====================================================================
// Rendering
// =====================================================================
function getFilteredAccounts() {
  return accounts.filter((acc) => filters.status === 'all' || acc.status === filters.status);
}

function accountCardHtml(acc, idx) {
  const img = acc.image_url || PLACEHOLDER_IMG;
  const title = acc.title || `حساب #${acc.id}`;
  const isSold = acc.status === 'sold';

  return `
    <div class="account-card admin-card ${isSold ? 'is-sold' : ''}" style="animation-delay:${Math.min(idx, 12) * 30}ms">
      <div class="account-card-img">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMG}'">
        <span class="status-badge ${isSold ? 'status-sold' : 'status-available'}">${isSold ? 'مباع' : 'متوفر'}</span>
      </div>
      <div class="account-card-body">
        <div class="account-card-title">${escapeHtml(title)}</div>

        <div class="account-stats">
          <div class="stat-pill stat-gems"><img src="assets/gems-icon.png" alt="جواهر" class="stat-icon"><span>${formatNumber(acc.gems)}</span></div>
          <div class="stat-pill stat-gold"><img src="assets/shards-icon.png" alt="شظايا" class="stat-icon"><span>${formatNumber(acc.gold_bars)}</span></div>
        </div>

        <div class="price-list">
          <div class="price-row"><span class="price-label">دولار</span><span class="price-value">$${formatMoney(acc.price_usd)}</span></div>
          <div class="price-row"><span class="price-label">فليكسي</span><span class="price-value">${formatMoney(acc.price_flexy)} دج</span></div>
          <div class="price-row"><span class="price-label">بريدي موب</span><span class="price-value">${formatMoney(acc.price_baridimob)} دج</span></div>
        </div>

        <div class="code-row">
          <span class="code-label">الكود</span>
          <span class="code-value">${escapeHtml(acc.code)}</span>
        </div>

        <div class="item-actions d-flex gap-1 mt-2">
          <button class="btn btn-sm btn-outline-light flex-fill" data-action="edit" data-id="${acc.id}">
            <i class="bi bi-pencil"></i> تعديل
          </button>
          <button class="btn btn-sm btn-outline-${isSold ? 'success' : 'secondary'} flex-fill" data-action="toggle-status" data-id="${acc.id}">
            <i class="bi bi-arrow-repeat"></i> ${isSold ? 'متوفر' : 'مباع'}
          </button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${acc.id}">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderAccounts() {
  const filtered = getFilteredAccounts();
  accountsContainer.innerHTML = filtered.map((acc, idx) => accountCardHtml(acc, idx)).join('');
  emptyState.classList.toggle('d-none', filtered.length > 0);
  el('itemCountLabel').textContent = `${filtered.length} حساب`;
}

// =====================================================================
// Filters
// =====================================================================
let codeSearchTimer = null;
codeSearchInput.addEventListener('input', (e) => {
  filters.code = e.target.value;
  clearTimeout(codeSearchTimer);
  codeSearchTimer = setTimeout(() => fetchAccounts(), 300);
});
statusFilter.addEventListener('change', (e) => {
  filters.status = e.target.value;
  renderAccounts();
});
el('clearAdminFiltersBtn').addEventListener('click', () => {
  filters = { code: '', status: 'all' };
  codeSearchInput.value = '';
  statusFilter.value = 'all';
  fetchAccounts();
});

// =====================================================================
// Card actions (edit / delete / toggle status)
// =====================================================================
accountsContainer.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = Number(btn.getAttribute('data-id'));
  const action = btn.getAttribute('data-action');

  if (action === 'edit') openEditModal(id);
  if (action === 'delete') openDeleteModal(id);
  if (action === 'toggle-status') {
    const acc = accounts.find((a) => Number(a.id) === id);
    if (!acc) return;
    const newStatus = acc.status === 'sold' ? 'available' : 'sold';
    startLoading();
    try {
      await withButtonLoading(btn, '...', () => saveAccount({ status: newStatus }, id));
      await fetchAccounts();
    } catch (err) {
      console.error(err);
      if (err.message !== 'Unauthorized') showToast('حدث خطأ ما.');
    } finally {
      stopLoading();
    }
  }
});

// =====================================================================
// Add / Edit modal
// =====================================================================
function resetForm() {
  editingId = null;
  uploadedImageData = null;
  el('itemId').value = '';
  itemForm.reset();
  imageFileInput.value = '';
  imagePreview.src = PLACEHOLDER_IMG;
  codeFieldWrap.classList.add('d-none');
  codeDisplay.value = '';
  document.querySelector('input[name="status"][value="available"]').checked = true;
}

el('openAddModalBtn').addEventListener('click', () => {
  resetForm();
  el('itemModalTitle').textContent = 'إضافة حساب';
  itemModal.show();
  setTimeout(() => titleInput.focus(), 300);
});

function openEditModal(id) {
  const acc = accounts.find((a) => Number(a.id) === Number(id));
  if (!acc) return;
  resetForm();
  editingId = id;
  el('itemId').value = id;
  el('itemModalTitle').textContent = 'تعديل الحساب';

  titleInput.value = acc.title || '';
  const isDataImage = !!(acc.image_url && acc.image_url.startsWith('data:'));
  imageUrlInput.value = isDataImage ? '' : (acc.image_url || '');
  uploadedImageData = isDataImage ? acc.image_url : null;
  imagePreview.src = acc.image_url || PLACEHOLDER_IMG;

  gemsInput.value = acc.gems;
  goldBarsInput.value = acc.gold_bars;
  priceUsdInput.value = acc.price_usd;
  priceFlexyInput.value = acc.price_flexy;
  priceBaridimobInput.value = acc.price_baridimob;
  noteInput.value = acc.note || '';

  const radio = document.querySelector(`input[name="status"][value="${acc.status}"]`);
  if (radio) radio.checked = true;

  codeFieldWrap.classList.remove('d-none');
  codeDisplay.value = acc.code;

  itemModal.show();
}

imageUrlInput.addEventListener('input', () => {
  uploadedImageData = null;
  imageFileInput.value = '';
  imagePreview.src = imageUrlInput.value || PLACEHOLDER_IMG;
});

// Reads an image file, downsizes it, resolves with a compact base64 JPEG data URL.
function resizeImageFile(file, maxDim = 700, quality = 0.8) {
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
    showToast('تعذّر قراءة هذه الصورة.');
  }
});

regenerateCodeBtn.addEventListener('click', async () => {
  if (!editingId) return;
  startLoading();
  try {
    const updated = await withButtonLoading(regenerateCodeBtn, '', () => regenerateCodeRequest(editingId));
    codeDisplay.value = updated.code;
    const idx = accounts.findIndex((a) => Number(a.id) === Number(editingId));
    if (idx !== -1) accounts[idx] = updated;
    showToast('تم توليد كود جديد.');
  } catch (err) {
    console.error(err);
    if (err.message !== 'Unauthorized') showToast('تعذّر توليد كود جديد.');
  } finally {
    stopLoading();
  }
});

itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = itemForm.querySelector('input[name="status"]:checked')?.value || 'available';

  const payload = {
    title: titleInput.value.trim() || null,
    image_url: uploadedImageData || imageUrlInput.value.trim() || null,
    gems: Number(gemsInput.value) || 0,
    gold_bars: Number(goldBarsInput.value) || 0,
    price_usd: Number(priceUsdInput.value) || 0,
    price_flexy: Number(priceFlexyInput.value) || 0,
    price_baridimob: Number(priceBaridimobInput.value) || 0,
    note: noteInput.value.trim() || null,
    status
  };

  const saveBtn = itemForm.querySelector('button[type="submit"]');
  startLoading();
  try {
    await withButtonLoading(saveBtn, 'جارٍ الحفظ...', () => saveAccount(payload, editingId));
    itemModal.hide();
    showToast(editingId ? 'تم تحديث الحساب بنجاح.' : 'تمت إضافة الحساب بنجاح.');
    await fetchAccounts();
  } catch (err) {
    console.error(err);
    if (err.message !== 'Unauthorized') showToast('حدث خطأ ما. حاول مرة أخرى.');
  } finally {
    stopLoading();
  }
});

// =====================================================================
// Delete modal
// =====================================================================
function openDeleteModal(id) {
  pendingDeleteId = id;
  deleteModal.show();
}

el('confirmDeleteBtn').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  const btn = el('confirmDeleteBtn');
  startLoading();
  try {
    await withButtonLoading(btn, 'حذف...', () => deleteAccountRequest(pendingDeleteId));
    deleteModal.hide();
    showToast('تم حذف الحساب.');
    await fetchAccounts();
  } catch (err) {
    console.error(err);
    if (err.message !== 'Unauthorized') showToast('حدث خطأ ما.');
  } finally {
    stopLoading();
    pendingDeleteId = null;
  }
});

// =====================================================================
// Init
// =====================================================================
tryAutoLogin();
