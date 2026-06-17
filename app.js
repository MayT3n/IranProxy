/**
* TeleRank — اپلیکیشن فرانت‌اند
* HTML/CSS/JS خالص — بدون فریم‌ورک
*/

(function () {
'use strict';

// ═══ DOM References ═══
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
loading: $('#loadingState'),
statsGrid: $('#statsGrid'),
proxyTypesBar: $('#proxyTypesBar'),
proxyTypesGrid: $('#proxyTypesGrid'),
filterBar: $('#filterBar'),
rankingSection: $('#rankingSection'),
rankingBody: $('#rankingBody'),
emptyState: $('#emptyState'),
lastUpdate: $('#lastUpdate'),
themeToggle: $('#themeToggle'),
searchInput: $('#searchInput'),
statusFilter: $('#statusFilter'),
sortSelect: $('#sortSelect'),
filteredCount: $('#filteredCount'),
scorePopup: $('#scorePopup'),
// Stats
statChannels: $('#statChannels'),
statItems: $('#statItems'),
statAvgScore: $('#statAvgScore'),
statDupes: $('#statDupes'),
// Popup details
popFresh: $('#popFresh'),
popActivity: $('#popActivity'),
popItems: $('#popItems'),
popDiversity: $('#popDiversity'),
popUnique: $('#popUnique'),
popTotal: $('#popTotal'),
};

// ═══ State ═══
let appData = null;
let filteredChannels = [];

// ═══ تم تیره/روشن ═══
function initTheme() {
const saved = localStorage.getItem('telerank-theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const theme = saved || (prefersDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', theme);
updateThemeIcon(theme);
}

function toggleTheme() {
const current = document.documentElement.getAttribute('data-theme');
const next = current === 'dark' ? 'light' : 'dark';
document.documentElement.setAttribute('data-theme', next);
localStorage.setItem('telerank-theme', next);
updateThemeIcon(next);
}

function updateThemeIcon(theme) {
dom.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ═══ بارگذاری داده ═══
async function loadData() {
try {
const resp = await fetch('data.json?t=' + Date.now());
if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
appData = await resp.json();
renderDashboard();
} catch (err) {
console.error('خطا در بارگذاری داده:', err);
dom.loading.innerHTML = `
<div class="empty-state">
<div class="icon">⚠️</div>
<p>خطا در بارگذاری داده‌ها</p>
<p style="font-size:0.75rem;margin-top:0.5rem;color:var(--text-muted)">${err.message}</p>
</div>
`;
}
}

// ═══ رندر داشبورد ═══
function renderDashboard() {
if (!appData) return;

dom.loading.style.display = 'none';
dom.statsGrid.style.display = '';
dom.proxyTypesBar.style.display = '';
dom.filterBar.style.display = '';
dom.rankingSection.style.display = '';

renderStats();
renderProxyTypes();
renderLastUpdate();
applyFilters();
}

// ═══ آمار کلی ═══
function renderStats() {
const stats = appData.stats || {};
dom.statChannels.textContent = toPersianNum(stats.active_channels || 0);
dom.statItems.textContent = toPersianNum(stats.total_items || 0);
dom.statAvgScore.textContent = toPersianNum(stats.average_score || 0);

const dupes = stats.dedup ? stats.dedup.duplicates_removed : 0;
dom.statDupes.textContent = toPersianNum(dupes);
}

// ═══ انواع پروکسی ═══
function renderProxyTypes() {
const types = appData.stats?.proxy_types || {};
const entries = Object.entries(types).sort((a, b) => b[1] - a[1]);

if (entries.length === 0) {
dom.proxyTypesBar.style.display = 'none';
return;
}

dom.proxyTypesGrid.innerHTML = entries.map(([name, count]) => `
<div class="proxy-type-item">
<span class="proxy-type-name">${escapeHtml(name)}</span>
<span class="proxy-type-count">${toPersianNum(count)}</span>
</div>
`).join('');
}

// ═══ آخرین بروزرسانی ═══
function renderLastUpdate() {
const dt = appData.generated_at;
if (!dt) {
dom.lastUpdate.textContent = '—';
return;
}
const date = new Date(dt);
const formatted = formatDateTime(date);
dom.lastUpdate.textContent = `بروزرسانی: ${formatted}`;
dom.lastUpdate.title = date.toISOString();
}

// ═══ فیلتر و مرتب‌سازی ═══
function applyFilters() {
const channels = appData.channels || [];
const search = dom.searchInput.value.trim().toLowerCase();
const status = dom.statusFilter.value;
const sort = dom.sortSelect.value;

// فیلتر
filteredChannels = channels.filter((ch) => {
// جستجو
if (search) {
const searchable = (
(ch.label || '') + ' ' +
(ch.username || '')
).toLowerCase();
if (!searchable.includes(search)) return false;
}
// وضعیت
if (status !== 'all' && ch.rank_status !== status) return false;
return true;
});

// مرتب‌سازی
filteredChannels.sort((a, b) => {
switch (sort) {
case 'rank':
return (a.rank || 999) - (b.rank || 999);
case 'score-desc':
return (b.score || 0) - (a.score || 0);
case 'score-asc':
return (a.score || 0) - (b.score || 0);
case 'items-desc':
return (b.item_count || 0) - (a.item_count || 0);
case 'fresh-desc':
return compareDates(b.last_post_date, a.last_post_date);
case 'name-asc':
return (a.label || '').localeCompare(b.label || '', 'fa');
default:
return 0;
}
});

renderTable();
dom.filteredCount.textContent = toPersianNum(filteredChannels.length) + ' کانال';
}

function compareDates(a, b) {
const da = a ? new Date(a).getTime() : 0;
const db = b ? new Date(b).getTime() : 0;
return da - db;
}

// ═══ رندر جدول ═══
function renderTable() {
if (filteredChannels.length === 0) {
dom.rankingBody.innerHTML = '';
dom.emptyState.style.display = '';
return;
}

dom.emptyState.style.display = 'none';

dom.rankingBody.innerHTML = filteredChannels.map((ch, idx) => {
const rank = ch.rank || (idx + 1);
const score = ch.score || 0;
const status = ch.rank_status || 'inactive';
const types = ch.types || {};
const itemCount = ch.item_count || 0;

return `
<tr class="animate-in" style="animation-delay:${Math.min(idx * 30, 300)}ms">
<!-- رتبه -->
<td class="rank-cell">
<span class="rank-badge ${getRankClass(rank)}">${toPersianNum(rank)}</span>
</td>

<!-- کانال -->
<td>
<div class="channel-cell">
<div class="channel-avatar" style="background:${getAvatarColor(ch.username)}">
${getInitial(ch.label || ch.username)}
</div>
<div class="channel-info">
<span class="channel-name">${escapeHtml(ch.label || ch.username)}</span>
<span class="channel-username">
<a href="https://t.me/${escapeHtml(ch.username)}" target="_blank" rel="noopener">
@${escapeHtml(ch.username)}
</a>
</span>
</div>
</div>
</td>

<!-- امتیاز -->
<td class="score-cell">
<div class="score-bar-wrapper"
data-channel-idx="${idx}"
onmouseenter="window.TeleRank.showScorePopup(event, ${idx})"
onmouseleave="window.TeleRank.hideScorePopup()"
style="cursor:pointer">
<span class="score-value" style="color:${getScoreColor(score)}">
${toPersianNum(Math.round(score))}
</span>
<div class="score-bar">
<div class="score-bar-fill" style="width:${score}%;background:${getScoreColor(score)}"></div>
</div>
</div>
</td>

<!-- وضعیت -->
<td>
<span class="status-badge status-${status}">
<span class="status-dot"></span>
${getStatusLabel(status)}
</span>
</td>

<!-- تعداد آیتم -->
<td class="count-cell">${toPersianNum(itemCount)}</td>

<!-- انواع -->
<td class="hide-mobile">
<div class="type-tags">
${Object.entries(types).map(([type, count]) => `
<span class="type-tag">${escapeHtml(type)} (${toPersianNum(count)})</span>
`).join('')}
${Object.keys(types).length === 0 ? '<span class="type-tag">—</span>' : ''}
</div>
</td>

<!-- آخرین فعالیت -->
<td class="time-cell hide-mobile">
${ch.last_post_date ? formatDateTime(new Date(ch.last_post_date)) : '—'}
<span class="time-relative">
${ch.hours_since_last_post != null ? timeAgo(ch.hours_since_last_post) : ''}
</span>
</td>
</tr>
`;
}).join('');
}

// ═══ پاپ‌آپ جزئیات امتیاز ═══
function showScorePopup(event, idx) {
const ch = filteredChannels[idx];
if (!ch || !ch.score_details) return;

const d = ch.score_details;
dom.popFresh.textContent = toPersianNum(d.freshness || 0) + ' / ۲۵';
dom.popActivity.textContent = toPersianNum(d.activity || 0) + ' / ۳۰';
dom.popItems.textContent = toPersianNum(d.items || 0) + ' / ۲۵';
dom.popDiversity.textContent = toPersianNum(d.diversity || 0) + ' / ۱۰';
dom.popUnique.textContent = toPersianNum(d.uniqueness || 0) + ' / ۱۰';
dom.popTotal.textContent = toPersianNum(ch.score || 0) + ' / ۱۰۰';

const popup = dom.scorePopup;
const rect = event.currentTarget.getBoundingClientRect();
const scrollY = window.scrollY || window.pageYOffset;
const scrollX = window.scrollX || window.pageXOffset;

popup.style.top = (rect.bottom + scrollY + 8) + 'px';

// Position horizontally
const popupWidth = 230;
let leftPos = rect.left + scrollX + (rect.width / 2) - (popupWidth / 2);
leftPos = Math.max(10, Math.min(leftPos, window.innerWidth - popupWidth - 10));
popup.style.left = leftPos + 'px';

popup.classList.add('visible');
}

function hideScorePopup() {
dom.scorePopup.classList.remove('visible');
}

// ═══ ابزارهای کمکی ═══

// تبدیل به اعداد فارسی
function toPersianNum(num) {
const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
return String(num).replace(/\d/g, (d) => persianDigits[parseInt(d)]);
}

// فرمت تاریخ
function formatDateTime(date) {
if (!(date instanceof Date) || isNaN(date)) return '—';
try {
return new Intl.DateTimeFormat('fa-IR', {
year: 'numeric',
month: '2-digit',
day: '2-digit',
hour: '2-digit',
minute: '2-digit',
}).format(date);
} catch {
return date.toISOString().slice(0, 16).replace('T', ' ');
}
}

// زمان نسبی
function timeAgo(hours) {
if (hours == null) return '';
if (hours < 1) return 'لحظاتی پیش';
if (hours < 24) return toPersianNum(Math.round(hours)) + ' ساعت پیش';
const days = Math.round(hours / 24);
if (days < 7) return toPersianNum(days) + ' روز پیش';
const weeks = Math.round(days / 7);
if (weeks < 4) return toPersianNum(weeks) + ' هفته پیش';
return toPersianNum(Math.round(days / 30)) + ' ماه پیش';
}

// کلاس رتبه
function getRankClass(rank) {
if (rank === 1) return 'rank-1';
if (rank === 2) return 'rank-2';
if (rank === 3) return 'rank-3';
return 'rank-default';
}

// رنگ امتیاز
function getScoreColor(score) {
if (score >= 70) return 'var(--excellent)';
if (score >= 50) return 'var(--good)';
if (score >= 30) return 'var(--moderate)';
if (score >= 10) return 'var(--weak)';
return 'var(--error)';
}

// برچسب وضعیت
function getStatusLabel(status) {
const labels = {
excellent: 'عالی',
good: 'خوب',
moderate: 'متوسط',
weak: 'ضعیف',
inactive: 'غیرفعال',
error: 'خطا',
};
return labels[status] || status;
}

// رنگ آواتار
function getAvatarColor(str) {
const colors = [
'#667eea', '#764ba2', '#f093fb', '#4facfe',
'#43e97b', '#fa709a', '#fee140', '#30cfd0',
'#a18cd1', '#fbc2eb', '#8fd3f4', '#84fab0',
];
let hash = 0;
for (let i = 0; i < (str || '').length; i++) {
hash = str.charCodeAt(i) + ((hash << 5) - hash);
}
return colors[Math.abs(hash) % colors.length];
}

// حرف اول
function getInitial(name) {
if (!name) return '?';
// First character (works for Persian too)
return name.charAt(0);
}

// فرار HTML
function escapeHtml(str) {
if (!str) return '';
const div = document.createElement('div');
div.textContent = str;
return div.innerHTML;
}

// ═══ رویدادها ═══
function bindEvents() {
// تم
dom.themeToggle.addEventListener('click', toggleTheme);

// جستجو
dom.searchInput.addEventListener('input', debounce(applyFilters, 250));

// فیلتر وضعیت
dom.statusFilter.addEventListener('change', applyFilters);

// مرتب‌سازی
dom.sortSelect.addEventListener('change', applyFilters);

// کلیک بیرون پاپ‌آپ
document.addEventListener('click', (e) => {
if (!dom.scorePopup.contains(e.target)) {
hideScorePopup();
}
});

// هدر جدول - مرتب‌سازی
$$('.ranking-table th[data-sort]').forEach((th) => {
th.addEventListener('click', () => {
const sortKey = th.getAttribute('data-sort');
const sortMap = {
rank: 'rank',
name: 'name-asc',
score: 'score-desc',
status: 'rank',
items: 'items-desc',
types: 'rank',
fresh: 'fresh-desc',
};
const val = sortMap[sortKey] || 'rank';
dom.sortSelect.value = val;
applyFilters();

// Update sorted visual
$$('.ranking-table th').forEach((t) => t.classList.remove('sorted'));
th.classList.add('sorted');
});
});

// میانبر کیبورد
document.addEventListener('keydown', (e) => {
// Ctrl/Cmd + K → فوکوس سرچ
if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
e.preventDefault();
dom.searchInput.focus();
}
});
}

// debounce
function debounce(fn, ms) {
let timer;
return function (...args) {
clearTimeout(timer);
timer = setTimeout(() => fn.apply(this, args), ms);
};
}

// ═══ API عمومی (برای inline handlers) ═══
window.TeleRank = {
showScorePopup,
hideScorePopup,
};

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