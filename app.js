// ─── STATE ─────────────────────────────────────────────────────
let allModels = [];
let activeFilters = { status: 'all', lab: 'all', cap: 'all' };
let cooldownUntil = 0;
let cooldownTimer = null;

const LAB_NAMES = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', meta: 'Meta', xai: 'xAI',
  deepseek: 'DeepSeek', moonshot: 'Moonshot', minimax: 'MiniMax', qwen: 'Qwen',
  mistral: 'Mistral', other: 'Other'
};
const STATUS_LABELS = { released: 'Released', upcoming: 'Expected', imminent: 'Imminent' };

// ─── SAFETY ──────────────────────────────────────────────────────
// Model data comes from an LLM and is persisted to disk — never trust it as HTML
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function safeColor(v, fallback) {
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback;
}
function safeUrl(v) {
  try {
    const u = new URL(String(v));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
}
function safeToken(v) {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
}

// ─── RENDER ──────────────────────────────────────────────────────
function renderCard(m, delay = 0) {
  const tags = (Array.isArray(m.tags) ? m.tags : []).map(safeToken).filter(Boolean);
  const lab = safeToken(m.lab) || 'other';
  const status = STATUS_LABELS[m.status] ? m.status : 'upcoming';
  const tagHtml = tags.map(t => `<span class="tag tag-${t}">${esc(t === 'open' ? 'open source' : t)}</span>`).join('');
  const source = safeUrl(m.source);
  const sourceHtml = source
    ? `<a class="model-source" href="${esc(source)}" target="_blank" rel="noopener noreferrer" title="${esc(source)}">${esc(new URL(source).hostname.replace(/^www./, ''))} ↗</a>`
    : '';
  const noteHtml = m.note ? `<div class="model-note"><span aria-hidden="true">⚠</span>${esc(m.note)}</div>` : '';

  return `
    <article class="model-card"
      style="--card-color:${safeColor(m.color, '#6d28d9')}; animation-delay:${delay}ms"
      data-lab="${esc(lab)}"
      data-status="${esc(status)}"
      data-tags="${esc(tags.join(' '))}"
      data-search="${esc([m.name, m.desc, lab, LAB_NAMES[lab], ...tags].join(' ').toLowerCase())}"
    >
      <div class="card-head">
        <div class="model-logo" style="background:${safeColor(m.logoBg, '#111118')}" aria-hidden="true">${esc(m.logo)}</div>
        <div class="card-title">
          <h3 class="model-name">${esc(m.name)}</h3>
          <div class="model-lab">${esc(LAB_NAMES[lab] || lab)}</div>
        </div>
        <div class="status-badge status-${status}"><span class="s-dot"></span>${STATUS_LABELS[status]}</div>
      </div>
      <p class="model-desc">${esc(m.desc)}</p>
      ${noteHtml}
      <div class="card-foot">
        <div class="model-tags">${tagHtml}</div>
        <div class="card-meta">
          <div class="model-date">${esc(m.date)}</div>
          ${sourceHtml}
        </div>
      </div>
    </article>`;
}

function renderSection(key, title, models, offset) {
  if (!models.length) return '';
  return `
    <section class="model-section" data-section="${key}">
      <div class="section-head">
        <h2>${title}</h2>
        <span class="section-count"></span>
      </div>
      <div class="models-grid">
        ${models.map((m, i) => renderCard(m, Math.min((offset + i) * 35, 600))).join('')}
      </div>
    </section>`;
}

function renderAll(models) {
  const released = models.filter(m => m.status === 'released');
  const upcoming = models.filter(m => m.status !== 'released');

  document.getElementById('modelsList').innerHTML =
    renderSection('released', 'Released', released, 0) +
    renderSection('upcoming', 'Upcoming &amp; imminent', upcoming, released.length);

  updateStats(models);
  applyFilters();
}

function updateStats(models) {
  document.getElementById('stat-total').textContent = models.length;
  document.getElementById('stat-released').textContent = models.filter(m => m.status === 'released').length;
  document.getElementById('stat-upcoming').textContent = models.filter(m => m.status !== 'released').length;
  document.getElementById('stat-labs').textContent = new Set(models.map(m => m.lab)).size;
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
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  let visible = 0;

  document.querySelectorAll('.model-section').forEach(section => {
    let sectionVisible = 0;
    section.querySelectorAll('.model-card').forEach(card => {
      const tags = card.dataset.tags.split(' ');
      const show =
        (activeFilters.status === 'all' || card.dataset.status === activeFilters.status) &&
        (activeFilters.lab === 'all' || card.dataset.lab === activeFilters.lab) &&
        (activeFilters.cap === 'all' || tags.includes(activeFilters.cap)) &&
        (!q || card.dataset.search.includes(q));
      card.hidden = !show;
      if (show) sectionVisible++;
    });
    section.hidden = sectionVisible === 0;
    section.querySelector('.section-count').textContent = sectionVisible;
    visible += sectionVisible;
  });

  const hasFilters = activeFilters.status !== 'all' || activeFilters.lab !== 'all' || activeFilters.cap !== 'all' || q;
  document.getElementById('clearFilters').hidden = !hasFilters;
  document.getElementById('resultsCount').textContent = `${visible} of ${allModels.length} model${allModels.length !== 1 ? 's' : ''} shown`;
  document.getElementById('emptyState').hidden = visible !== 0 || !allModels.length;
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

// ─── STATUS / COOLDOWN ───────────────────────────────────────────
function formatTimestamp(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) +
    ' — ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function setLastUpdated(ms) {
  const ts = ms ? formatTimestamp(ms) : '—';
  document.getElementById('lastUpdated').textContent = ms ? `Last updated ${ts}` : 'Showing seed data';
  document.getElementById('footerTimestamp').textContent = ts;
}

function startCooldown(seconds) {
  cooldownUntil = Date.now() + seconds * 1000;
  clearInterval(cooldownTimer);
  tickCooldown();
  if (seconds > 0) cooldownTimer = setInterval(tickCooldown, 15000);
}

function tickCooldown() {
  const btn = document.getElementById('fetchBtn');
  const note = document.getElementById('cooldownNote');
  const remaining = cooldownUntil - Date.now();
  if (remaining <= 0) {
    clearInterval(cooldownTimer);
    btn.disabled = false;
    btn.title = '';
    note.textContent = '';
    return;
  }
  const mins = Math.ceil(remaining / 60000);
  btn.disabled = true;
  btn.title = `Refresh available in ${mins} min`;
  note.textContent = `· next refresh in ${mins} min`;
}

let toastTimer = null;
function toast(msg, kind = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show toast-${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 5000);
}

// ─── API FETCH ────────────────────────────────────────────────────
async function fetchLatest() {
  const btn = document.getElementById('fetchBtn');
  const label = btn.querySelector('.btn-label');
  const list = document.getElementById('modelsList');

  btn.disabled = true;
  btn.classList.add('loading');
  label.textContent = 'Researching…';
  toast('Searching the web for the latest models — this usually takes 1–3 minutes.');
  document.body.classList.add('is-loading');
  list.setAttribute('aria-busy', 'true');

  try {
    const res = await fetch('/api/fetch-models', { method: 'POST' });
    const body = await res.json().catch(() => ({}));

    if (res.status === 429) {
      startCooldown(body.retryAfterSec || 60);
      toast(`Data was refreshed recently — try again in ${Math.ceil((body.retryAfterSec || 60) / 60)} min.`);
      return;
    }
    if (!res.ok) throw new Error(body.error || `Server error ${res.status}`);

    allModels = body;
    renderAll(allModels);
    setLastUpdated(Date.now());
    toast(`Updated — ${allModels.length} models loaded.`, 'ok');
    refreshStatus();
  } catch (err) {
    console.error(err);
    toast(`Refresh failed: ${err.message}. Showing cached data.`, 'error');
  } finally {
    btn.classList.remove('loading');
    label.textContent = 'Refresh';
    document.body.classList.remove('is-loading');
    list.removeAttribute('aria-busy');
    if (Date.now() >= cooldownUntil) btn.disabled = false;
  }
}

async function refreshStatus() {
  try {
    const { lastUpdated, retryAfterSec } = await (await fetch('/api/status')).json();
    setLastUpdated(lastUpdated);
    startCooldown(retryAfterSec);
  } catch { /* status is cosmetic */ }
}

// ─── THEME ───────────────────────────────────────────────────────
function setTheme(name) {
  document.documentElement.setAttribute('data-theme', name);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === name);
  });
  try { localStorage.setItem('theme', name); } catch { /* storage unavailable */ }
}

// ─── INIT ────────────────────────────────────────────────────────
async function init() {
  let theme = 'void';
  try { theme = localStorage.getItem('theme') || 'void'; } catch { /* storage unavailable */ }
  setTheme(theme);

  document.addEventListener('keydown', e => {
    const input = document.getElementById('searchInput');
    if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape' && document.activeElement === input) { input.value = ''; applyFilters(); input.blur(); }
  });

  try {
    const [modelsRes, providerRes] = await Promise.all([
      fetch('/data/models.json', { cache: 'no-store' }),
      fetch('/api/provider')
    ]);
    allModels = await modelsRes.json();
    renderAll(allModels);
    const { label } = await providerRes.json();
    document.getElementById('footerProvider').textContent = `AI Model Tracker — ${label}`;
  } catch (e) {
    allModels = [];
    document.getElementById('lastUpdated').textContent = 'Could not load model data';
  }
  refreshStatus();
}

init();
