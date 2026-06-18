(function(){
'use strict';

// ═══════════════════════════════════════════════════════════
// ایران پروکسی — app.js (نسخه بهینه با Client-Side Scoring)
// ═══════════════════════════════════════════════════════════

var $=function(s){return document.querySelector(s)};

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
var clientScores={};   // cache: hash → {score, latency, tested}
var testQueue=[];
var isTesting=false;

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

var MAX_CLIENT_SCORE=40;
var BATCH_SIZE=4;
var TEST_TIMEOUT=8000;
var RENDER_CHUNK=20;

// ═══ تم ═══
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

// ═══ Cache ═══
function loadCache(){
try{
var raw=localStorage.getItem('ip-client-scores');
if(raw){
var parsed=JSON.parse(raw);
// expire after 30 min
var now=Date.now();
Object.keys(parsed).forEach(function(k){
if(now-parsed[k].ts<30*60*1000){
clientScores[k]=parsed[k];
}
});
}
}catch(e){}
}

function saveCache(){
try{
localStorage.setItem('ip-client-scores',JSON.stringify(clientScores));
}catch(e){}
}

function loadDataCache(){
try{
var raw=localStorage.getItem('ip-data-cache');
if(raw){
var cached=JSON.parse(raw);
if(Date.now()-cached.ts<5*60*1000){
return cached.data;
}
}
}catch(e){}
return null;
}

function saveDataCache(d){
try{
localStorage.setItem('ip-data-cache',JSON.stringify({data:d,ts:Date.now()}));
}catch(e){}
}

// ═══ بارگذاری ═══
async function loadData(){
// اول cache
var cached=loadDataCache();
if(cached){
data=cached;
initApp();
}

try{
var r=await fetch('data.json?_='+Date.now());
if(!r.ok)throw new Error('HTTP '+r.status);
var fresh=await r.json();
data=fresh;
saveDataCache(fresh);
if(!cached)initApp();
else{
renderStats();
applyFilters();
}
}catch(e){
if(!cached){
dom.loading.classList.add('hidden');
dom.errorBox.classList.remove('hidden');
dom.errorMsg.textContent=e.message;
}
}
}

function initApp(){
dom.loading.classList.add('hidden');
dom.app.classList.remove('hidden');
loadCache();
renderStats();
populateFilters();
renderTime();
applyFilters();
// lazy load charts
requestAnimationFrame(function(){
setTimeout(drawCharts,100);
});
// start client-side testing
setTimeout(startClientTests,500);
}

// ═══ آمار ═══
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

// ═══ Client-Side Network Testing ═══
function startClientTests(){
var configs=data.configs||[];
// فقط آنلاین‌ها را تست کن + مرتب بر اساس server_score
var testable=configs.filter(function(c){
return c.health&&c.health.status==='online'&&c.host;
}).sort(function(a,b){
return(b.server_score||0)-(a.server_score||0);
});

testQueue=testable.slice();
isTesting=true;
processTestQueue();
}

function processTestQueue(){
if(!isTesting||testQueue.length===0){
isTesting=false;
saveCache();
return;
}

var batch=testQueue.splice(0,BATCH_SIZE);
var promises=batch.map(function(cfg){
return testConfig(cfg);
});

Promise.all(promises).then(function(){
// update UI incrementally
updateScoresAndSort();
// next batch with small delay
setTimeout(processTestQueue,200);
});
}

function testConfig(cfg){
var hash=cfg.hash||cfg.host+':'+cfg.port;

// skip if recently tested
if(clientScores[hash]&&Date.now()-clientScores[hash].ts<10*60*1000){
return Promise.resolve();
}

return new Promise(function(resolve){
var host=cfg.host;
var port=cfg.port||443;
var protocol=cfg.protocol||'';

// Strategy: try multiple methods
var methods=[];

// Method 1: fetch to https
if(port===443||port===8443){
methods.push({
url:'https://'+host+':'+port+'/',
type:'fetch'
});
}

// Method 2: Image probe (works cross-origin)
methods.push({
url:'https://'+host+':'+port+'/favicon.ico',
type:'image'
});

// Method 3: fetch with no-cors
methods.push({
url:'http://'+host+':'+port+'/',
type:'fetch-no-cors'
});

testWithMethods(hash,methods,0,resolve);
});
}

function testWithMethods(hash,methods,idx,resolve){
if(idx>=methods.length){
// all methods failed
clientScores[hash]={
score:0,
latency:null,
reachable:false,
tested:true,
ts:Date.now()
};
resolve();
return;
}

var method=methods[idx];
var startTime=performance.now();
var timeout;

if(method.type==='image'){
var img=new Image();
timeout=setTimeout(function(){
img.onload=img.onerror=null;
testWithMethods(hash,methods,idx+1,resolve);
},TEST_TIMEOUT);

img.onload=function(){
clearTimeout(timeout);
var lat=performance.now()-startTime;
clientScores[hash]={
score:calculateClientScore(lat,true),
latency:Math.round(lat),
reachable:true,
tested:true,
ts:Date.now()
};
resolve();
};

img.onerror=function(){
clearTimeout(timeout);
var lat=performance.now()-startTime;
// error but fast = host exists, resource doesn't
if(lat<TEST_TIMEOUT-500){
clientScores[hash]={
score:calculateClientScore(lat,true),
latency:Math.round(lat),
reachable:true,
tested:true,
ts:Date.now()
};
resolve();
}else{
testWithMethods(hash,methods,idx+1,resolve);
}
};

img.src=method.url+'?_='+Date.now();

}else if(method.type==='fetch-no-cors'){
timeout=setTimeout(function(){
testWithMethods(hash,methods,idx+1,resolve);
},TEST_TIMEOUT);

fetch(method.url,{
method:'HEAD',
mode:'no-cors',
cache:'no-store',
signal:AbortSignal.timeout?AbortSignal.timeout(TEST_TIMEOUT):undefined
}).then(function(){
clearTimeout(timeout);
var lat=performance.now()-startTime;
clientScores[hash]={
score:calculateClientScore(lat,true),
latency:Math.round(lat),
reachable:true,
tested:true,
ts:Date.now()
};
resolve();
}).catch(function(){
clearTimeout(timeout);
var lat=performance.now()-startTime;
if(lat<TEST_TIMEOUT-1000){
clientScores[hash]={
score:calculateClientScore(lat,true),
latency:Math.round(lat),
reachable:true,
tested:true,
ts:Date.now()
};
resolve();
}else{
testWithMethods(hash,methods,idx+1,resolve);
}
});

}else{
timeout=setTimeout(function(){
testWithMethods(hash,methods,idx+1,resolve);
},TEST_TIMEOUT);

fetch(method.url,{
method:'HEAD',
mode:'no-cors',
cache:'no-store'
}).then(function(){
clearTimeout(timeout);
var lat=performance.now()-startTime;
clientScores[hash]={
score:calculateClientScore(lat,true),
latency:Math.round(lat),
reachable:true,
tested:true,
ts:Date.now()
};
resolve();
}).catch(function(){
clearTimeout(timeout);
testWithMethods(hash,methods,idx+1,resolve);
});
}
}

function calculateClientScore(latencyMs,reachable){
if(!reachable)return 0;
// 0-40 score based on latency
// <100ms → 40
// 100-300ms → 25-40
// 300-600ms → 10-25
// 600-1500ms → 0-10
// >1500ms → 0
if(latencyMs<100)return MAX_CLIENT_SCORE;
if(latencyMs<300)return MAX_CLIENT_SCORE-(latencyMs-100)*(15/200);
if(latencyMs<600)return 25-(latencyMs-300)*(15/300);
if(latencyMs<1500)return 10-(latencyMs-600)*(10/900);
return 0;
}

function updateScoresAndSort(){
var configs=data.configs||[];
configs.forEach(function(c){
var hash=c.hash||c.host+':'+c.port;
var cs=clientScores[hash];
if(cs&&cs.tested){
c.client_score=Math.round(cs.score*10)/10;
c.client_latency=cs.latency;
c.client_reachable=cs.reachable;
c.score=(c.server_score||0)+c.client_score;
}else{
c.client_score=null;
c.client_latency=null;
c.client_reachable=null;
c.score=c.server_score||0;
}
});

// re-sort
configs.sort(function(a,b){
return(b.score||0)-(a.score||0);
});
for(var i=0;i<configs.length;i++){
configs[i].rank=i+1;
}

// incremental UI update
applyFilters();
}

// ═══ فیلتر ═══
function populateFilters(){
var protos={};
(data.configs||[]).forEach(function(c){protos[c.protocol]=1});
var html='<option value="all">همه پروتکل‌ها</option>';
Object.keys(protos).sort().forEach(function(p){
html+='<option value="'+p+'">'+(PROTO[p]||p)+'</option>';
});
dom.filterProto.innerHTML=html;
}

var filterTimer=null;
function applyFiltersDebounced(){
clearTimeout(filterTimer);
filterTimer=setTimeout(applyFilters,200);
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
renderListChunked();
dom.showCount.textContent=fa(list.length);
}

function getL(c){
// prefer client latency if available
if(c.client_latency!=null)return c.client_latency;
return c.health&&c.health.latency_ms!=null?c.health.latency_ms:99999;
}

// ═══ Chunked Rendering ═══
var renderRAF=null;
function renderListChunked(){
if(renderRAF)cancelAnimationFrame(renderRAF);

if(filtered.length===0){
dom.configList.innerHTML='';
dom.emptyBox.classList.remove('hidden');
return;
}
dom.emptyBox.classList.add('hidden');

// Render first chunk immediately
var firstChunk=filtered.slice(0,RENDER_CHUNK);
dom.configList.innerHTML=renderItems(firstChunk,0);

// Render remaining chunks progressively
if(filtered.length>RENDER_CHUNK){
var offset=RENDER_CHUNK;
function renderNextChunk(){
if(offset>=filtered.length)return;
var chunk=filtered.slice(offset,offset+RENDER_CHUNK);
var frag=document.createElement('div');
frag.innerHTML=renderItems(chunk,offset);
while(frag.firstChild){
dom.configList.appendChild(frag.firstChild);
}
offset+=RENDER_CHUNK;
if(offset<filtered.length){
renderRAF=requestAnimationFrame(renderNextChunk);
}
}
renderRAF=requestAnimationFrame(renderNextChunk);
}
}

function renderItems(items,startIdx){
var html='';
for(var i=0;i<items.length;i++){
html+=renderOneItem(items[i],startIdx+i);
}
return html;
}

function renderOneItem(c,idx){
var h=c.health||{};
var online=h.status==='online';
var serverLat=h.latency_ms;
var clientLat=c.client_latency;
var score=Math.round(c.score||0);
var serverScore=Math.round(c.server_score||0);
var clientScore=c.client_score!=null?Math.round(c.client_score):'—';
var proto=c.protocol||'unknown';
var rank=c.rank||idx+1;
var isMTP=proto==='mtproto';
var delay=Math.min(idx*15,300);

// testing indicator
var testStatus='';
var hash=c.hash||c.host+':'+c.port;
var cs=clientScores[hash];
if(cs&&cs.tested){
if(cs.reachable){
testStatus='<span title="از اینترنت شما قابل دسترس" style="color:var(--green)">✓</span>';
}else{
testStatus='<span title="از اینترنت شما قابل دسترس نیست" style="color:var(--red)">✗</span>';
}
}else if(isTesting){
testStatus='<span title="در حال تست..." style="color:var(--yellow)">◌</span>';
}

// display latency: prefer client
var displayLat='—';
var latSource='';
if(clientLat!=null){
displayLat=fa(clientLat)+' ms';
latSource=' (شما)';
}else if(serverLat!=null){
displayLat=fa(serverLat)+' ms';
latSource=' (سرور)';
}

var s='';
s+='<div class="config-item glass-card fade-up" style="animation-delay:'+delay+'ms">';

s+='<div class="cfg-left">';
s+='<span class="cfg-rank '+(rank<=3?'top-'+rank:'')+'">'+fa(rank)+'</span>';
s+='<span class="proto-tag proto-'+proto+'">'+(PROTO[proto]||proto)+'</span>';
s+='</div>';

s+='<div class="cfg-info">';
s+='<span class="cfg-name">'+esc(c.name||'بدون نام')+' '+testStatus+'</span>';
s+='<span class="cfg-host">'+esc(c.host||'')+':'+(c.port||'')+'</span>';
s+='<div class="cfg-meta">';
s+='<span><span class="status-dot '+(online?'online':h.status==='timeout'?'timeout':'offline')+'"></span>'+(online?'آنلاین':'آفلاین')+'</span>';
s+='<span>⚡ '+displayLat+latSource+'</span>';
s+='<span>📡 '+esc(c.source_label||'')+'</span>';
s+='</div></div>';

s+='<div class="cfg-right">';
s+='<span class="cfg-score" style="color:'+scoreClr(score)+'">'+fa(score)+'<small style="font-size:0.6em;color:var(--text-3)"> /100</small></span>';
s+='<div class="cfg-actions">';
s+='<button class="action-btn" title="کپی لینک" onclick="IP.copy('+idx+')">📋</button>';
if(isMTP)s+='<button class="action-btn tg-btn" title="اتصال تلگرام" onclick="IP.openTG('+idx+')">✈️</button>';
s+='<button class="action-btn" title="جزئیات" onclick="IP.detail('+idx+')">👁</button>';
s+='</div></div></div>';

return s;
}

// ═══ کپی ═══
function copyConfig(idx){
var c=filtered[idx];
if(!c){showToast('خطا');return}
var uri=c.original_uri||'';
if(!uri&&c.protocol==='mtproto'){
uri='tg://proxy?server='+c.host+'&port='+c.port+'&secret='+(c.secret||'');
}
if(!uri){showToast('لینک موجود نیست');return}
copyToClipboard(uri);
}

function copyToClipboard(text){
if(navigator.clipboard&&navigator.clipboard.writeText){
navigator.clipboard.writeText(text).then(function(){
showToast('کپی شد ✓');
}).catch(function(){
fallbackCopy(text);
});
}else{
fallbackCopy(text);
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
window.open('tg://proxy?server='+c.host+'&port='+c.port+'&secret='+(c.secret||''),'_blank');
}
}

// ═══ مودال ═══
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

var serverScore=Math.round(c.server_score||0);
var clientScoreVal=c.client_score!=null?Math.round(c.client_score):'تست نشده';
var finalScore=Math.round(c.score||0);

var body='';
body+='<div class="detail-row"><span class="detail-label">پروتکل</span><span class="detail-value">'+(PROTO[c.protocol]||c.protocol)+'</span></div>';
body+='<div class="detail-row"><span class="detail-label">هاست</span><span class="detail-value">'+esc(c.host)+':'+(c.port||'')+'</span></div>';
body+='<div class="detail-row"><span class="detail-label">وضعیت سرور</span><span class="detail-value">'+(h.status==='online'?'🟢 آنلاین':'🔴 آفلاین')+'</span></div>';
body+='<div class="detail-row"><span class="detail-label">تأخیر سرور</span><span class="detail-value">'+(h.latency_ms!=null?fa(h.latency_ms)+' ms':'—')+'</span></div>';

// ═══ Client-Side Network Testing (v2 — واقعاً کار می‌کنه) ═══

var TEST_TIMEOUT=6000;
var BATCH_SIZE=5;
var userNetworkSpeed=null; // baseline speed

function startClientTests(){
// اول سرعت پایه اینترنت کاربر رو بسنج
measureBaseline(function(){
var configs=data.configs||[];
var testable=configs.filter(function(c){
return c.host&&c.health&&c.health.status==='online';
}).sort(function(a,b){
return(b.server_score||0)-(a.server_score||0);
});
testQueue=testable.slice();
isTesting=true;
processTestQueue();
});
}

function measureBaseline(callback){
// تست سرعت پایه با چند سایت معروف
var targets=[
'https://www.google.com/favicon.ico',
'https://www.cloudflare.com/favicon.ico',
'https://www.microsoft.com/favicon.ico'
];
var results=[];
var done=0;

targets.forEach(function(url){
var start=performance.now();
var img=new Image();
var timer=setTimeout(function(){
img.onload=img.onerror=null;
done++;
if(done>=targets.length)finishBaseline(results,callback);
},4000);

var handler=function(){
clearTimeout(timer);
var elapsed=performance.now()-start;
results.push(elapsed);
done++;
if(done>=targets.length)finishBaseline(results,callback);
};

img.onload=handler;
img.onerror=handler; // حتی error هم timing میده
img.src=url+'?_='+Date.now();
});
}

function finishBaseline(results,callback){
if(results.length>0){
// میانگین سرعت پایه
var sum=0;
for(var i=0;i<results.length;i++)sum+=results[i];
userNetworkSpeed=sum/results.length;
}else{
userNetworkSpeed=500; // default
}
callback();
}

function processTestQueue(){
if(!isTesting||testQueue.length===0){
isTesting=false;
saveCache();
updateScoresAndSort();
return;
}

var batch=testQueue.splice(0,BATCH_SIZE);
var promises=batch.map(function(cfg){
return testOneConfig(cfg);
});

Promise.all(promises).then(function(){
// update UI after each batch
updateScoresAndSort();
setTimeout(processTestQueue,300);
});
}

function testOneConfig(cfg){
var hash=cfg.hash||(cfg.host+':'+cfg.port);

// skip if recently tested (10 min cache)
if(clientScores[hash]&&Date.now()-clientScores[hash].ts<10*60*1000){
return Promise.resolve();
}

return new Promise(function(resolve){
var host=cfg.host||'';
var port=cfg.port||443;
var results=[];
var testsCompleted=0;
var totalTests=3;

function onTestDone(){
testsCompleted++;
if(testsCompleted>=totalTests){
processResults(hash,results);
resolve();
}
}

// Test 1: Image probe to host (HTTPS)
probeImage('https://'+host+':'+port+'/favicon.ico',function(r){
results.push(r);
onTestDone();
});

// Test 2: Image probe to host (HTTP fallback)
probeImage('http://'+host+':'+port+'/favicon.ico',function(r){
results.push(r);
onTestDone();
});

// Test 3: Fetch with no-cors
probeFetch('https://'+host+':'+port+'/',function(r){
results.push(r);
onTestDone();
});
});
}

function probeImage(url,callback){
var start=performance.now();
var img=new Image();
var timedOut=false;

var timer=setTimeout(function(){
timedOut=true;
img.onload=img.onerror=null;
img.src='';
callback({latency:TEST_TIMEOUT,reachable:false,method:'image-timeout'});
},TEST_TIMEOUT);

img.onload=function(){
if(timedOut)return;
clearTimeout(timer);
var lat=performance.now()-start;
callback({latency:Math.round(lat),reachable:true,method:'image-load'});
};

img.onerror=function(){
if(timedOut)return;
clearTimeout(timer);
var lat=performance.now()-start;
// اگه سریع error داد = host قابل دسترسه ولی resource نیست
// اگه کند error داد = احتمالاً بلاکه
var reachable=lat<(TEST_TIMEOUT*0.7);
callback({latency:Math.round(lat),reachable:reachable,method:'image-error'});
};

try{
img.src=url+'?_='+Date.now();
}catch(e){
clearTimeout(timer);
callback({latency:TEST_TIMEOUT,reachable:false,method:'image-exception'});
}
}

function probeFetch(url,callback){
var start=performance.now();
var controller=null;
var timer=null;

try{
if(window.AbortController){
controller=new AbortController();
}
}catch(e){}

timer=setTimeout(function(){
if(controller){
try{controller.abort();}catch(e){}
}
callback({latency:TEST_TIMEOUT,reachable:false,method:'fetch-timeout'});
},TEST_TIMEOUT);

var opts={
method:'HEAD',
mode:'no-cors',
cache:'no-store'
};
if(controller)opts.signal=controller.signal;

fetch(url,opts).then(function(){
clearTimeout(timer);
var lat=performance.now()-start;
callback({latency:Math.round(lat),reachable:true,method:'fetch-ok'});
}).catch(function(err){
clearTimeout(timer);
var lat=performance.now()-start;
// no-cors fetch: حتی وقتی error میده، اگه سریع باشه یعنی host هست
var reachable=lat<(TEST_TIMEOUT*0.6);
callback({latency:Math.round(lat),reachable:reachable,method:'fetch-error'});
});
}

function processResults(hash,results){
if(!results||results.length===0){
clientScores[hash]={
score:0,latency:null,reachable:false,tested:true,
method:'no-results',ts:Date.now()
};
return;
}

// پیدا کردن بهترین نتیجه
var bestReachable=null;
var bestLatency=TEST_TIMEOUT;
var anyReachable=false;
var methods=[];

for(var i=0;i<results.length;i++){
var r=results[i];
methods.push(r.method);
if(r.reachable){
anyReachable=true;
if(r.latency<bestLatency){
bestLatency=r.latency;
bestReachable=r;
}
}
}

// اگه هیچ‌کدوم reachable نبود، کمترین latency رو بگیر
if(!anyReachable){
for(var j=0;j<results.length;j++){
if(results[j].latency<bestLatency){
bestLatency=results[j].latency;
}
}
}

var score=calculateClientScore(bestLatency,anyReachable);

clientScores[hash]={
score:Math.round(score*10)/10,
latency:bestLatency<TEST_TIMEOUT?bestLatency:null,
reachable:anyReachable,
tested:true,
method:methods.join(','),
ts:Date.now()
};
}

function calculateClientScore(latencyMs,reachable){
if(!reachable){
// حتی اگه reachable نیست، بر اساس latency یه امتیاز کوچک بده
// چون ممکنه از اینترنت کاربر قابل استفاده باشه ولی probe fail شده
if(latencyMs<1000)return MAX_CLIENT_SCORE*0.15; // 6 از 40
if(latencyMs<3000)return MAX_CLIENT_SCORE*0.05; // 2 از 40
return 0;
}

// امتیاز نسبی بر اساس baseline اینترنت کاربر
var baseline=userNetworkSpeed||500;
var ratio=latencyMs/baseline;

// ratio < 1 = سریع‌تر از baseline → امتیاز بالا
// ratio = 1 = مثل baseline → امتیاز متوسط
// ratio > 2 = خیلی کندتر → امتیاز پایین

if(ratio<0.5)return MAX_CLIENT_SCORE;                    // 40
if(ratio<1.0)return MAX_CLIENT_SCORE*0.85;               // 34
if(ratio<1.5)return MAX_CLIENT_SCORE*0.7;                // 28
if(ratio<2.0)return MAX_CLIENT_SCORE*0.5;                // 20
if(ratio<3.0)return MAX_CLIENT_SCORE*0.3;                // 12
if(ratio<5.0)return MAX_CLIENT_SCORE*0.15;               // 6
return MAX_CLIENT_SCORE*0.05;                             // 2
}

function updateScoresAndSort(){
var configs=data.configs||[];
var anyUpdated=false;

configs.forEach(function(c){
var hash=c.hash||(c.host+':'+c.port);
var cs=clientScores[hash];
if(cs&&cs.tested){
var oldScore=c.client_score;
c.client_score=cs.score;
c.client_latency=cs.latency;
c.client_reachable=cs.reachable;
c.score=(c.server_score||0)+cs.score;
if(oldScore!==cs.score)anyUpdated=true;
}else{
c.client_score=null;
c.client_latency=null;
c.client_reachable=null;
c.score=c.server_score||0;
}
});

if(anyUpdated){
configs.sort(function(a,b){
return(b.score||0)-(a.score||0);
});
for(var i=0;i<configs.length;i++){
configs[i].rank=i+1;
}
applyFilters();
}
}

// ═══ Toast ═══
function showToast(msg){
dom.toast.textContent=msg;
dom.toast.classList.add('show');
setTimeout(function(){dom.toast.classList.remove('show')},2000);
}

// ═══ نمودارها ═══
var chartsDrawn=false;
function drawCharts(){
if(chartsDrawn&&!document.hidden)return;
chartsDrawn=true;
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

// ═══ ابزارها ═══
function fa(n){
if(n===null||n===undefined||n==='—')return'—';
return String(n).replace(/\d/g,function(d){return'۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]});
}

function esc(s){
if(!s)return'';
var div=document.createElement('div');
div.textContent=String(s);
return div.innerHTML;
}

function scoreClr(s){
if(typeof s!=='number')return'var(--text-3)';
if(s>=80)return'#34d399';
if(s>=60)return'#60a5fa';
if(s>=40)return'#fbbf24';
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

// ═══ رویدادها ═══
function bind(){
dom.themeBtn.addEventListener('click',toggleTheme);
dom.search.addEventListener('input',debounce(applyFilters,250));
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
window.addEventListener('resize',debounce(function(){
chartsDrawn=false;
if(data)drawCharts();
},300));
// redraw charts when tab becomes visible
document.addEventListener('visibilitychange',function(){
if(!document.hidden&&data){
chartsDrawn=false;
drawCharts();
}
});
}

// ═══ API ═══
window.IP={
copy:copyConfig,
openTG:openTelegram,
detail:showDetail,
copyURI:copyURI
};

// ═══ شروع ═══
initTheme();
bind();
loadData();

})();
