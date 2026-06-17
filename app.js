(function() {
  const $ = (s) => document.querySelector(s);
  let data = null;

  const dom = {
    loading: $('#loadingState'),
    stats: $('#statsGrid'),
    filter: $('#filterBar'),
    table: $('#rankingSection'),
    tbody: $('#tableBody'),
    lastUpdate: $('#lastUpdate'),
    themeToggle: $('#themeToggle'),
    search: $('#searchInput'),
    protocol: $('#protocolFilter'),
    status: $('#statusFilter'),
    sort: $('#sortSelect'),
    filteredCount: $('#filteredCount'),
    statOnline: $('#statOnline'),
    statOffline: $('#statOffline'),
    statLatency: $('#statLatency'),
    statAvgScore: $('#statAvgScore'),
  };

  // Theme
  function initTheme() {
    const saved = localStorage.getItem('hub-theme');
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefers ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    dom.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  dom.themeToggle.onclick = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('hub-theme', next);
    dom.themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
  };

  async function loadData() {
    try {
      const resp = await fetch('data.json?t=' + Date.now());
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      data = await resp.json();
      renderAll();
    } catch (err) {
      dom.loading.innerHTML = `<p>⚠️ خطا در بارگذاری:<br>${err.message}</p>`;
    }
  }

  function renderAll() {
    dom.loading.style.display = 'none';
    dom.stats.style.display = '';
    dom.filter.style.display = '';
    dom.table.style.display = '';
    renderStats();
    renderProtocolOptions();
    applyFilters();
  }

  function renderStats() {
    const s = data.stats;
    dom.statOnline.textContent = s.online_configs;
    dom.statOffline.textContent = s.offline_configs;
    dom.statLatency.textContent = s.avg_latency_ms + ' ms';
    dom.statAvgScore.textContent = s.avg_score;
    const dt = data.generated_at;
    if (dt) {
      const date = new Date(dt);
      dom.lastUpdate.textContent = 'بروز: ' + new Intl.DateTimeFormat('fa-IR').format(date);
    }
  }

  function renderProtocolOptions() {
    const dist = data.stats.protocol_distribution || {};
    dom.protocol.innerHTML = '<option value="all">همه</option>';
    Object.keys(dist).forEach(p => {
      dom.protocol.innerHTML += `<option value="${p}">${p} (${dist[p]})</option>`;
    });
  }

  function applyFilters() {
    let configs = data.configs || [];
    const search = dom.search.value.trim().toLowerCase();
    const protocol = dom.protocol.value;
    const status = dom.status.value;
    const sort = dom.sort.value;

    configs = configs.filter(c => {
      if (search) {
        const txt = (c.host||'') + (c.protocol||'') + (c.remarks||'');
        if (!txt.toLowerCase().includes(search)) return false;
      }
      if (protocol !== 'all' && c.protocol !== protocol) return false;
      if (status === 'online' && !c.online) return false;
      if (status === 'offline' && c.online) return false;
      return true;
    });

    // sort
    configs.sort((a,b) => {
      switch(sort) {
        case 'score-desc': return b.score - a.score;
        case 'latency-asc': return (a.latency_ms||9999) - (b.latency_ms||9999);
        case 'host-asc': return (a.host||'').localeCompare(b.host||'');
        default: return (a.rank||0) - (b.rank||0);
      }
    });

    renderTable(configs);
    dom.filteredCount.textContent = configs.length + ' کانفیگ';
  }

  function renderTable(configs) {
    dom.tbody.innerHTML = configs.map((c, i) => `
      <tr>
        <td>${c.rank || i+1}</td>
        <td><span class="protocol-tag">${c.protocol}</span></td>
        <td>${c.host}:${c.port}</td>
        <td><span class="status-badge ${c.online ? 'online' : 'offline'}">${c.online?'آنلاین':'آفلاین'}</span></td>
        <td>${c.online ? c.latency_ms + ' ms' : '—'}</td>
        <td class="score-value">${c.score}</td>
        <td class="hide-mobile">${c.last_seen ? new Date(c.last_seen).toLocaleDateString('fa-IR') : '-'}</td>
      </tr>
    `).join('');
  }

  function bindEvents() {
    dom.search.addEventListener('input', applyFilters);
    dom.protocol.addEventListener('change', applyFilters);
    dom.status.addEventListener('change', applyFilters);
    dom.sort.addEventListener('change', applyFilters);
  }

  initTheme();
  bindEvents();
  loadData();
})();