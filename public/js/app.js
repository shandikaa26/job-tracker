/* ══════════════════════════════════════════════════════════
   JobTracker — Frontend Application with Multi-User Auth
   ══════════════════════════════════════════════════════════ */

// ─── State ────────────────────────────────────────────────
let currentUser = null;
let jobs = [];
let stats = {};
let editingJobId = null;
let selectedFile = null;
let currentView = 'grid'; // 'grid' or 'kanban'
let apiKeyStatus = { hasKey: false, maskedKey: '' };

// ─── Constants ────────────────────────────────────────────
const STATUSES = [
  'Applied', 'Screening', 'Phone Interview', 'Technical Test',
  'Interview', 'Final Interview', 'Offering', 'Accepted', 'Rejected'
];

const STATUS_ICONS = {
  'Applied': 'fa-paper-plane',
  'Screening': 'fa-magnifying-glass',
  'Phone Interview': 'fa-phone',
  'Technical Test': 'fa-code',
  'Interview': 'fa-users',
  'Final Interview': 'fa-user-tie',
  'Offering': 'fa-handshake',
  'Accepted': 'fa-circle-check',
  'Rejected': 'fa-circle-xmark'
};

const KANBAN_COLUMNS = [
  { id: 'Applied', label: 'Applied', icon: 'fa-paper-plane', color: 'var(--status-applied)' },
  { id: 'Screening', label: 'Screening', icon: 'fa-magnifying-glass', color: 'var(--status-screening)' },
  { id: 'InterviewGroup', label: 'Interview & Test', icon: 'fa-users', color: 'var(--status-interview)' },
  { id: 'Offering', label: 'Offering', icon: 'fa-handshake', color: 'var(--status-offering)' },
  { id: 'Accepted', label: 'Accepted 🎉', icon: 'fa-circle-check', color: 'var(--status-accepted)' },
  { id: 'Rejected', label: 'Rejected', icon: 'fa-circle-xmark', color: 'var(--danger)' }
];

const API = '/api/jobs';
const AUTH_API = '/api/auth';

// ─── Helper Functions ─────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

