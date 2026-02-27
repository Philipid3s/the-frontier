// ─── STATE ─────────────────────────────────────────────────────
let allModels = [];
let seedModels = [];
let activeFilters = { status: 'all', lab: 'all', cap: 'all' };

// ─── RENDER ──────────────────────────────────────────────────────
function renderCard(m, delay = 0) {
  const tagHtml = (m.tags || []).map(t => `<span class="tag tag-${t}">${t}</span>`).join('');
  const noteHtml = m.note ? `<div class="model-note">${m.note}</div>` : '';
  const statusClass = `status-${m.status}`;
  const statusLabel = m.status === 'imminent' ? 'Imminent' : m.status === 'released' ? 'Released' : 'Expected';

  return `
    <div class="model-card"
      style="--card-color:${m.color}; animation-delay:${delay}ms"
      data-lab="${m.lab}"
      data-status="${m.status}"
      data-tags="${(m.tags || []).join(' ')}"
      data-name="${m.name.toLowerCase()}"
      data-desc="${m.desc.toLowerCase()}"
    >
      <div class="model-logo" style="background:${m.logoBg}">${m.logo}</div>
      <div class="model-info">
        <div class="model-name">${m.name}</div>
        <div class="model-desc">${m.desc}</div>
        <div class="model-tags">${tagHtml}</div>
        ${noteHtml}
      </div>
      <div class="model-meta">
        <div class="model-date">${m.date}</div>
        <div class="status-badge ${statusClass}">
          <div class="s-dot"></div>${statusLabel}
        </div>
      </div>
    </div>`;
}

function renderAll(models) {
  const list = document.getElementById('modelsList');
  list.innerHTML = '';

  const released = models.filter(m => m.status === 'released');
  const upcoming = models.filter(m => m.status !== 'released');

  let html = '';
  if (released.length) {
    html += released.map((m, i) => renderCard(m, i * 40)).join('');
  }
  if (upcoming.length) {
    if (released.length) html += `<div class="divider">Upcoming & imminent</div>`;
    html += upcoming.map((m, i) => renderCard(m, released.length * 40 + i * 40)).join('');
  }

  list.innerHTML = html;
  updateStats(models);
  applyFilters();
}

function updateStats(models) {
  document.getElementById('stat-total').textContent = models.length;
  document.getElementById('stat-released').textContent = models.filter(m => m.status === 'released').length;
  document.getElementById('stat-upcoming').textContent = models.filter(m => m.status !== 'released').length;
  document.getElementById('stat-labs').textContent = [...new Set(models.map(m => m.lab))].length;
}

// ─── FILTERS ─────────────────────────────────────────────────────
function setPill(btn) {
  const group = btn.dataset.group;
  document.querySelectorAll(`[data-group="${group}"]`).forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  activeFilters[group] = btn.dataset.val;
  applyFilters();
}

function applyFilters() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const cards = document.querySelectorAll('.model-card');
  let visible = 0;

  cards.forEach(card => {
    const matchStatus = activeFilters.status === 'all' || card.dataset.status === activeFilters.status;
    const matchLab = activeFilters.lab === 'all' || card.dataset.lab === activeFilters.lab;
    const matchCap = activeFilters.cap === 'all' || card.dataset.tags.includes(activeFilters.cap);
    const matchSearch = !q || card.dataset.name.includes(q) || card.dataset.desc.includes(q) || card.dataset.lab.includes(q) || card.dataset.tags.includes(q);

    const show = matchStatus && matchLab && matchCap && matchSearch;
    card.classList.toggle('hidden', !show);
    if (show) visible++;
  });

  const hasFilters = activeFilters.status !== 'all' || activeFilters.lab !== 'all' || activeFilters.cap !== 'all' || q;
  document.getElementById('clearFilters').style.display = hasFilters ? 'block' : 'none';
  document.getElementById('resultsCount').textContent = `${visible} model${visible !== 1 ? 's' : ''} shown`;
  document.getElementById('emptyState').style.display = visible === 0 ? 'block' : 'none';
}

function clearAllFilters() {
  document.getElementById('searchInput').value = '';
  ['status', 'lab', 'cap'].forEach(group => {
    document.querySelectorAll(`[data-group="${group}"]`).forEach(p => p.classList.remove('active'));
    document.querySelector(`[data-group="${group}"][data-val="all"]`).classList.add('active');
    activeFilters[group] = 'all';
  });
  applyFilters();
}

// ─── API FETCH ────────────────────────────────────────────────────
async function fetchLatest() {
  const btn = document.getElementById('fetchBtn');
  const label = document.querySelector('.btn-label');
  const loading = document.getElementById('loadingState');

  btn.disabled = true;
  btn.classList.add('loading');
  label.textContent = 'Fetching...';
  loading.style.display = 'block';
  document.getElementById('modelsList').innerHTML = '';
  document.getElementById('emptyState').style.display = 'none';

  try {
    const res = await fetch('/api/fetch-models', { method: 'POST' });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const models = await res.json();

    allModels = models;
    renderAll(models);

    const now = new Date();
    const ts = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) +
               ' — ' + now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('lastUpdated').textContent = 'Last updated: ' + ts;
    document.getElementById('footerTimestamp').textContent = ts;

  } catch (err) {
    console.error(err);
    allModels = seedModels;
    renderAll(seedModels);
    document.getElementById('lastUpdated').textContent = 'API unavailable — showing cached data';
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    label.textContent = 'Fetch latest';
    loading.style.display = 'none';
  }
}

// ─── THEME ───────────────────────────────────────────────────────
function setTheme(name) {
  document.documentElement.setAttribute('data-theme', name);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === name);
  });
  localStorage.setItem('theme', name);
}

// ─── INIT ────────────────────────────────────────────────────────
async function init() {
  setTheme(localStorage.getItem('theme') || 'void');

  // Pre-load seed data silently so the fallback is ready if the API call fails
  try {
    const res = await fetch('/data/models.json');
    seedModels = await res.json();
  } catch (e) {
    seedModels = [];
  }
  fetchLatest();
}

init();
