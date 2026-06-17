(function(){
'use strict';
var $=function(s){return document.querySelector(s)};
var $$=function(s){return document.querySelectorAll(s)};

var dom={
loading:$('#loading'),
errorBox:$('#errorBox'),
errorMsg:$('#errorMsg'),
app:$('#app'),
updateTime:$('#updateTime'),
themeBtn:$('#themeBtn'),
themeIcon:$('#themeIcon'),
sTotal:$('#sTotal'),
sOnline:$('#sOnline'),
sLatency:$('#sLatency'),
sScore:$('#sScore'),
search:$('#search'),
filterProto:$('#filterProto'),
filterStatus:$('#filterStatus'),
sortBy:$('#sortBy'),
resetBtn:$('#resetBtn'),
showCount:$('#showCount'),
allCount:$('#allCount'),
configList:$('#configList'),
emptyBox:$('#emptyBox'),
modal:$('#modal'),
modalTitle:$('#modalTitle'),
modalBody:$('#modalBody'),
modalClose:$('#modalClose'),
toast:$('#toast'),
protoChart:$('#protoChart'),
statusChart:$('#statusChart')
};

var data=null;
var filtered=[];

var PROTO={
vmess:'VMess',vless:'VLESS',trojan:'Trojan',
shadowsocks:'SS',hysteria2:'HY2',wireguard:'WG',mtproto:'MTP'
};

var STATUS_LABELS={
excellent:'عالی',good:'خوب',fair:'متوسط',
poor:'ضعیف',offline:'آفلاین'
};

var PROTO_COLORS={
vmess:'#a78bfa',vless:'#22d3ee',trojan:'#fbbf24',
shadowsocks:'#f472b6',hysteria2:'#34d399',wireguard:'#f87171',mtproto:'#60a5fa'
};

function initTheme(){
var saved=localStorage.getItem('ip-theme');
setTheme(saved||'dark');
}

function setTheme(t){
document.documentElement.setAttribute('data-theme',t);
dom.themeIcon.textContent=t==='dark'?'☀️':'🌙';
localStorage.setItem('ip-theme',t);
if(data)drawCharts();
}

function toggleTheme(){
var cur=document.documentElement.getAttribute('data-theme');
setTheme(cur==='dark'?'light':'dark');
}

async function loadData(){
try{
var r=await fetch('data.json?_='+Date.now());
if(!r.ok)throw new Error('HTTP '+r.status);
data=await r.json();
initApp();
}catch(e){
dom.loading.classList.add('hidden');
dom.errorBox.classList.remove('hidden');
dom.errorMsg.textContent=e.message;
}
}

function initApp(){
dom.loading.classList.add('hidden');
dom.app.classList.remove('hidden');
renderStats();
populateFilters();
renderTime();
drawCharts();
applyFilters();
}

function renderStats(){
var s=data.stats||{};
dom.sTotal.textContent=fa(s.total_configs||0);
dom.sOnline.textContent=fa(s.online||0);
dom.sLatency.textContent=s.avg_latency_ms?fa(s.avg_latency_ms):'—';
dom.sScore.textContent=fa(s.avg_score||0);
dom.allCount.textContent=fa(s.total_configs||0);
}

function renderTime(){
if(!data.generated_at)return;
var d=new Date(data.generated_at);
try{
dom.updateTime.textContent=new Intl.DateTimeFormat('fa-IR',{
hour:'2-digit',minute:'2-digit',month:'2-digit',day:'2-digit'
}).format(d);
}catch(e){
dom.updateTime.textContent=d.toLocaleString();
}
}

function populateFilters(){
var protos={};
(data.configs||[]).forEach(function(c){protos[c.protocol]=1});
var html='<option value="all">همه پروتکل‌ها</option>';
Object.keys(protos).sort().forEach(function(p){
html+='<option value="'+p+'">'+(PROTO[p]||p)+'</option>';
});
dom.filterProto.innerHTML=html;
}

function applyFilters(){
var q=dom.search.value.trim().toLowerCase();
var proto=dom.filterProto.value;
var status=dom.filterStatus.value;
var sort=dom.sortBy.value;

var list=(data.configs||[]).slice();

if(q){
list=list.filter(function(c){
var hay=[c.name,c.host,c.protocol,PROTO[c.protocol],c.source_label].filter(Boolean).join(' ').toLowerCase();
return hay.indexOf(q)!==-1;
});
}

if(proto!=='all')list=list.filter(function(c){return c.protocol===proto});

if(status==='online')list=list.filter(function(c){return c.health&&c.health.status==='online'});
else if(status==='offline')list=list.filter(function(c){return !c.health||c.health.status!=='online'});

list.sort(function(a,b){
if(sort==='score')return(b.score||0)-(a.score||0);
if(sort==='latency')return getL(a)-getL(b);
if(sort==='protocol')return(a.protocol||'').localeCompare(b.protocol||'');
return 0;
});

filtered=list;
renderList();
dom.showCount.textContent=fa(list.length);
}

function getL(c){
return c.health&&c.health.latency_ms!=null?c.health.latency_ms:99999;
}

function renderList(){
if(filtered.length===0){
dom.configList.innerHTML='';
dom.emptyBox.classList.remove('hidden');
return;
}
dom.emptyBox.classList.add('hidden');

var html='';
for(var i=0;i<filtered.length;i++){
var c=filtered[i];
var h=c.health||{};
var online=h.status==='online';
var lat=h.latency_ms;
var score=Math.round(c.score||0);
var proto=c.protocol||'unknown';
var rank=c.rank||i+1;
var isMTP=proto==='mtproto';
var delay=Math.min(i*25,400);

html+='<div class="config-item glass-card fade-up" style="animation-delay:'+delay+'ms">';

html+='<div class="cfg-left">';
html+='<span class="cfg-rank '+(rank<=3?'top-'+rank:'')+'">'+fa(rank)+'</span>';
html+='<span class="proto-tag proto-'+proto+'">'+(PROTO[proto]||proto)+'</span>';
html+='</div>';

html+='<div class="cfg-info">';
html+='<span class="cfg-name">'+esc(c.name||'بدون نام')+'</span>';
html+='<span class="cfg-host">'+esc(c.host||'')+':'+(c.port||'')+'</span>';
html+='<div class="cfg-meta">';
html+='<span><span class="status-dot '+(online?'online':h.status==='timeout'?'timeout':'offline')+'"></span>'+(online?'آنلاین':'آفلاین')+'</span>';
if(lat!=null)html+='<span>⚡ '+fa(lat)+' ms</span>';
html+='<span>📡 '+esc(c.source_label||'')+'</span>';
html+='</div></div>';

html+='<div class="cfg-right">';
html+='<span class="cfg-score" style="color:'+scoreClr(score)+'">'+fa(score)+'</span>';
html+='<div class="cfg-actions">';
html+='<button class="action-btn" title="کپی لینک" onclick="IP.copy('+i+')">📋</button>';
if(isMTP)html+='<button class="action-btn tg-btn" title="اتصال تلگرام" onclick="IP.openTG('+i+')">✈️</button>';
html+='<button class="action-btn" title="جزئیات" onclick="IP.detail('+i+')">👁</button>';
html+='</div></div></div>';
}

dom.configList.innerHTML=html;
}

function copyConfig(idx){
var c=filtered[idx];
if(!c){showToast('خطا');return}

var uri=c.original_uri||'';
if(!uri){
if(c.protocol==='mtproto'){
uri='tg://proxy?server='+c.host+'&port='+c.port+'&secret='+(c.secret||'');
}else{
showToast('لینک موجود نیست');
return;
}
}

if(navigator.clipboard&&navigator.clipboard.writeText){
navigator.clipboard.writeText(uri).then(function(){
showToast('کپی شد ✓');
}).catch(function(){
fallbackCopy(uri);
});
}else{
fallbackCopy(uri);
}
}

function fallbackCopy(text){
var ta=document.createElement('textarea');
ta.value=text;
ta.style.position='fixed';
ta.style.left='-9999px';
document.body.appendChild(ta);
ta.select();
try{
document.execCommand('copy');
showToast('کپی شد ✓');
}catch(e){
showToast('خطا در کپی');
}
document.body.removeChild(ta);
}

function openTelegram(idx){
var c=filtered[idx];
if(!c)return;
if(c.protocol==='mtproto'){
var link='tg://proxy?server='+c.host+'&port='+c.port+'&secret='+(c.secret||'');
window.open(link,'_blank');
}
}

function showDetail(idx){
var c=filtered[idx];
if(!c)return;
var h=c.health||{};
var b=c.score_breakdown||{};
var isMTP=c.protocol==='mtproto';

dom.modalTitle.textContent=(PROTO[c.protocol]||c.protocol)+' — '+(c.name||c.host);

var uri=c.original_uri||'';
if(!uri&&isMTP){
uri='tg://proxy?server='+c.host+'&port='+c.port+'&secret='+(c.secret||'');
}

var bodyHtml='';
bodyHtml+='<div class="detail-row"><span class="detail-label">پروتکل</span><span class="detail-value">'+(PROTO[c.protocol]||c.protocol)+'</span></div>';
bodyHtml+='<div class="detail-row"><span class="detail-label">هاست</span><span class="detail-value">'+esc(c.host)+':'+(c.port||'')+'</span></div>';
bodyHtml+='<div class="detail-row"><span class="detail-label">وضعیت</span><span class="detail-value">'+(h.status==='online'?'🟢 آنلاین':'🔴 آفلاین')+'</span></div>';
bodyHtml+='<div class="detail-row"><span class="detail-label">تأخیر</span><span class="detail-value">'+(h.latency_ms!=null?fa(h.latency_ms)+' ms':'—')+'</span></div>';
bodyHtml+='<div class="detail-row"><span class="detail-label">IP</span><span class="detail-value">'+esc(h.ip||'—')+'</span></div>';
bodyHtml+='<div class="detail-row"><span class="detail-label">منبع</span><span class="detail-value">'+esc(c.source_label||'—')+'</span></div>';
bodyHtml+='<div class="detail-row"><span class="detail-label">امتیاز</span><span class="detail-value" style="color:'+scoreClr(c.score)+'">'+fa(c.score||0)+' / ۱۰۰</span></div>';

bodyHtml+='<h4 style="margin:1rem 0 0.5rem;font-size:0.82rem;color:var(--text-2)">جزئیات امتیاز</h4>';
bodyHtml+='<div class="detail-row"><span class="detail-label">سلامت</span><span class="detail-value">'+fa(b.health||0)+'</span></div>';
bodyHtml+='<div class="detail-row"><span class="detail-label">پروتکل</span><span class="detail-value">'+fa(b.protocol||0)+'</span></div>';
bodyHtml+='<div class="detail-row"><span class="detail-label">منبع</span><span class="detail-value">'+fa(b.source||0)+'</span></div>';
bodyHtml+='<div class="detail-row"><span class="detail-label">امنیت</span><span class="detail-value">'+fa(b.fingerprint||0)+'</span></div>';
bodyHtml+='<div class="detail-row"><span class="detail-label">یکتایی</span><span class="detail-value">'+fa(b.uniqueness||0)+'</span></div>';

if(uri){
bodyHtml+='<div class="config-uri-box">';
bodyHtml+='<h4>📎 لینک کانفیگ</h4>';
bodyHtml+='<div class="config-uri">'+esc(uri)+'</div>';
bodyHtml+='<button class="copy-full-btn" onclick="IP.copyURI('+idx+')">📋 کپی لینک کانفیگ</button>';
bodyHtml+='</div>';
}

if(isMTP){
var tgLink='tg://proxy?server='+c.host+'&port='+c.port+'&secret='+(c.secret||'');
bodyHtml+='<a href="'+tgLink+'" class="copy-full-btn" style="display:block;text-align:center;margin-top:0.5rem;background:#0088cc;text-decoration:none;color:white">✈️ اتصال مستقیم به تلگرام</a>';
}

dom.modalBody.innerHTML=bodyHtml;
dom.modal.classList.add('active');
}

function copyURI(idx){
var c=filtered[idx];
if(!c)return;
var uri=c.original_uri||'';
if(!uri&&c.protocol==='mtproto'){
uri='tg://proxy?server='+c.host+'&port='+c.port+'&secret='+(c.secret||'');
}
if(!uri){showToast('لینک موجود نیست');return}
if(navigator.clipboard&&navigator.clipboard.writeText){
navigator.clipboard.writeText(uri).then(function(){showToast('کپی شد ✓')}).catch(function(){fallbackCopy(uri)});
}else{
fallbackCopy(uri);
}
}

function closeModal(){
dom.modal.classList.remove('active');
}

function showToast(msg){
dom.toast.textContent=msg;
dom.toast.classList.add('show');
setTimeout(function(){dom.toast.classList.remove('show')},2000);
}

function drawCharts(){
drawProtoChart();
drawStatusChart();
}

function drawProtoChart(){
var cvs=dom.protoChart;
if(!cvs)return;
var ctx=cvs.getContext('2d');
var d=data.stats.by_protocol||{};
var entries=Object.entries(d).sort(function(a,b){return b[1]-a[1]});
if(!entries.length)return;

var dpr=window.devicePixelRatio||1;
var W=cvs.clientWidth;
var H=200;
cvs.width=W*dpr;
cvs.height=H*dpr;
ctx.scale(dpr,dpr);
ctx.clearRect(0,0,W,H);

var padR=90,barH=20,gap=6,startY=8;
var max=Math.max.apply(null,entries.map(function(e){return e[1]}));
var chartW=W-padR-25;

ctx.font='600 11px Vazirmatn, sans-serif';
entries.forEach(function(entry,i){
var p=entry[0],count=entry[1];
var y=startY+i*(barH+gap);
var w=Math.max(2,(count/max)*chartW);
var color=PROTO_COLORS[p]||'#94a3b8';

ctx.fillStyle=getCSS('--text-2');
ctx.textAlign='left';
ctx.fillText(PROTO[p]||p,5,y+barH/2+4);

ctx.fillStyle=color;
ctx.beginPath();
ctx.moveTo(padR+4,y);
ctx.lineTo(padR+w-4,y);
ctx.quadraticCurveTo(padR+w,y,padR+w,y+4);
ctx.lineTo(padR+w,y+barH-4);
ctx.quadraticCurveTo(padR+w,y+barH,padR+w-4,y+barH);
ctx.lineTo(padR+4,y+barH);
ctx.quadraticCurveTo(padR,y+barH,padR,y+barH-4);
ctx.lineTo(padR,y+4);
ctx.quadraticCurveTo(padR,y,padR+4,y);
ctx.closePath();
ctx.fill();

ctx.fillStyle='rgba(255,255,255,0.85)';
ctx.textAlign='left';
ctx.fillText(String(count),padR+6,y+barH/2+4);
});
}

function drawStatusChart(){
var cvs=dom.statusChart;
if(!cvs)return;
var ctx=cvs.getContext('2d');
var d=data.stats.by_status||{};
var order=['excellent','good','fair','poor','offline'];
var labels={excellent:'عالی',good:'خوب',fair:'متوسط',poor:'ضعیف',offline:'آفلاین'};
var colors={excellent:'#34d399',good:'#60a5fa',fair:'#fbbf24',poor:'#f87171',offline:'#64748b'};
var entries=order.filter(function(k){return d[k]}).map(function(k){return[k,d[k]]});
if(!entries.length)return;

var dpr=window.devicePixelRatio||1;
var W=cvs.clientWidth;
var H=200;
cvs.width=W*dpr;
cvs.height=H*dpr;
ctx.scale(dpr,dpr);
ctx.clearRect(0,0,W,H);

var cx=W/2,cy=H/2-5;
var radius=Math.min(W,H)/2-28;
var total=entries.reduce(function(s,e){return s+e[1]},0);
var startA=-Math.PI/2;

entries.forEach(function(entry){
var k=entry[0],v=entry[1];
var slice=(v/total)*Math.PI*2;
ctx.beginPath();
ctx.moveTo(cx,cy);
ctx.arc(cx,cy,radius,startA,startA+slice);
ctx.closePath();
ctx.fillStyle=colors[k];
ctx.fill();
startA+=slice;
});

ctx.beginPath();
ctx.arc(cx,cy,radius*0.55,0,Math.PI*2);
ctx.fillStyle=getCSS('--bg-body');
ctx.fill();

ctx.fillStyle=getCSS('--text-1');
ctx.font='800 20px Vazirmatn';
ctx.textAlign='center';
ctx.textBaseline='middle';
ctx.fillText(fa(total),cx,cy-4);
ctx.font='10px Vazirmatn';
ctx.fillStyle=getCSS('--text-3');
ctx.fillText('کل',cx,cy+14);

var lx=8,ly=8;
ctx.font='10px Vazirmatn';
ctx.textAlign='left';
entries.forEach(function(entry,i){
var k=entry[0],v=entry[1];
var y=ly+i*17;
ctx.fillStyle=colors[k];
ctx.fillRect(lx,y,9,9);
ctx.fillStyle=getCSS('--text-2');
ctx.fillText(labels[k]+': '+fa(v),lx+14,y+8);
});
}

function fa(n){
return String(n).replace(/\d/g,function(d){return'۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]});
}

function esc(s){
if(!s)return'';
var div=document.createElement('div');
div.textContent=String(s);
return div.innerHTML;
}

function scoreClr(s){
if(s>=80)return'#34d399';
if(s>=65)return'#60a5fa';
if(s>=45)return'#fbbf24';
if(s>0)return'#f87171';
return'#64748b';
}

function getCSS(name){
return getComputedStyle(document.documentElement).getPropertyValue(name).trim()||'#888';
}

function debounce(fn,ms){
var t;
return function(){
var args=arguments;
var self=this;
clearTimeout(t);
t=setTimeout(function(){fn.apply(self,args)},ms);
};
}

function bindEvents(){
dom.themeBtn.addEventListener('click',toggleTheme);
dom.search.addEventListener('input',debounce(applyFilters,200));
dom.filterProto.addEventListener('change',applyFilters);
dom.filterStatus.addEventListener('change',applyFilters);
dom.sortBy.addEventListener('change',applyFilters);
dom.resetBtn.addEventListener('click',function(){
dom.search.value='';
dom.filterProto.value='all';
dom.filterStatus.value='all';
dom.sortBy.value='score';
applyFilters();
});
dom.modalClose.addEventListener('click',closeModal);
dom.modal.addEventListener('click',function(e){
if(e.target===dom.modal)closeModal();
});
document.addEventListener('keydown',function(e){
if(e.key==='Escape')closeModal();
if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();dom.search.focus();}
});
window.addEventListener('resize',debounce(function(){if(data)drawCharts()},250));
}

window.IP={
copy:copyConfig,
openTG:openTelegram,
detail:showDetail,
copyURI:copyURI
};

initTheme();
bindEvents();
loadData();
})();