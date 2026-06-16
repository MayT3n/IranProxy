<!DOCTYPE html>
<html lang="fa" dir="rtl" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="TeleRank — داشبورد رتبه‌بندی کانال‌های عمومی پروکسی تلگرام">
<meta name="theme-color" content="#667eea">
<title>TeleRank — رتبه‌بندی کانال‌های پروکسی</title>
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
</head>
<body>

<!-- ═══ هدر ═══ -->
<header class="header">
<div class="header-content">
<div class="header-right">
<div class="logo">TR</div>
<div class="header-title">
<h1>TeleRank</h1>
<p>داشبورد رتبه‌بندی کانال‌های عمومی پروکسی</p>
</div>
</div>
<div class="header-left">
<span class="update-badge" id="lastUpdate">—</span>
<button class="theme-toggle" id="themeToggle" title="تغییر تم" aria-label="تغییر تم">
🌙
</button>
</div>
</div>
</header>

<!-- ═══ محتوای اصلی ═══ -->
<main class="main-content" id="mainContent">

<!-- بارگذاری -->
<div class="loading" id="loadingState">
<div class="spinner"></div>
<p>در حال بارگذاری داده‌ها...</p>
</div>

<!-- آمار کلی -->
<div class="stats-grid" id="statsGrid" style="display:none;">
<div class="stat-card animate-in delay-1">
<div class="stat-icon">📡</div>
<div class="stat-value" id="statChannels">—</div>
<div class="stat-label">کانال فعال</div>
</div>
<div class="stat-card animate-in delay-2">
<div class="stat-icon">🔗</div>
<div class="stat-value" id="statItems">—</div>
<div class="stat-label">آیتم یکتا</div>
</div>
<div class="stat-card animate-in delay-3">
<div class="stat-icon">⭐</div>
<div class="stat-value" id="statAvgScore">—</div>
<div class="stat-label">میانگین امتیاز</div>
</div>
<div class="stat-card animate-in delay-4">
<div class="stat-icon">🧹</div>
<div class="stat-value" id="statDupes">—</div>
<div class="stat-label">تکراری حذف‌شده</div>
</div>
</div>

<!-- انواع پروکسی -->
<div class="proxy-types-bar" id="proxyTypesBar" style="display:none;">
<div class="proxy-types-title">📊 توزیع انواع پروکسی</div>
<div class="proxy-types-grid" id="proxyTypesGrid"></div>
</div>

<!-- فیلتر و جستجو -->
<div class="filter-bar" id="filterBar" style="display:none;">
<div class="search-box">
<span class="search-icon">🔍</span>
<input type="text" id="searchInput" placeholder="جستجوی نام یا آدرس کانال...">
</div>
<select class="filter-select" id="statusFilter">
<option value="all">همه وضعیت‌ها</option>
<option value="excellent">عالی</option>
<option value="good">خوب</option>
<option value="moderate">متوسط</option>
<option value="weak">ضعیف</option>
<option value="inactive">غیرفعال</option>
<option value="error">خطا</option>
</select>
<select class="filter-select" id="sortSelect">
<option value="rank">رتبه</option>
<option value="score-desc">بیشترین امتیاز</option>
<option value="score-asc">کمترین امتیاز</option>
<option value="items-desc">بیشترین آیتم</option>
<option value="fresh-desc">تازه‌ترین</option>
<option value="name-asc">نام (ا-ی)</option>
</select>
</div>

<!-- جدول رتبه‌بندی -->
<div class="ranking-section" id="rankingSection" style="display:none;">
<div class="section-header">
<div class="section-title">
🏆 رتبه‌بندی کانال‌ها
</div>
<span class="channel-count" id="filteredCount">—</span>
</div>
<div class="table-wrapper">
<table class="ranking-table">
<thead>
<tr>
<th class="rank-cell" data-sort="rank">
<span class="sort-icon">▼</span> رتبه
</th>
<th data-sort="name">
<span class="sort-icon">▼</span> کانال
</th>
<th data-sort="score" class="sorted">
<span class="sort-icon">▼</span> امتیاز
</th>
<th data-sort="status">
<span class="sort-icon">▼</span> وضعیت
</th>
<th data-sort="items">
<span class="sort-icon">▼</span> آیتم‌ها
</th>
<th class="hide-mobile" data-sort="types">
<span class="sort-icon">▼</span> انواع
</th>
<th class="hide-mobile" data-sort="fresh">
<span class="sort-icon">▼</span> آخرین فعالیت
</th>
</tr>
</thead>
<tbody id="rankingBody">
</tbody>
</table>
</div>

<!-- وضعیت خالی -->
<div class="empty-state" id="emptyState" style="display:none;">
<div class="icon">🔍</div>
<p>هیچ کانالی با فیلتر انتخابی یافت نشد</p>
</div>
</div>

</main>

<!-- ═══ فوتر ═══ -->
<footer class="footer">
<p>
TeleRank — ابزار متن‌باز رتبه‌بندی کانال‌های عمومی تلگرام
<br>
فقط از داده‌های عمومی و مجاز استفاده می‌شود.
<br>
<a href="https://github.com/" target="_blank" rel="noopener">GitHub</a>
</p>
</footer>

<!-- ═══ پاپ‌آپ جزئیات امتیاز ═══ -->
<div class="score-details-popup" id="scorePopup">
<div class="score-detail-row">
<span>تازگی</span>
<span id="popFresh">—</span>
</div>
<div class="score-detail-row">
<span>فعالیت</span>
<span id="popActivity">—</span>
</div>
<div class="score-detail-row">
<span>تعداد آیتم</span>
<span id="popItems">—</span>
</div>
<div class="score-detail-row">
<span>تنوع</span>
<span id="popDiversity">—</span>
</div>
<div class="score-detail-row">
<span>یکتایی</span>
<span id="popUnique">—</span>
</div>
<div class="score-detail-row">
<span>مجموع</span>
<span id="popTotal">—</span>
</div>
</div>

<script src="app.js"></script>
</body>
</html>