(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════
  // IranProxy Safe App
  // نسخه پایدار برای جلوگیری از Loading بی‌نهایت
  // ═══════════════════════════════════════════════════════

  var $ = function (s) { return document.querySelector(s); };

  var dom = {
    loading: $('#loading'),
    errorBox: $('#errorBox'),
    errorMsg: $('#errorMsg'),
    app: $('#app'),
    updateTime: $('#updateTime'),
    themeBtn: $('#themeBtn'),
    themeIcon: $('#themeIcon'),
    sTotal: $('#sTotal'),
    sOnline: $('#sOnline'),
    sLatency: $('#sLatency'),
    sScore: $('#sScore'),
    search: $('#search'),
    filterProto: $('#filterProto'),
    filterStatus: $('#filterStatus'),
    sortBy: $('#sortBy'),
    resetBtn: $('#resetBtn'),
    showCount: $('#showCount'),
    allCount: $('#allCount'),
    configList: $('#configList'),
    emptyBox: $('#emptyBox'),
    modal: $('#modal'),
    modalTitle: $('#modalTitle'),
    modalBody: $('#modalBody'),
    modalClose: $('#modalClose'),
    toast: $('#toast'),
    protoChart: $('#protoChart'),
    statusChart: $('#statusChart')
  };

  var data = null;
  var filtered = [];
  var clientScores = {};
  var testQueue = [];
  var isTesting = false;
  var chartsDrawn = false;
  var loadingWatchdog = null;
  var renderRAF = null;
  var userNetworkBaseline = 500;

  var MAX_CLIENT_SCORE = 40;
  var TEST_TIMEOUT = 6000;
  var BATCH_SIZE = 4;
  var RENDER_CHUNK = 20;

  var PROTO = {
    vmess: 'VMess',
    vless: 'VLESS',
    trojan: 'Trojan',
    shadowsocks: 'SS',
    hysteria2: 'HY2',
    wireguard: 'WG',
    mtproto: 'MTP',
    unknown: 'Unknown'
  };

  var STATUS_LABELS = {
    excellent: 'عالی',
    good: 'خوب',
    fair: 'متوسط',
    poor: 'ضعیف',
    offline: 'آفلاین'
  };

  var PROTO_COLORS = {
    vmess: '#a78bfa',
    vless: '#22d3ee',
    trojan: '#fbbf24',
    shadowsocks: '#f472b6',
    hysteria2: '#34d399',
    wireguard: '#f87171',
    mtproto: '#60a5fa',
    unknown: '#94a3b8'
  };

  // ═══ Error handling ═══
  function showError(message, err) {
    console.error('[IranProxy Error]', message, err || '');
    if (dom.loading) dom.loading.classList.add('hidden');
    if (dom.app) dom.app.classList.add('hidden');
    if (dom.errorBox) dom.errorBox.classList.remove('hidden');
    if (dom.errorMsg) dom.errorMsg.textContent = message || 'خطای ناشناخته';
  }

  window.addEventListener('error', function (e) {
    showError('خطای جاوااسکریپت: ' + (e.message || 'Unknown error'), e.error || e);
  });

  window.addEventListener('unhandledrejection', function (e) {
    var msg = 'خطا در Promise';
    if (e && e.reason) {
      if (typeof e.reason === 'string') msg += ': ' + e.reason;
      else if (e.reason.message) msg += ': ' + e.reason.message;
    }
    showError(msg, e.reason || e);
  });

  // ═══ Utils ═══
  function fa(n) {
    if (n === null || n === undefined || n === '—') return '—';
    return String(n).replace(/\d/g, function (d) {
      return '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)];
    });
  }

  function esc(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  function getCSS(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }

  function scoreClr(s) {
    if (typeof s !== 'number') return 'var(--text-3)';
    if (s >= 80) return '#34d399';
    if (s >= 60) return '#60a5fa';
    if (s >= 40) return '#fbbf24';
    if (s > 0) return '#f87171';
    return '#64748b';
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(self, args);
      }, ms);
    };
  }

  function validateDataShape(d) {
    return !!(
      d &&
      typeof d === 'object' &&
      d.stats &&
      typeof d.stats === 'object' &&
      Array.isArray(d.configs)
    );
  }

  function normalizeDataShape(d) {
    if (!validateDataShape(d)) {
      throw new Error('ساختار data.json معتبر نیست');
    }

    d.generated_at = d.generated_at || new Date().toISOString();
    d.stats = d.stats || {};
    d.stats.total_configs = Number(d.stats.total_configs || d.configs.length || 0);
    d.stats.online = Number(d.stats.online || 0);
    d.stats.offline = Number(d.stats.offline || 0);
    d.stats.avg_latency_ms = d.stats.avg_latency_ms == null ? null : Number(d.stats.avg_latency_ms);
    d.stats.avg_score = Number(d.stats.avg_score || 0);
    d.stats.max_server_score = Number(d.stats.max_server_score || 60);
    d.stats.by_protocol = d.stats.by_protocol || {};
    d.stats.by_status = d.stats.by_status || {};

    d.configs = d.configs.map(function (cfg, i) {
      cfg = cfg || {};
      cfg.rank = Number(cfg.rank || (i + 1));
      cfg.server_score = Number(cfg.server_score != null ? cfg.server_score : (cfg.score || 0));
      cfg.score = Number(cfg.score != null ? cfg.score : cfg.server_score);
      cfg.max_server_score = Number(cfg.max_server_score || 60);
      cfg.status = cfg.status || 'offline';
      cfg.protocol = cfg.protocol || 'unknown';
      cfg.host = cfg.host || '';
      cfg.port = Number(cfg.port || 0);
      cfg.name = cfg.name || ('Config-' + (i + 1));
      cfg.source_channel = cfg.source_channel || '';
      cfg.source_label = cfg.source_label || '';
      cfg.tags = Array.isArray(cfg.tags) ? cfg.tags : [];
      cfg.hash = cfg.hash || (cfg.protocol + ':' + cfg.host + ':' + cfg.port + ':' + i);
      cfg.original_uri = cfg.original_uri || '';
      cfg.health = cfg.health || {};
      cfg.health.status = cfg.health.status || 'offline';
      cfg.health.latency_ms = cfg.health.latency_ms == null ? null : Number(cfg.health.latency_ms);
      cfg.health.ip = cfg.health.ip || null;
      cfg.health.error = cfg.health.error || null;
      cfg.score_breakdown = cfg.score_breakdown || {
        health: 0, protocol: 0, source: 0, fingerprint: 0, uniqueness: 0, freshness: 0
      };
      cfg.client_score = cfg.client_score != null ? Number(cfg.client_score) : null;
      cfg.client_latency = cfg.client_latency != null ? Number(cfg.client_latency) : null;
      cfg.client_reachable = cfg.client_reachable != null ? !!cfg.client_reachable : null;
      return cfg;
    });

    return d;
  }

  // ═══ Cache ═══
  function clearBrokenCache() {
    try {
      localStorage.removeItem('ip-data-cache');
      localStorage.removeItem('ip-client-scores');
    } catch (e) {}
  }

  function loadDataCache() {
    try {
      var raw = localStorage.getItem('ip-data-cache');
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.data || !parsed.ts) return null;
      if (Date.now() - parsed.ts > 5 * 60 * 1000) return null;
      return normalizeDataShape(parsed.data);
    } catch (e) {
      return null;
    }
  }

  function saveDataCache(d) {
    try {
      localStorage.setItem('ip-data-cache', JSON.stringify({
        data: d,
        ts: Date.now()
      }));
    } catch (e) {}
  }

  function loadClientScoreCache() {
    try {
      var raw = localStorage.getItem('ip-client-scores');
      if (!raw) return;
      var parsed = JSON.parse(raw);
      var now = Date.now();
      Object.keys(parsed || {}).forEach(function (k) {
        if (parsed[k] && parsed[k].ts && now - parsed[k].ts < 30 * 60 * 1000) {
          clientScores[k] = parsed[k];
        }
      });
    } catch (e) {}
  }

  function saveClientScoreCache() {
    try {
      localStorage.setItem('ip-client-scores', JSON.stringify(clientScores));
    } catch (e) {}
  }

  // ═══ Theme ═══
  function initTheme() {
    var saved = localStorage.getItem('ip-theme');
    setTheme(saved || 'dark');
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (dom.themeIcon) dom.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem('ip-theme', theme); } catch (e) {}
    if (data) {
      chartsDrawn = false;
      requestAnimationFrame(drawCharts);
    }
  }

  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    setTheme(cur === 'dark' ? 'light' : 'dark');
  }

  // ═══ Data loading ═══
  async function fetchJson(url, timeoutMs) {
    timeoutMs = timeoutMs || 12000;

    var controller = null;
    try {
      controller = new AbortController();
    } catch (e) {}

    var timer = null;
    if (controller) {
      timer = setTimeout(function () {
        try { controller.abort(); } catch (e) {}
      }, timeoutMs);
    }

    try {
      var res = await fetch(url, {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });

      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }

      var json = await res.json();
      return json;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function loadData() {
    console.info('[IranProxy] loadData started');

    var cached = loadDataCache();
    if (cached) {
      console.info('[IranProxy] using cached data');
      data = cached;
      initApp();
    }

    try {
      var fresh = await fetchJson('data.json?_=' + Date.now(), 12000);
      fresh = normalizeDataShape(fresh);
      console.info('[IranProxy] fresh data loaded', fresh);

      data = fresh;
      saveDataCache(fresh);

      if (!cached) {
        initApp();
      } else {
        renderStats();
        renderTime();
        populateFilters();
        applyFilters();
      }
    } catch (e) {
      console.error('[IranProxy] loadData failed', e);
      if (!cached) {
        clearBrokenCache();
        showError('خطا در بارگذاری data.json: ' + (e.message || e), e);
      }
    }
  }

  function initApp() {
    if (!data) throw new Error('data هنوز بارگذاری نشده');

    if (loadingWatchdog) {
      clearTimeout(loadingWatchdog);
      loadingWatchdog = null;
    }

    if (dom.loading) dom.loading.classList.add('hidden');
    if (dom.errorBox) dom.errorBox.classList.add('hidden');
    if (dom.app) dom.app.classList.remove('hidden');

    renderStats();
    populateFilters();
    renderTime();
    applyFilters();

    requestAnimationFrame(function () {
      setTimeout(function () {
        try { drawCharts(); } catch (e) { console.warn('drawCharts failed', e); }
      }, 50);
    });

    setTimeout(function () {
      try { startClientTests(); } catch (e) { console.warn('client tests failed', e); }
    }, 500);
  }

  // ═══ Rendering ═══
  function renderStats() {
    var s = data.stats || {};
    if (dom.sTotal) dom.sTotal.textContent = fa(s.total_configs || 0);
    if (dom.sOnline) dom.sOnline.textContent = fa(s.online || 0);
    if (dom.sLatency) dom.sLatency.textContent = s.avg_latency_ms != null ? fa(s.avg_latency_ms) : '—';
    if (dom.sScore) dom.sScore.textContent = fa(s.avg_score || 0);
    if (dom.allCount) dom.allCount.textContent = fa(s.total_configs || 0);
  }

  function renderTime() {
    if (!data.generated_at || !dom.updateTime) return;
    try {
      var d = new Date(data.generated_at);
      dom.updateTime.textContent = new Intl.DateTimeFormat('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
    } catch (e) {
      dom.updateTime.textContent = data.generated_at;
    }
  }

  function populateFilters() {
    if (!dom.filterProto) return;
    var protos = {};
    (data.configs || []).forEach(function (c) {
      protos[c.protocol] = 1;
    });

    var html = '<option value="all">همه پروتکل‌ها</option>';
    Object.keys(protos).sort().forEach(function (p) {
      html += '<option value="' + p + '">' + (PROTO[p] || p) + '</option>';
    });
    dom.filterProto.innerHTML = html;
  }

  function getLatencyForSort(c) {
    if (c.client_latency != null) return c.client_latency;
    if (c.health && c.health.latency_ms != null) return c.health.latency_ms;
    return 999999;
  }

  function applyFilters() {
    if (!data) return;

    var q = dom.search ? dom.search.value.trim().toLowerCase() : '';
    var proto = dom.filterProto ? dom.filterProto.value : 'all';
    var status = dom.filterStatus ? dom.filterStatus.value : 'all';
    var sort = dom.sortBy ? dom.sortBy.value : 'score';

    var list = (data.configs || []).slice();

    if (q) {
      list = list.filter(function (c) {
        var hay = [
          c.name, c.host, c.protocol, PROTO[c.protocol], c.source_label
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.indexOf(q) !== -1;
      });
    }

    if (proto !== 'all') {
      list = list.filter(function (c) { return c.protocol === proto; });
    }

    if (status === 'online') {
      list = list.filter(function (c) {
        return c.health && c.health.status === 'online';
      });
    } else if (status === 'offline') {
      list = list.filter(function (c) {
        return !c.health || c.health.status !== 'online';
      });
    }

    list.sort(function (a, b) {
      if (sort === 'score') return (b.score || 0) - (a.score || 0);
      if (sort === 'latency') return getLatencyForSort(a) - getLatencyForSort(b);
      if (sort === 'protocol') return (a.protocol || '').localeCompare(b.protocol || '');
      return 0;
    });

    filtered = list;
    if (dom.showCount) dom.showCount.textContent = fa(list.length);
    renderListChunked();
  }

  function renderListChunked() {
    if (!dom.configList) return;

    if (renderRAF) cancelAnimationFrame(renderRAF);

    if (!filtered.length) {
      dom.configList.innerHTML = '';
      if (dom.emptyBox) dom.emptyBox.classList.remove('hidden');
      return;
    }

    if (dom.emptyBox) dom.emptyBox.classList.add('hidden');

    dom.configList.innerHTML = renderItems(filtered.slice(0, RENDER_CHUNK), 0);

    if (filtered.length <= RENDER_CHUNK) return;

    var offset = RENDER_CHUNK;

    function appendChunk() {
      if (offset >= filtered.length) return;

      var chunk = filtered.slice(offset, offset + RENDER_CHUNK);
      var wrap = document.createElement('div');
      wrap.innerHTML = renderItems(chunk, offset);

      while (wrap.firstChild) {
        dom.configList.appendChild(wrap.firstChild);
      }

      offset += RENDER_CHUNK;
      if (offset < filtered.length) {
        renderRAF = requestAnimationFrame(appendChunk);
      }
    }

    renderRAF = requestAnimationFrame(appendChunk);
  }

  function renderItems(items, startIdx) {
    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += renderOneItem(items[i], startIdx + i);
    }
    return html;
  }

  function renderOneItem(c, idx) {
    var h = c.health || {};
    var online = h.status === 'online';
    var serverLat = h.latency_ms;
    var clientLat = c.client_latency;
    var score = Math.round(c.score || 0);
    var proto = c.protocol || 'unknown';
    var rank = c.rank || (idx + 1);
    var isMTP = proto === 'mtproto';
    var delay = Math.min(idx * 15, 300);

    var testStatus = '';
    var cs = clientScores[c.hash];
    if (cs && cs.tested) {
      testStatus = cs.reachable
        ? '<span title="از اینترنت شما قابل دسترس" style="color:var(--green)">✓</span>'
        : '<span title="از اینترنت شما قابل دسترس نیست" style="color:var(--red)">✗</span>';
    } else if (isTesting) {
      testStatus = '<span title="در حال تست..." style="color:var(--yellow)">◌</span>';
    }

    var displayLat = '—';
    var latSource = '';
    if (clientLat != null) {
      displayLat = fa(clientLat) + ' ms';
      latSource = ' (شما)';
    } else if (serverLat != null) {
      displayLat = fa(serverLat) + ' ms';
      latSource = ' (سرور)';
    }

    var s = '';
    s += '<div class="config-item glass-card fade-up" style="animation-delay:' + delay + 'ms">';
    s += '<div class="cfg-left">';
    s += '<span class="cfg-rank ' + (rank <= 3 ? ('top-' + rank) : '') + '">' + fa(rank) + '</span>';
    s += '<span class="proto-tag proto-' + proto + '">' + (PROTO[proto] || proto) + '</span>';
    s += '</div>';

    s += '<div class="cfg-info">';
    s += '<span class="cfg-name">' + esc(c.name || 'بدون نام') + ' ' + testStatus + '</span>';
    s += '<span class="cfg-host">' + esc(c.host || '') + ':' + (c.port || '') + '</span>';
    s += '<div class="cfg-meta">';
    s += '<span><span class="status-dot ' + (online ? 'online' : (h.status === 'timeout' ? 'timeout' : 'offline')) + '"></span>' + (online ? 'آنلاین' : 'آفلاین') + '</span>';
    s += '<span>⚡ ' + displayLat + latSource + '</span>';
    s += '<span>📡 ' + esc(c.source_label || '') + '</span>';
    s += '</div>';
    s += '</div>';

    s += '<div class="cfg-right">';
    s += '<span class="cfg-score" style="color:' + scoreClr(score) + '">' + fa(score) + '<small style="font-size:0.6em;color:var(--text-3)"> /100</small></span>';
    s += '<div class="cfg-actions">';
    s += '<button class="action-btn" title="کپی لینک" onclick="IP.copy(' + idx + ')">📋</button>';
    if (isMTP) {
      s += '<button class="action-btn tg-btn" title="اتصال تلگرام" onclick="IP.openTG(' + idx + ')">✈️</button>';
    }
    s += '<button class="action-btn" title="جزئیات" onclick="IP.detail(' + idx + ')">👁</button>';
    s += '</div>';
    s += '</div>';
    s += '</div>';

    return s;
  }

  // ═══ Clipboard / actions ═══
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('کپی شد ✓');
    } catch (e) {
      showToast('خطا در کپی');
    }
    document.body.removeChild(ta);
  }

  function copyToClipboard(text) {
    if (!text) {
      showToast('لینک موجود نیست');
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { showToast('کپی شد ✓'); })
        .catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function copyConfig(idx) {
    var c = filtered[idx];
    if (!c) return showToast('خطا');
    var uri = c.original_uri || '';
    if (!uri && c.protocol === 'mtproto') {
      uri = 'tg://proxy?server=' + c.host + '&port=' + c.port + '&secret=' + (c.secret || '');
    }
    copyToClipboard(uri);
  }

  function copyURI(idx) {
    copyConfig(idx);
  }

  function openTelegram(idx) {
    var c = filtered[idx];
    if (!c || c.protocol !== 'mtproto') return;
    var tg = 'tg://proxy?server=' + c.host + '&port=' + c.port + '&secret=' + (c.secret || '');
    window.open(tg, '_blank');
  }

  // ═══ Modal ═══
  function showDetail(idx) {
    var c = filtered[idx];
    if (!c) return;

    var h = c.health || {};
    var b = c.score_breakdown || {};
    var isMTP = c.protocol === 'mtproto';
    var hash = c.hash;
    var cs = clientScores[hash];

    dom.modalTitle.textContent = (PROTO[c.protocol] || c.protocol) + ' — ' + (c.name || c.host);

    var uri = c.original_uri || '';
    if (!uri && isMTP) {
      uri = 'tg://proxy?server=' + c.host + '&port=' + c.port + '&secret=' + (c.secret || '');
    }

    var body = '';
    body += '<div class="detail-row"><span class="detail-label">پروتکل</span><span class="detail-value">' + (PROTO[c.protocol] || c.protocol) + '</span></div>';
    body += '<div class="detail-row"><span class="detail-label">هاست</span><span class="detail-value">' + esc(c.host) + ':' + (c.port || '') + '</span></div>';
    body += '<div class="detail-row"><span class="detail-label">وضعیت سرور</span><span class="detail-value">' + (h.status === 'online' ? '🟢 آنلاین' : '🔴 آفلاین') + '</span></div>';
    body += '<div class="detail-row"><span class="detail-label">تأخیر سرور</span><span class="detail-value">' + (h.latency_ms != null ? fa(h.latency_ms) + ' ms' : '—') + '</span></div>';

    if (cs && cs.tested) {
      body += '<div class="detail-row"><span class="detail-label">تأخیر شما</span><span class="detail-value">' + (cs.latency != null ? fa(cs.latency) + ' ms' : '—') + '</span></div>';
      body += '<div class="detail-row"><span class="detail-label">دسترس‌پذیری از شما</span><span class="detail-value">' + (cs.reachable ? '✅ بله' : '❌ خیر') + '</span></div>';
    } else {
      body += '<div class="detail-row"><span class="detail-label">تأخیر شما</span><span class="detail-value">تست نشده</span></div>';
    }

    body += '<div class="detail-row"><span class="detail-label">منبع</span><span class="detail-value">' + esc(c.source_label || '—') + '</span></div>';
    body += '<div class="detail-row"><span class="detail-label">امتیاز سرور</span><span class="detail-value" style="color:' + scoreClr(c.server_score || 0) + '">' + fa(Math.round(c.server_score || 0)) + ' / ۶۰</span></div>';
    body += '<div class="detail-row"><span class="detail-label">امتیاز شبکه شما</span><span class="detail-value">' + (c.client_score != null ? fa(Math.round(c.client_score)) + ' / ۴۰' : 'تست نشده') + '</span></div>';
    body += '<div class="detail-row" style="border-top:1px solid var(--border-glass);padding-top:0.5rem;margin-top:0.3rem"><span class="detail-label"><b>امتیاز نهایی</b></span><span class="detail-value" style="font-size:1.1rem;color:' + scoreClr(c.score || 0) + '"><b>' + fa(Math.round(c.score || 0)) + ' / ۱۰۰</b></span></div>';

    body += '<h4 style="margin:1rem 0 0.5rem;font-size:0.82rem;color:var(--text-2)">جزئیات سرور</h4>';
    body += '<div class="detail-row"><span class="detail-label">سلامت</span><span class="detail-value">' + fa(b.health || 0) + '</span></div>';
    body += '<div class="detail-row"><span class="detail-label">پروتکل</span><span class="detail-value">' + fa(b.protocol || 0) + '</span></div>';
    body += '<div class="detail-row"><span class="detail-label">منبع</span><span class="detail-value">' + fa(b.source || 0) + '</span></div>';
    body += '<div class="detail-row"><span class="detail-label">امنیت</span><span class="detail-value">' + fa(b.fingerprint || 0) + '</span></div>';
    body += '<div class="detail-row"><span class="detail-label">یکتایی</span><span class="detail-value">' + fa(b.uniqueness || 0) + '</span></div>';

    if (uri) {
      body += '<div class="config-uri-box">';
      body += '<h4>📎 لینک کانفیگ</h4>';
      body += '<div class="config-uri">' + esc(uri) + '</div>';
      body += '<button class="copy-full-btn" onclick="IP.copyURI(' + idx + ')">📋 کپی لینک کانفیگ</button>';
      body += '</div>';
    }

    if (isMTP) {
      var tgLink = 'tg://proxy?server=' + c.host + '&port=' + c.port + '&secret=' + (c.secret || '');
      body += '<a href="' + tgLink + '" class="copy-full-btn" style="display:block;text-align:center;margin-top:0.5rem;background:#0088cc;text-decoration:none;color:white">✈️ اتصال مستقیم به تلگرام</a>';
    }

    dom.modalBody.innerHTML = body;
    dom.modal.classList.add('active');
  }

  function closeModal() {
    if (dom.modal) dom.modal.classList.remove('active');
  }

  // ═══ Toast ═══
  function showToast(msg) {
    if (!dom.toast) return;
    dom.toast.textContent = msg;
    dom.toast.classList.add('show');
    setTimeout(function () {
      dom.toast.classList.remove('show');
    }, 2000);
  }

  // ═══ Charts ═══
  function drawCharts() {
    if (chartsDrawn) return;
    chartsDrawn = true;

    try { drawProtoChart(); } catch (e) { console.warn('drawProtoChart failed', e); }
    try { drawStatusChart(); } catch (e) { console.warn('drawStatusChart failed', e); }
  }

  function drawProtoChart() {
    if (!dom.protoChart || !data || !data.stats) return;
    var cvs = dom.protoChart;
    var ctx = cvs.getContext('2d');
    var d = data.stats.by_protocol || {};
    var entries = Object.entries(d).sort(function (a, b) { return b[1] - a[1]; });
    if (!entries.length) return;

    var dpr = window.devicePixelRatio || 1;
    var W = cvs.clientWidth || 320;
    var H = 200;
    cvs.width = W * dpr;
    cvs.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var padR = 90, barH = 20, gap = 6, startY = 8;
    var max = Math.max.apply(null, entries.map(function (e) { return e[1]; }));
    var chartW = W - padR - 25;

    ctx.font = '600 11px Vazirmatn, sans-serif';

    entries.forEach(function (entry, i) {
      var p = entry[0], count = entry[1];
      var y = startY + i * (barH + gap);
      var w = Math.max(2, (count / max) * chartW);
      var color = PROTO_COLORS[p] || '#94a3b8';

      ctx.fillStyle = getCSS('--text-2');
      ctx.textAlign = 'left';
      ctx.fillText(PROTO[p] || p, 5, y + barH / 2 + 4);

      roundRect(ctx, padR, y, w, barH, 4);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(String(count), padR + 6, y + barH / 2 + 4);
    });
  }

  function drawStatusChart() {
    if (!dom.statusChart || !data || !data.stats) return;
    var cvs = dom.statusChart;
    var ctx = cvs.getContext('2d');
    var d = data.stats.by_status || {};
    var order = ['excellent', 'good', 'fair', 'poor', 'offline'];
    var labels = { excellent: 'عالی', good: 'خوب', fair: 'متوسط', poor: 'ضعیف', offline: 'آفلاین' };
    var colors = { excellent: '#34d399', good: '#60a5fa', fair: '#fbbf24', poor: '#f87171', offline: '#64748b' };
    var entries = order.filter(function (k) { return d[k]; }).map(function (k) { return [k, d[k]]; });
    if (!entries.length) return;

    var dpr = window.devicePixelRatio || 1;
    var W = cvs.clientWidth || 320;
    var H = 200;
    cvs.width = W * dpr;
    cvs.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var cx = W / 2, cy = H / 2 - 5;
    var radius = Math.min(W, H) / 2 - 28;
    var total = entries.reduce(function (s, e) { return s + e[1]; }, 0);
    var startA = -Math.PI / 2;

    entries.forEach(function (entry) {
      var k = entry[0], v = entry[1];
      var slice = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startA, startA + slice);
      ctx.closePath();
      ctx.fillStyle = colors[k];
      ctx.fill();
      startA += slice;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = getCSS('--bg-body');
    ctx.fill();

    ctx.fillStyle = getCSS('--text-1');
    ctx.font = '800 20px Vazirmatn';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fa(total), cx, cy - 4);
    ctx.font = '10px Vazirmatn';
    ctx.fillStyle = getCSS('--text-3');
    ctx.fillText('کل', cx, cy + 14);

    var lx = 8, ly = 8;
    ctx.font = '10px Vazirmatn';
    ctx.textAlign = 'left';
    entries.forEach(function (entry, i) {
      var k = entry[0], v = entry[1];
      var y = ly + i * 17;
      ctx.fillStyle = colors[k];
      ctx.fillRect(lx, y, 9, 9);
      ctx.fillStyle = getCSS('--text-2');
      ctx.fillText(labels[k] + ': ' + fa(v), lx + 14, y + 8);
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

  // ═══ Client-side testing ═══
  function startClientTests() {
    if (!data || !Array.isArray(data.configs) || !data.configs.length) return;

    measureBaseline(function () {
      var candidates = data.configs
        .filter(function (c) { return c.host && c.health && c.health.status === 'online'; })
        .sort(function (a, b) { return (b.server_score || 0) - (a.server_score || 0); });

      testQueue = candidates.slice();
      isTesting = true;
      processTestQueue();
    });
  }

  function measureBaseline(done) {
    var targets = [
      'https://www.google.com/favicon.ico',
      'https://www.cloudflare.com/favicon.ico',
      'https://www.microsoft.com/favicon.ico'
    ];

    var results = [];
    var completed = 0;

    function finish() {
      if (results.length) {
        var sum = 0;
        for (var i = 0; i < results.length; i++) sum += results[i];
        userNetworkBaseline = Math.max(100, sum / results.length);
      }
      done();
    }

    targets.forEach(function (url) {
      var start = performance.now();
      var img = new Image();
      var timer = setTimeout(function () {
        img.onload = null;
        img.onerror = null;
        completed++;
        if (completed >= targets.length) finish();
      }, 4000);

      var end = function () {
        clearTimeout(timer);
        results.push(performance.now() - start);
        completed++;
        if (completed >= targets.length) finish();
      };

      img.onload = end;
      img.onerror = end;
      img.src = url + '?_=' + Date.now();
    });
  }

  function processTestQueue() {
    if (!isTesting || !testQueue.length) {
      isTesting = false;
      saveClientScoreCache();
      updateScoresAndResort();
      return;
    }

    var batch = testQueue.splice(0, BATCH_SIZE);
    var promises = batch.map(function (cfg) {
      return testOneConfig(cfg);
    });

    Promise.all(promises).then(function () {
      updateScoresAndResort();
      setTimeout(processTestQueue, 250);
    });
  }

  function testOneConfig(cfg) {
    var hash = cfg.hash;

    if (clientScores[hash] && Date.now() - clientScores[hash].ts < 10 * 60 * 1000) {
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      var host = cfg.host;
      var port = cfg.port || 443;
      var url = 'https://' + host + ':' + port + '/favicon.ico';
      var start = performance.now();
      var img = new Image();
      var done = false;

      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        clientScores[hash] = {
          score: 0,
          latency: null,
          reachable: false,
          tested: true,
          ts: Date.now()
        };
        resolve();
      }, TEST_TIMEOUT);

      function finish(reachable) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        var latency = Math.round(performance.now() - start);
        var score = calculateClientScore(latency, reachable);
        clientScores[hash] = {
          score: Math.round(score * 10) / 10,
          latency: latency,
          reachable: reachable,
          tested: true,
          ts: Date.now()
        };
        resolve();
      }

      img.onload = function () { finish(true); };
      img.onerror = function () {
        var elapsed = performance.now() - start;
        // خطای سریع یعنی host احتمالاً reachable هست
        finish(elapsed < TEST_TIMEOUT * 0.7);
      };

      try {
        img.src = url + '?_=' + Date.now();
      } catch (e) {
        clearTimeout(timer);
        clientScores[hash] = {
          score: 0,
          latency: null,
          reachable: false,
          tested: true,
          ts: Date.now()
        };
        resolve();
      }
    });
  }

  function calculateClientScore(latencyMs, reachable) {
    if (!reachable) {
      if (latencyMs < 1000) return MAX_CLIENT_SCORE * 0.15;
      if (latencyMs < 3000) return MAX_CLIENT_SCORE * 0.05;
      return 0;
    }

    var ratio = latencyMs / (userNetworkBaseline || 500);

    if (ratio < 0.5) return MAX_CLIENT_SCORE;
    if (ratio < 1.0) return MAX_CLIENT_SCORE * 0.85;
    if (ratio < 1.5) return MAX_CLIENT_SCORE * 0.70;
    if (ratio < 2.0) return MAX_CLIENT_SCORE * 0.50;
    if (ratio < 3.0) return MAX_CLIENT_SCORE * 0.30;
    if (ratio < 5.0) return MAX_CLIENT_SCORE * 0.15;
    return MAX_CLIENT_SCORE * 0.05;
  }

  function updateScoresAndResort() {
    if (!data || !data.configs) return;

    var changed = false;

    data.configs.forEach(function (c) {
      var cs = clientScores[c.hash];
      var old = c.client_score;

      if (cs && cs.tested) {
        c.client_score = cs.score;
        c.client_latency = cs.latency;
        c.client_reachable = cs.reachable;
        c.score = (c.server_score || 0) + (c.client_score || 0);
        if (old !== c.client_score) changed = true;
      } else {
        c.score = c.server_score || 0;
      }
    });

    if (!changed) return;

    data.configs.sort(function (a, b) {
      return (b.score || 0) - (a.score || 0);
    });

    for (var i = 0; i < data.configs.length; i++) {
      data.configs[i].rank = i + 1;
    }

    applyFilters();
  }

  // ═══ Events ═══
  function bindEvents() {
    if (dom.themeBtn) dom.themeBtn.addEventListener('click', toggleTheme);
    if (dom.search) dom.search.addEventListener('input', debounce(applyFilters, 250));
    if (dom.filterProto) dom.filterProto.addEventListener('change', applyFilters);
    if (dom.filterStatus) dom.filterStatus.addEventListener('change', applyFilters);
    if (dom.sortBy) dom.sortBy.addEventListener('change', applyFilters);

    if (dom.resetBtn) {
      dom.resetBtn.addEventListener('click', function () {
        if (dom.search) dom.search.value = '';
        if (dom.filterProto) dom.filterProto.value = 'all';
        if (dom.filterStatus) dom.filterStatus.value = 'all';
        if (dom.sortBy) dom.sortBy.value = 'score';
        applyFilters();
      });
    }

    if (dom.modalClose) dom.modalClose.addEventListener('click', closeModal);
    if (dom.modal) {
      dom.modal.addEventListener('click', function (e) {
        if (e.target === dom.modal) closeModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (dom.search) dom.search.focus();
      }
    });

    window.addEventListener('resize', debounce(function () {
      chartsDrawn = false;
      if (data) drawCharts();
    }, 300));

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && data) {
        chartsDrawn = false;
        drawCharts();
      }
    });
  }

  // ═══ Public API ═══
  window.IP = {
    copy: copyConfig,
    openTG: openTelegram,
    detail: showDetail,
    copyURI: copyURI
  };

  // ═══ Init ═══
  function assertDom() {
    var required = ['loading', 'errorBox', 'errorMsg', 'app', 'configList'];
    required.forEach(function (k) {
      if (!dom[k]) {
        throw new Error('عنصر DOM پیدا نشد: ' + k);
      }
    });
  }

  function init() {
    try {
      assertDom();
      initTheme();
      bindEvents();
      loadClientScoreCache();

      loadingWatchdog = setTimeout(function () {
        if (!data) {
          showError('بارگذاری بیش از حد طول کشید. احتمالاً app.js یا data.json مشکل دارد.');
        }
      }, 12000);

      loadData();
    } catch (e) {
      showError('خطا در شروع برنامه: ' + (e.message || e), e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
