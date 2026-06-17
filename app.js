/**
 * Internet Access Hub — Frontend Logic
 * Vanilla JS, بدون فریم‌ورک
 */

(function () {
  'use strict';

  // ═══ DOM ═══
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const dom = {
    loading: $('#loading'),
    errorState: $('#errorState'),
    errorMessage: $('#errorMessage'),
    dashboard: $('#dashboard'),
    themeToggle: $('#themeToggle'),
    themeIcon: $('#themeIcon'),
    updateInfo: $('#updateInfo'),
    liveText: $('#liveText'),

    statTotal: $('#statTotal'),
    statOnline: $('#statOnline'),
    statLatency: $('#statLatency'),
    statScore: $('#statScore'),

    searchInput: $('#searchInput'),
    protocolFilter: $('#protocolFilter'),
    statusFilter: $('#statusFilter'),
    sortBy: $('#sortBy'),
    resetFilters: $('#resetFilters'),

    tableBody: $('#tableBody'),
    emptyState: $('#emptyState'),
    visibleCount: $('#visibleCount'),
    totalCount: $('#totalCount'),

    detailModal: $('#detailModal'),
    modalTitle: $('#modalTitle'),
    modalBody: $('#modalBody'),

    protocolChart: $('#protocolChart'),
    scoreChart: $('#scoreChart'),
  };

  // ═══ State ═══
  let appData = null;
  let filtered = [];

  const PROTOCOL_LABELS = {
    vmess: 'VMess',
    vless: 'VLESS',
    trojan: 'Trojan',
    shadowsocks: 'Shadowsocks',
    hysteria2: 'Hysteria2',
    wireguard: 'WireGuard',
    mtproto: 'MTProto',
    shadowsocksr: 'ShadowsocksR',
    tuic: 'TUIC',
    unknown: 'نامشخص',
  };

  const STATUS_LABELS = {
    excellent: 'عالی',
    good: 'خوب',
    fair: 'متوسط',
    poor: 'ضعیف',
    offline: 'آفلاین',
  };

  const PROTO_COLORS = {
    vmess: '#8b5cf6',
    vless: '#06b6d4',
    trojan: '#f59e0b',
    shadowsocks: '#ec4899',
    hysteria2: '#10b981',
    wireguard: '#f43f5e',
    mtproto: '#3b82f6',
  };

  // ═══ تم ═══
  function initTheme() {
    const saved = localStorage.getItem('iah-theme');
    const sys = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (sys ? 'dark' : 'light');
    setTheme(theme);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    dom.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('iah-theme', theme);
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    setTheme(cur === 'dark' ? 'light' : 'dark');
    // باز رسم نمودارها با رنگ‌های جدید
    if (appData) drawCharts();
  }

  // ═══ بارگذاری داده ═══
  async function loadData() {
    try {
      const res = await fetch(`data.json?_=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      appData = await res.json();
      initDashboard();
    } catch (err) {
      showError(err.message);
    }
  }

  function showError(msg) {
    dom.loading.classList.add('hidden');
    dom.errorState.classList.remove('hidden');
    dom.errorMessage.textContent = msg;
  }

  function initDashboard() {
    dom.loading.classList.add('hidden');
    dom.dashboard.classList.remove('hidden');
    populateFilters();
    renderStats();
    renderUpdateInfo();
    drawCharts();
    applyFilters();
  }

  // ═══ فیلترها ═══
  function populateFilters() {
    const protos = new Set();
    (appData.configs || []).forEach((c) => protos.add(c.protocol));
    const sorted = [...protos].sort();
    dom.protocolFilter.innerHTML = '<option value="all">همه</option>' +
      sorted.map((p) => `<option value="${p}">${PROTOCOL_LABELS[p] || p}</option>`).join('');
  }

  // ═══ آمار ═══
  function renderStats() {
    const s = appData.stats || {};
    dom.statTotal.textContent = faNum(s.total_configs || 0);
    dom.statOnline.textContent = faNum(s.online || 0);
    dom.statLatency.textContent = s.avg_latency_ms ? faNum(s.avg_latency_ms) : '—';
    dom.statScore.textContent = faNum(s.avg_score || 0);
    dom.totalCount.textContent = faNum(s.total_configs || 0);
  }

  function renderUpdateInfo() {
    const dt = appData.generated_at;
    if (!dt) {
      dom.updateInfo.textContent = '';
      return;
    }
    const date = new Date(dt);
    dom.updateInfo.textContent = formatDate(date);
    dom.updateInfo.title = date.toISOString();
  }

  // ═══ فیلتر و مرتب‌سازی ═══
  function applyFilters() {
    const search = dom.searchInput.value.trim().toLowerCase();
    const proto = dom.protocolFilter.value;
    const status = dom.statusFilter.value;
    const sort = dom.sortBy.value;

    let list = (appData.configs || []).slice();

    // فیلتر
    if (search) {
      list = list.filter((c) => {
        const hay = [
          c.name, c.host, c.protocol,
          PROTOCOL_LABELS[c.protocol], c.source_label,
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(search);
      });
    }
    if (proto !== 'all') list = list.filter((c) => c.protocol === proto);
    if (status !== 'all') list = list.filter((c) => c.status === status);

    // مرتب‌سازی
    list.sort((a, b) => {
      switch (sort) {
        case 'rank': return (a.rank || 999) - (b.rank || 999);
        case 'score-desc': return (b.score || 0) - (a.score || 0);
        case 'score-asc': return (a.score || 0) - (b.score || 0);
        case 'latency-asc': return getLat(a) - getLat(b);
        case 'latency-desc': return getLat(b) - getLat(a);
        case 'name-asc': return (a.name || '').localeCompare(b.name || '', 'fa');
        default: return 0;
      }
    });

    filtered = list;
    renderTable();
    dom.visibleCount.textContent = faNum(list.length);
  }

  function getLat(c) {
    const l = c.health && c.health.latency_ms;
    return l == null ? Infinity : l;
  }

  // ═══ جدول ═══
  function renderTable() {
    if (filtered.length === 0) {
      dom.tableBody.innerHTML = '';
      dom.emptyState.classList.remove('hidden');
      return;
    }
    dom.emptyState.classList.add('hidden');

    const html = filtered.map((c) => {
      const rank = c.rank || '—';
      const proto = c.protocol || 'unknown';
      const status = c.status || 'offline';
      const score = Math.round(c.score || 0);
      const health = c.health || {};
      const lat = health.latency_ms;

      return `
        <tr class="fade-in">
          <td class="col-rank">
            <span class="rank-badge ${rankClass(rank)}">${faNum(rank)}</span>
          </td>
          <td>
            <span class="proto-badge proto-${proto}">
              ${protoIcon(proto)} ${PROTOCOL_LABELS[proto] || proto}
            </span>
          </td>
          <td>
            <div class="cfg-name">${esc(c.name || 'بدون نام')}</div>
            <div class="cfg-host">${esc(c.host || '')}:${c.port || ''}</div>
          </td>
          <td class="col-num">
            <div class="score-cell">
              <span class="score-value" style="color:${scoreColor(score)}">${faNum(score)}</span>
              <div class="score-bar">
                <div class="score-bar-fill" style="width:${score}%;background:${scoreColor(score)}"></div>
              </div>
            </div>
          </td>
          <td class="col-num">
            <span class="latency-value ${latClass(lat)}">${lat != null ? faNum(lat) + ' ms' : '—'}</span>
          </td>
          <td>
            <span class="status-badge status-${status}">
              <span class="status-dot"></span>
              ${STATUS_LABELS[status] || status}
            </span>
          </td>
          <td><span class="source-tag">${esc(c.source_label || c.source_channel || '—')}</span></td>
          <td class="col-actions">
            <button class="action-btn" title="جزئیات" onclick="IAH.showDetail(${c.rank})">👁</button>
          </td>
        </tr>
      `;
    }).join('');

    dom.tableBody.innerHTML = html;
  }

  // ═══ مودال ═══
  function showDetail(rank) {
    const cfg = (appData.configs || []).find((c) => c.rank === rank);
    if (!cfg) return;
    dom.modalTitle.textContent = `${PROTOCOL_LABELS[cfg.protocol] || cfg.protocol} — ${cfg.name || cfg.host}`;
    const h = cfg.health || {};
    const b = cfg.score_breakdown || {};
    const segs = [
      { l: 'سلامت', v: b.health, c: '#10b981' },
      { l: 'پروتکل', v: b.protocol, c: '#3b82f6' },
      { l: 'منبع', v: b.source, c: '#f59e0b' },
      { l: 'امنیت', v: b.fingerprint, c: '#8b5cf6' },
      { l: 'یکتایی', v: b.uniqueness, c: '#ec4899' },
      { l: 'تازگی', v: b.freshness, c: '#06b6d4' },
    ];
    dom.modalBody.innerHTML = `
      <div class="detail-row"><span class="detail-label">هاست</span><span class="detail-value">${esc(cfg.host || '')}:${cfg.port || ''}</span></div>
      <div class="detail-row"><span class="detail-label">وضعیت</span><span class="detail-value">${STATUS_LABELS[cfg.status] || cfg.status}</span></div>
      <div class="detail-row"><span class="detail-label">تأخیر</span><span class="detail-value">${h.latency_ms != null ? faNum(h.latency_ms) + ' ms' : '—'}</span></div>
      <div class="detail-row"><span class="detail-label">IP</span><span class="detail-value">${esc(h.ip || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">منبع</span><span class="detail-value">${esc(cfg.source_label || cfg.source_channel || '—')}</span></div>
      <h3 style="margin:1rem 0 0.5rem;font-size:0.9rem">جزئیات امتیاز</h3>
      <div class="score-bar-large">
        ${segs.map((s) => `<div class="score-bar-segment" style="width:${(s.v || 0)}%;background:${s.c}" title="${s.l}: ${s.v || 0}"></div>`).join('')}
      </div>
      ${segs.map((s) => `
        <div class="detail-row">
          <span class="detail-label">${s.l}</span>
          <span class="detail-value">${faNum(s.v || 0)}</span>
        </div>
      `).join('')}
      <div class="detail-row" style="font-weight:700;border-top:1px solid var(--c-border);padding-top:0.75rem;margin-top:0.5rem">
        <span class="detail-label">مجموع</span>
        <span class="detail-value">${faNum(cfg.score || 0)} / ۱۰۰</span>
      </div>
    `;
    dom.detailModal.classList.add('active');
    dom.detailModal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    dom.detailModal.classList.remove('active');
    dom.detailModal.setAttribute('aria-hidden', 'true');
  }

  // ═══ نمودارها (Canvas خام) ═══
  function drawCharts() {
    drawProtocolChart();
    drawScoreChart();
  }

  function drawProtocolChart() {
    const cvs = dom.protocolChart;
    const ctx = cvs.getContext('2d');
    const data = appData.stats.by_protocol || {};
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return;

    // DPI
    const dpr = window.devicePixelRatio || 1;
    const W = cvs.clientWidth, H = 220;
    cvs.width = W * dpr;
    cvs.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const padX = 110, barH = 22, gap = 8, startY = 12;
    const max = Math.max(...entries.map(e => e[1]));
    const chartW = W - padX - 20;

    ctx.font = '600 12px Vazirmatn, sans-serif';
    entries.forEach(([proto, count], i) => {
      const y = startY + i * (barH + gap);
      const w = (count / max) * chartW;
      const color = PROTO_COLORS[proto] || '#94a3b8';

      // نام
      ctx.fillStyle = getCssVar('--c-text');
      ctx.textAlign = 'left';
      ctx.fillText(PROTOCOL_LABELS[proto] || proto, 5, y + barH / 2 + 4);

      // میله
      ctx.fillStyle = color;
      roundRect(ctx, padX, y, w, barH, 4);
      ctx.fill();

      // عدد
      ctx.fillStyle = count > max * 0.15 ? 'white' : getCssVar('--c-text');
      ctx.textAlign = 'left';
      ctx.fillText(faNum(count), padX + 8, y + barH / 2 + 4);
    });
  }

  function drawScoreChart() {
    const cvs = dom.scoreChart;
    const ctx = cvs.getContext('2d');
    const data = appData.stats.by_status || {};
    const order = ['excellent', 'good', 'fair', 'poor', 'offline'];
    const labels = { excellent: 'عالی', good: 'خوب', fair: 'متوسط', poor: 'ضعیف', offline: 'آفلاین' };
    const colors = {
      excellent: '#10b981', good: '#3b82f6',
      fair: '#f59e0b', poor: '#ef4444', offline: '#94a3b8',
    };
    const entries = order.filter(k => data[k]).map(k => [k, data[k]]);
    if (entries.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const W = cvs.clientWidth, H = 220;
    cvs.width = W * dpr;
    cvs.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2 - 5;
    const radius = Math.min(W, H) / 2 - 30;
    const total = entries.reduce((s, [, v]) => s + v, 0);
    let startA = -Math.PI / 2;

    entries.forEach(([k, v]) => {
      const slice = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startA, startA + slice);
      ctx.closePath();
      ctx.fillStyle = colors[k];
      ctx.fill();
      startA += slice;
    });

    // دایره مرکزی (donut)
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = getCssVar('--c-bg-card');
    ctx.fill();

    // عدد کل
    ctx.fillStyle = getCssVar('--c-text');
    ctx.font = '800 22px Vazirmatn';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(faNum(total), cx, cy - 5);
    ctx.font = '11px Vazirmatn';
    ctx.fillStyle = getCssVar('--c-text-muted');
    ctx.fillText('کل کانفیگ', cx, cy + 15);

    // راهنما
    const legX = 10, legYstart = 10;
    ctx.font = '11px Vazirmatn';
    ctx.textAlign = 'left';
    entries.forEach(([k, v], i) => {
      const y = legYstart + i * 18;
      ctx.fillStyle = colors[k];
      ctx.fillRect(legX, y, 10, 10);
      ctx.fillStyle = getCssVar('--c-text');
      ctx.fillText(`${labels[k]}: ${faNum(v)}`, legX + 16, y + 9);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ═══ ابزارها ═══
  function faNum(n) {
    return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatDate(d) {
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }).format(d);
    } catch {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  function scoreColor(s) {
    if (s >= 80) return '#10b981';
    if (s >= 65) return '#3b82f6';
    if (s >= 45) return '#f59e0b';
    if (s > 0) return '#ef4444';
    return '#94a3b8';
  }

  function rankClass(r) {
    if (r === 1) return 'rank-1';
    if (r === 2) return 'rank-2';
    if (r === 3) return 'rank-3';
    return '';
  }

  function latClass(l) {
    if (l == null) return '';
    if (l < 100) return 'latency-fast';
    if (l < 300) return 'latency-medium';
    return 'latency-slow';
  }

  function protoIcon(p) {
    const icons = {
      vmess: '⚡', vless: '🚀', trojan: '🛡',
      shadowsocks: '🌫', hysteria2: '💨', wireguard: '🔒', mtproto: '✈',
    };
    return icons[p] || '•';
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ═══ رویدادها ═══
  function bindEvents() {
    dom.themeToggle.addEventListener('click', toggleTheme);
    dom.searchInput.addEventListener('input', debounce(applyFilters, 200));
    dom.protocolFilter.addEventListener('change', applyFilters);
    dom.statusFilter.addEventListener('change', applyFilters);
    dom.sortBy.addEventListener('change', applyFilters);
    dom.resetFilters.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.protocolFilter.value = 'all';
      dom.statusFilter.value = 'all';
      dom.sortBy.value = 'rank';
      applyFilters();
    });
    // بستن مودال
    dom.detailModal.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        dom.searchInput.focus();
      }
    });
    // باز رسم نمودار در تغییر سایز
    window.addEventListener('resize', debounce(() => {
      if (appData) drawCharts();
    }, 250));
  }

  // ═══ API عمومی ═══
  window.IAH = { showDetail, closeModal };

  // ═══ شروع ═══
  function init() {
    initTheme();
    bindEvents();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();