function statusClass(status) {
  return 'status-' + status.toLowerCase().replace(/\s+/g, '-');
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function getNextStatus(currentStatus) {
  switch (currentStatus) {
    case 'Applied': return 'Screening';
    case 'Screening': return 'Interview';
    case 'Phone Interview': return 'Technical Test';
    case 'Technical Test': return 'Interview';
    case 'Interview': return 'Final Interview';
    case 'Final Interview': return 'Offering';
    case 'Offering': return 'Accepted';
    default: return null;
  }
}

function getStageLevel(status) {
  switch (status) {
    case 'Applied': return 1;
    case 'Screening': return 2;
    case 'Phone Interview':
    case 'Technical Test':
    case 'Interview':
    case 'Final Interview': return 3;
    case 'Offering': return 4;
    case 'Accepted': return 5;
    case 'Rejected': return -1;
    default: return 1;
  }
}

// ─── Toast Notifications ─────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ─── Loading Overlay ──────────────────────────────────────

function showLoading(msg = 'AI sedang menganalisis...') {
  document.getElementById('loadingText').textContent = msg;
  document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

// ─── Modal Management ─────────────────────────────────────

function openModal(id) {
  document.getElementById(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  document.body.style.overflow = '';
}

function handleOverlayClick(e, modalId) {
  if (e.target === e.currentTarget) {
    closeModal(modalId);
  }
}

// ─── Tab Switching ────────────────────────────────────────

function switchTab(tabName) {
  document.querySelectorAll('#inputTabs .tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
  const pane = document.getElementById(tabName + 'Pane');
  if (pane) pane.classList.add('active');
}

// ─── View Switching (Grid vs Kanban) ─────────────────────

function switchView(view) {
  currentView = view;
  const gridContainer = document.getElementById('jobsGrid');
  const kanbanContainer = document.getElementById('kanbanBoard');
  const gridBtn = document.getElementById('viewGridBtn');
  const kanbanBtn = document.getElementById('viewKanbanBtn');

  if (view === 'grid') {
    gridBtn.classList.add('active');
    kanbanBtn.classList.remove('active');
    gridContainer.classList.remove('hidden');
    kanbanContainer.classList.add('hidden');
  } else {
    kanbanBtn.classList.add('active');
    gridBtn.classList.remove('active');
    kanbanContainer.classList.remove('hidden');
    gridContainer.classList.add('hidden');
  }

  renderJobs();
}

// ─── API Fetcher ──────────────────────────────────────────

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan sistem');
  return data;
}

// ─── Authentication Management ────────────────────────────

function openAuthModal(mode = 'login') {
  switchAuthTab(mode);
  openModal('authModal');
}

function switchAuthTab(mode) {
  const tabLogin = document.getElementById('tabAuthLogin');
  const tabRegister = document.getElementById('tabAuthRegister');
  const formLogin = document.getElementById('loginForm');
  const formRegister = document.getElementById('registerForm');
  const modalTitle = document.getElementById('authModalTitle');

  if (mode === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
    modalTitle.innerHTML = '<i class="fas fa-sign-in-alt"></i> Masuk ke Akun Anda';
  } else {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.classList.remove('hidden');
    formLogin.classList.add('hidden');
    modalTitle.innerHTML = '<i class="fas fa-user-plus"></i> Daftar Akun Baru';
  }
}

async function checkAuthStatus() {
  try {
    const res = await apiFetch(`${AUTH_API}/me`);
    const profileBar = document.getElementById('userProfileBar');
    const loginBtn = document.getElementById('loginHeaderBtn');
    const authPrompt = document.getElementById('authPromptBanner');

    if (res.authenticated && res.user) {
      currentUser = res.user;
      document.getElementById('userNameLabel').textContent = currentUser.name;
      document.getElementById('userAvatarBadge').textContent = currentUser.name.charAt(0).toUpperCase();

      profileBar.classList.remove('hidden');
      loginBtn.classList.add('hidden');
      authPrompt.classList.add('hidden');
    } else {
      currentUser = null;
      profileBar.classList.add('hidden');
      loginBtn.classList.remove('hidden');
      authPrompt.classList.remove('hidden');
    }
  } catch (err) {
    currentUser = null;
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  showLoading('Memverifikasi akun...');
  try {
    const res = await apiFetch(`${AUTH_API}/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    showToast(res.message, 'success');
    closeModal('authModal');
    document.getElementById('loginForm').reset();
    await refreshAll();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;

  showLoading('Mendaftarkan akun baru...');
  try {
    const res = await apiFetch(`${AUTH_API}/register`, {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    showToast(res.message, 'success');
    closeModal('authModal');
    document.getElementById('registerForm').reset();

    // Otomatis tawarkan buat sample demo
    await refreshAll();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function handleLogout() {
  try {
    await apiFetch(`${AUTH_API}/logout`, { method: 'POST' });
    showToast('Anda telah keluar dari akun.', 'info');
    await refreshAll();
    openAuthModal('login');
  } catch (err) {
    showToast('Gagal logout: ' + err.message, 'error');
  }
}

// ─── Settings & API Key ──────────────────────────────────

async function checkApiKeyStatus() {
  try {
    const data = await apiFetch(`${API}/settings`);
    apiKeyStatus = data;
    const indicator = document.getElementById('apiKeyIndicator');
    const banner = document.getElementById('apiKeyBanner');
    const statusText = document.getElementById('apiKeyStatusText');
    const input = document.getElementById('geminiApiKeyInput');

    if (data.hasKey) {
      indicator.classList.add('active');
      indicator.title = 'API Key Gemini Aktif';
      banner.classList.add('hidden');
      statusText.innerHTML = `Status: <span style="color:var(--success)">✅ Terpasang (${escapeHtml(data.maskedKey)})</span>`;
      input.placeholder = `Tersimpan: ${data.maskedKey} (Ketik baru jika ingin ganti)`;
    } else {
      indicator.classList.remove('active');
      indicator.title = 'API Key Gemini Belum Dipasang';
      banner.classList.remove('hidden');
      statusText.innerHTML = `Status: <span style="color:var(--danger)">⚠️ Belum terpasang</span>`;
      input.placeholder = 'Tempel API Key di sini (AIzaSy...)';
    }
  } catch (err) {
    console.error('Failed to check API key:', err);
  }
}

async function saveApiKey(e) {
  e.preventDefault();
  if (!currentUser) {
    showToast('Silakan login terlebih dahulu untuk menyimpan API Key', 'error');
    openAuthModal('login');
    return;
  }

  const input = document.getElementById('geminiApiKeyInput');
  const key = input.value.trim();

  if (!key) {
    showToast('Masukkan API Key terlebih dahulu', 'error');
    return;
  }

  try {
    const res = await apiFetch(`${API}/settings`, {
      method: 'POST',
      body: JSON.stringify({ apiKey: key })
    });
    showToast(res.message || 'API Key berhasil disimpan!', 'success');
    input.value = '';
    closeModal('settingsModal');
    await checkApiKeyStatus();
  } catch (err) {
    showToast('Gagal menyimpan API Key: ' + err.message, 'error');
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('geminiApiKeyInput');
  const icon = document.getElementById('toggleKeyIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
}

// ─── Data Loading ─────────────────────────────────────────

async function loadJobs() {
  if (!currentUser) {
    jobs = [];
    renderJobs();
    return;
  }

  const params = new URLSearchParams();
  const statusFilter = document.getElementById('filterStatus').value;
  const searchValue = document.getElementById('searchInput').value.trim();

  if (statusFilter !== 'all') params.set('status', statusFilter);
  if (searchValue) params.set('search', searchValue);

  try {
    jobs = await apiFetch(`${API}?${params}`);
    renderJobs();
  } catch (err) {
    showToast('Gagal memuat daftar lamaran: ' + err.message, 'error');
  }
}

async function loadStats() {
  if (!currentUser) {
    stats = { total: 0, statuses: {}, applied: 0, screening: 0, interview: 0, offering: 0, accepted: 0, rejected: 0 };
    renderStats();
    return;
  }

  try {
    stats = await apiFetch(`${API}/stats`);
    renderStats();
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function refreshAll() {
  await checkAuthStatus();
  await Promise.all([loadJobs(), loadStats(), checkApiKeyStatus()]);
}

// ─── Seed Sample Data ─────────────────────────────────────

async function seedSampleData() {
  if (!currentUser) {
    showToast('Silakan login terlebih dahulu untuk menambahkan contoh data', 'info');
    openAuthModal('login');
    return;
  }

  showLoading('Memuat 5 contoh lamaran kerja ke akun Anda...');
  try {
    const res = await apiFetch(`${API}/seed`, { method: 'POST' });
    showToast(res.message, 'success');
    await refreshAll();
  } catch (err) {
    showToast('Gagal memuat contoh data: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ─── Render Stats ─────────────────────────────────────────

function renderStats() {
  const grid = document.getElementById('statsGrid');
  grid.innerHTML = `
    <div class="stat-card stat-total">
      <div class="stat-icon"><i class="fas fa-briefcase"></i></div>
      <div class="stat-info">
        <span class="stat-number">${stats.total || 0}</span>
        <span class="stat-label">Total Dilamar</span>
      </div>
    </div>
    <div class="stat-card stat-progress">
      <div class="stat-icon"><i class="fas fa-arrows-spin"></i></div>
      <div class="stat-info">
        <span class="stat-number">${(stats.applied || 0) + (stats.screening || 0) + (stats.interview || 0)}</span>
        <span class="stat-label">Dalam Proses</span>
      </div>
    </div>
    <div class="stat-card stat-offering">
      <div class="stat-icon"><i class="fas fa-handshake"></i></div>
      <div class="stat-info">
        <span class="stat-number">${stats.offering || 0}</span>
        <span class="stat-label">Offering</span>
      </div>
    </div>
    <div class="stat-card stat-accepted">
      <div class="stat-icon"><i class="fas fa-award"></i></div>
      <div class="stat-info">
        <span class="stat-number">${stats.accepted || 0}</span>
        <span class="stat-label">Diterima 🎉</span>
      </div>
    </div>
    <div class="stat-card stat-rejected">
      <div class="stat-icon"><i class="fas fa-circle-xmark"></i></div>
      <div class="stat-info">
        <span class="stat-number">${stats.rejected || 0}</span>
        <span class="stat-label">Ditolak</span>
      </div>
    </div>
  `;
}

// ─── Render Main Views ────────────────────────────────────

function renderJobs() {
  const empty = document.getElementById('emptyState');
  const gridContainer = document.getElementById('jobsGrid');
  const kanbanContainer = document.getElementById('kanbanBoard');

  if (jobs.length === 0) {
    gridContainer.style.display = 'none';
    kanbanContainer.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';

  if (currentView === 'grid') {
    gridContainer.style.display = 'grid';
    kanbanContainer.style.display = 'none';
    renderGridView();
  } else {
    gridContainer.style.display = 'none';
    kanbanContainer.style.display = 'flex';
    renderKanbanView();
  }
}

// ─── Grid View Renderer ───────────────────────────────────

function renderGridView() {
  const grid = document.getElementById('jobsGrid');

  grid.innerHTML = jobs.map(job => {
    const nextStatus = getNextStatus(job.status);
    const level = getStageLevel(job.status);

    return `
      <div class="job-card" data-id="${job.id}" data-status="${escapeHtml(job.status)}" onclick="showDetail(${job.id})">
        <div class="card-top">
          <span class="status-badge ${statusClass(job.status)}">
            <i class="fas ${STATUS_ICONS[job.status] || 'fa-circle'}"></i>
            ${escapeHtml(job.status)}
          </span>
          <div class="card-actions" onclick="event.stopPropagation()">
            <button class="btn-icon" onclick="openEditModal(${job.id})" title="Edit Detail">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn-icon btn-icon-danger" onclick="confirmDelete(${job.id})" title="Hapus">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>

        <h3 class="job-position">${escapeHtml(job.position)}</h3>
        <div class="job-company"><i class="fas fa-building"></i> ${escapeHtml(job.company)}</div>

        <div class="job-meta-chips">
          ${job.location ? `<span class="meta-chip"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.location)}</span>` : ''}
          ${job.salary ? `<span class="meta-chip salary"><i class="fas fa-money-bill-wave"></i> ${escapeHtml(job.salary)}</span>` : ''}
          ${job.job_type ? `<span class="meta-chip"><i class="fas fa-clock"></i> ${escapeHtml(job.job_type)}</span>` : ''}
          ${job.source ? `<span class="meta-chip"><i class="fas fa-globe"></i> ${escapeHtml(job.source)}</span>` : ''}
        </div>

        <!-- Progress Stepper Component -->
        <div class="progress-stepper" onclick="event.stopPropagation()">
          <div class="stepper-header">
            <span>Progress: <strong>${escapeHtml(job.status)}</strong></span>
            ${nextStatus ? `
              <button class="btn-advance-step" onclick="handleStatusChange(${job.id}, '${nextStatus}')">
                Lanjut ke ${escapeHtml(nextStatus)} <i class="fas fa-arrow-right"></i>
              </button>
            ` : ''}
          </div>
          <div class="stepper-track">
            <div class="step-line"></div>
            <div class="stepper-step ${level >= 1 ? 'completed' : ''} ${job.status === 'Applied' ? 'current' : ''}"
                 onclick="handleStatusChange(${job.id}, 'Applied')" title="Set ke Applied">
              <div class="step-dot"></div>
              <span class="step-label">Lamar</span>
            </div>
            <div class="stepper-step ${level >= 2 ? 'completed' : ''} ${job.status === 'Screening' ? 'current' : ''}"
                 onclick="handleStatusChange(${job.id}, 'Screening')" title="Set ke Screening">
              <div class="step-dot"></div>
              <span class="step-label">Screening</span>
            </div>
            <div class="stepper-step ${level >= 3 ? 'completed' : ''} ${['Phone Interview','Technical Test','Interview','Final Interview'].includes(job.status) ? 'current' : ''}"
                 onclick="handleStatusChange(${job.id}, 'Interview')" title="Set ke Interview">
              <div class="step-dot"></div>
              <span class="step-label">Interview</span>
            </div>
            <div class="stepper-step ${level >= 4 ? 'completed' : ''} ${job.status === 'Offering' ? 'current offering' : ''}"
                 onclick="handleStatusChange(${job.id}, 'Offering')" title="Set ke Offering">
              <div class="step-dot"></div>
              <span class="step-label">Offer</span>
            </div>
            <div class="stepper-step ${level >= 5 ? 'completed accepted' : (job.status === 'Rejected' ? 'rejected current' : '')}"
                 onclick="handleStatusChange(${job.id}, 'Accepted')" title="Set ke Accepted">
              <div class="step-dot"></div>
              <span class="step-label">${job.status === 'Rejected' ? 'Ditolak' : 'Diterima'}</span>
            </div>
          </div>
        </div>

        <div class="card-footer">
          <span class="applied-date"><i class="fas fa-calendar"></i> Dilamar: ${formatDate(job.applied_date)}</span>
          <div class="status-update" onclick="event.stopPropagation()">
            <select class="status-select" onchange="handleStatusChange(${job.id}, this.value)">
              ${STATUSES.map(s => `<option value="${s}" ${s === job.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Kanban View Renderer ─────────────────────────────────

function renderKanbanView() {
  const container = document.getElementById('kanbanBoard');

  container.innerHTML = KANBAN_COLUMNS.map(col => {
    let colJobs = [];
    if (col.id === 'InterviewGroup') {
      colJobs = jobs.filter(j => ['Phone Interview', 'Technical Test', 'Interview', 'Final Interview'].includes(j.status));
    } else {
      colJobs = jobs.filter(j => j.status === col.id);
    }

    const cardsHtml = colJobs.map(job => {
      const nextStatus = getNextStatus(job.status);
      return `
        <div class="kanban-card" data-id="${job.id}" onclick="showDetail(${job.id})">
          <div class="kanban-card-title">${escapeHtml(job.position)}</div>
          <div class="kanban-card-company"><i class="fas fa-building"></i> ${escapeHtml(job.company)}</div>
          ${job.salary ? `<div style="font-size:0.75rem; color:#047857; font-weight:600;"><i class="fas fa-money-bill-wave"></i> ${escapeHtml(job.salary)}</div>` : ''}
          <div class="kanban-card-meta" onclick="event.stopPropagation()">
            <span><i class="fas fa-calendar"></i> ${formatDate(job.applied_date)}</span>
            ${nextStatus ? `
              <button class="kanban-advance-btn" onclick="handleStatusChange(${job.id}, '${nextStatus}')">
                Lanjut ➔
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="kanban-col">
        <div class="kanban-col-header" style="border-top: 3px solid ${col.color}">
          <span><i class="fas ${col.icon}"></i> ${col.label}</span>
          <span class="kanban-col-count">${colJobs.length}</span>
        </div>
        <div class="kanban-col-list">
          ${cardsHtml || '<div style="font-size:0.75rem; color:var(--text-muted); text-align:center; padding:1.5rem 0;">Kosong</div>'}
        </div>
      </div>
    `;
  }).join('');
}

// ─── Status Change ────────────────────────────────────────

async function handleStatusChange(id, newStatus) {
  try {
    await apiFetch(`${API}/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    showToast(`Status berhasil diubah ke "${newStatus}"`, 'success');
    await refreshAll();
  } catch (err) {
    showToast('Gagal memperbarui status: ' + err.message, 'error');
  }
}

// ─── Add Job Modal ────────────────────────────────────────

function openAddModal() {
  if (!currentUser) {
    showToast('Silakan masuk ke akun Anda terlebih dahulu untuk menambah lamaran', 'info');
    openAuthModal('login');
    return;
  }

  editingJobId = null;
  document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Tambah Lamaran Pekerjaan';
  document.getElementById('submitBtnText').textContent = 'Simpan Lamaran';
  document.getElementById('inputTabs').style.display = 'flex';
  document.getElementById('formDivider').style.display = 'flex';

  switchTab('text');
  document.getElementById('jobForm').reset();
  document.getElementById('jobText').value = '';
  document.getElementById('formStatusSelect').value = 'Applied';
  clearImage();

  const dateInput = document.querySelector('#jobForm [name="applied_date"]');
  dateInput.value = new Date().toISOString().split('T')[0];

  openModal('jobModal');
}

// ─── Edit Job Modal ───────────────────────────────────────

async function openEditModal(id) {
  try {
    const job = await apiFetch(`${API}/${id}`);
    editingJobId = id;

    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Informasi Lamaran';
    document.getElementById('submitBtnText').textContent = 'Simpan Perubahan';
    document.getElementById('inputTabs').style.display = 'none';
    document.getElementById('formDivider').style.display = 'none';

    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    const form = document.getElementById('jobForm');
    form.company.value = job.company || '';
    form.position.value = job.position || '';
    form.location.value = job.location || '';
    form.salary.value = job.salary || '';
    form.job_type.value = job.job_type || '';
    form.source.value = job.source || '';
    form.url.value = job.url || '';
    form.status.value = job.status || 'Applied';
    form.applied_date.value = job.applied_date || '';
    form.description.value = job.description || '';
    form.notes.value = job.notes || '';

    openModal('jobModal');
  } catch (err) {
    showToast('Gagal membuka lamaran: ' + err.message, 'error');
  }
}

// ─── Form Submit ──────────────────────────────────────────

async function handleFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const data = {
    company: form.company.value.trim(),
    position: form.position.value.trim(),
    location: form.location.value.trim(),
    salary: form.salary.value.trim(),
    job_type: form.job_type.value,
    source: form.source.value.trim(),
    url: form.url.value.trim(),
    status: form.status.value,
    applied_date: form.applied_date.value,
    description: form.description.value.trim(),
    notes: form.notes.value.trim()
  };

  if (!data.company || !data.position) {
    showToast('Nama Perusahaan dan Posisi wajib diisi!', 'error');
    return;
  }

  try {
    if (editingJobId) {
      await apiFetch(`${API}/${editingJobId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      showToast('Lamaran berhasil diperbarui!', 'success');
    } else {
      await apiFetch(API, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      showToast('Lamaran berhasil ditambahkan!', 'success');
    }
    closeModal('jobModal');
    await refreshAll();
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  }
}

// ─── Extract from Text (AI) ──────────────────────────────

async function handleExtractText() {
  const text = document.getElementById('jobText').value.trim();
  if (!text) {
    showToast('Silakan paste teks lowongan pekerjaan terlebih dahulu!', 'error');
    return;
  }

  showLoading('AI Gemini sedang membaca deskripsi lowongan...');
  try {
    const extracted = await apiFetch(`${API}/extract-text`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    populateForm(extracted);
    showToast('✨ Info lowongan berhasil diekstrak oleh AI!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    if (err.message.includes('API Key')) {
      openModal('settingsModal');
    }
  } finally {
    hideLoading();
  }
}

// ─── Extract from Image (AI Vision) ──────────────────────

async function handleExtractImage() {
  if (!selectedFile) {
    showToast('Silakan pilih atau upload gambar screenshot loker!', 'error');
    return;
  }

  showLoading('AI Vision sedang membaca teks dari gambar screenshot...');
  try {
    const formData = new FormData();
    formData.append('image', selectedFile);
    const res = await fetch(`${API}/extract-image`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Gagal mengekstrak gambar');

    populateForm(result);
    showToast('✨ Data gambar loker berhasil diekstrak oleh AI!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    if (err.message.includes('API Key')) {
      openModal('settingsModal');
    }
  } finally {
    hideLoading();
  }
}

function populateForm(data) {
  const form = document.getElementById('jobForm');
  if (data.company) form.company.value = data.company;
  if (data.position) form.position.value = data.position;
  if (data.location) form.location.value = data.location;
  if (data.salary) form.salary.value = data.salary;
  if (data.job_type) form.job_type.value = data.job_type;
  if (data.source) form.source.value = data.source;
  if (data.url) form.url.value = data.url;
  if (data.description) form.description.value = data.description;

  document.getElementById('jobForm').scrollIntoView({ behavior: 'smooth', block: 'center' });

  form.querySelectorAll('input, select, textarea').forEach(el => {
    if (el.value) {
      el.style.transition = 'background 0.5s';
      el.style.background = '#ecfdf5';
      setTimeout(() => { el.style.background = ''; }, 1600);
    }
  });
}

// ─── Image Upload Setup ──────────────────────────────────

function setupImageUpload() {
  const uploadArea = document.getElementById('uploadArea');
  const imageInput = document.getElementById('imageInput');

  imageInput.addEventListener('change', (e) => {
    handleImageFile(e.target.files[0]);
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });
}

function handleImageFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('File harus berupa format gambar (PNG, JPG, WEBP)!', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('Ukuran gambar maksimal 10MB!', 'error');
    return;
  }

  selectedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('previewImg').src = e.target.result;
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('imagePreview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  selectedFile = null;
  document.getElementById('imageInput').value = '';
  document.getElementById('previewImg').src = '';
  document.getElementById('imagePreview').classList.add('hidden');
  document.getElementById('uploadArea').style.display = 'block';
}

// ─── Delete Job ───────────────────────────────────────────

let deleteTargetId = null;

function confirmDelete(id) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;

  deleteTargetId = id;
  document.getElementById('deleteJobInfo').innerHTML = `
    <strong>${escapeHtml(job.position)}</strong>
    <span>${escapeHtml(job.company)}</span>
  `;
  openModal('deleteModal');
}

async function executeDelete() {
  if (!deleteTargetId) return;
  try {
    await apiFetch(`${API}/${deleteTargetId}`, { method: 'DELETE' });
    showToast('Data lamaran berhasil dihapus', 'success');
    closeModal('deleteModal');
    await refreshAll();
  } catch (err) {
    showToast('Gagal menghapus: ' + err.message, 'error');
  }
  deleteTargetId = null;
}

// ─── Detail Modal View ────────────────────────────────────

async function showDetail(id) {
  try {
    const job = await apiFetch(`${API}/${id}`);
    const content = document.getElementById('detailContent');

    const historyHtml = (job.history && job.history.length > 0)
      ? job.history.map(h => `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <span class="timeline-status">${escapeHtml(h.status)}</span>
            <span class="timeline-date">${formatDateTime(h.changed_at)}</span>
          </div>
        `).join('')
      : '<p style="color:var(--text-muted);font-size:0.85rem;">Belum ada riwayat perubahan status.</p>';

    content.innerHTML = `
      <div class="detail-header">
        <div class="detail-title">
          <h3>${escapeHtml(job.position)}</h3>
          <div class="company-name"><i class="fas fa-building"></i> ${escapeHtml(job.company)}</div>
        </div>
        <div>
          <span class="status-badge ${statusClass(job.status)}">
            <i class="fas ${STATUS_ICONS[job.status] || 'fa-circle'}"></i>
            ${escapeHtml(job.status)}
          </span>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label"><i class="fas fa-map-marker-alt"></i> Lokasi</span>
          <span class="detail-value">${escapeHtml(job.location) || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label"><i class="fas fa-money-bill-wave"></i> Gaji</span>
          <span class="detail-value" style="color:#047857;font-weight:700;">${escapeHtml(job.salary) || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label"><i class="fas fa-clock"></i> Tipe Pekerjaan</span>
          <span class="detail-value">${escapeHtml(job.job_type) || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label"><i class="fas fa-globe"></i> Sumber Info</span>
          <span class="detail-value">${escapeHtml(job.source) || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label"><i class="fas fa-calendar"></i> Tanggal Dilamar</span>
          <span class="detail-value">${formatDate(job.applied_date)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label"><i class="fas fa-link"></i> Link Lowongan</span>
          <span class="detail-value">${job.url ? `<a href="${escapeHtml(job.url)}" target="_blank" rel="noopener">${escapeHtml(job.url)} <i class="fas fa-external-link-alt" style="font-size:0.75rem"></i></a>` : '-'}</span>
        </div>
        ${job.description ? `
        <div class="detail-item full-width">
          <span class="detail-label"><i class="fas fa-align-left"></i> Ringkasan Deskripsi</span>
          <span class="detail-value" style="background:#f8fafc;padding:0.75rem;border-radius:6px;border:1px solid #e2e8f0;line-height:1.6;">${escapeHtml(job.description)}</span>
        </div>` : ''}
        ${job.notes ? `
        <div class="detail-item full-width">
          <span class="detail-label"><i class="fas fa-sticky-note"></i> Catatan Khusus</span>
          <span class="detail-value" style="background:#fffbeb;padding:0.75rem;border-radius:6px;border:1px solid #fcd34d;color:#92400e;line-height:1.6;">${escapeHtml(job.notes)}</span>
        </div>` : ''}
      </div>

      <div class="timeline-section">
        <h4><i class="fas fa-history"></i> Riwayat Perkembangan Status</h4>
        <div class="timeline">${historyHtml}</div>
      </div>

      <div class="form-actions" style="margin-top:1.5rem">
        <button class="btn btn-secondary" onclick="closeModal('detailModal')">Tutup</button>
        <button class="btn btn-primary" onclick="closeModal('detailModal'); openEditModal(${job.id})">
          <i class="fas fa-edit"></i> Edit Data
        </button>
      </div>
    `;

    openModal('detailModal');
  } catch (err) {
    showToast('Gagal memuat detail lamaran: ' + err.message, 'error');
  }
}

// ─── Event Listeners ──────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  refreshAll();

  document.getElementById('addJobBtn').addEventListener('click', openAddModal);
  document.getElementById('jobForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('confirmDeleteBtn').addEventListener('click', executeDelete);

  document.getElementById('searchInput').addEventListener('input', debounce(() => {
    loadJobs();
  }, 250));

  document.getElementById('filterStatus').addEventListener('change', () => {
    loadJobs();
  });

  setupImageUpload();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(modal => {
        closeModal(modal.id);
      });
    }
  });
});
