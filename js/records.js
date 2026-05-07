/* ===================================================
   records.js — 我的路線頁、篩選、統計、分享卡片、雲端存取
   City Walker v1.33.0
   =================================================== */

import { t } from './i18n/i18n.js';

var PATH_CHUNK_SIZE = 500;

/* ===================================================
   語系切換時重新渲染動態內容
   =================================================== */
document.addEventListener('langchange', function(){
  /* 重新填 filter options（select 的 option 是靜態 HTML，applyDataI18n 處理不到） */
  _rebuildFilterOptions();
  /* 若列表已渲染，重刷 */
  if(window.currentDocs) renderCards(window.currentDocs);
  /* 重刷統計 */
  if(window.currentDocs) renderStats(window.currentDocs);
  /* 重刷 manage 按鈕文字 */
  var btn = document.getElementById('btnManage');
  if(btn){
    btn.innerText = document.body.classList.contains('select-mode')
      ? t('btn.manageDone') : t('btn.manage');
  }
});

function _rebuildFilterOptions(){
  /* filterCity 的第一個 option */
  var fcFirst = document.querySelector('#filterCity option[value=""]');
  if(fcFirst) fcFirst.text = t('list.filterAllCities');

  /* filterKm */
  var kmSel = document.getElementById('filterKm');
  if(kmSel){
    var kmMap = {'':'list.filterAllKm','0-1':'list.filterKm01','1-5':'list.filterKm15','5-10':'list.filterKm510','10+':'list.filterKm10p'};
    Array.from(kmSel.options).forEach(function(o){ if(kmMap[o.value]) o.text=t(kmMap[o.value]); });
  }

  /* filterDate */
  var dateSel = document.getElementById('filterDate');
  if(dateSel){
    var dateMap = {'':'list.filterAllDates','7':'list.filterDays7','30':'list.filterDays30','90':'list.filterDays90'};
    Array.from(dateSel.options).forEach(function(o){ if(dateMap[o.value]) o.text=t(dateMap[o.value]); });
  }

  /* clearFilterBtn */
  var clr = document.getElementById('clearFilterBtn');
  if(clr) clr.innerText = t('list.filterClear');

  /* searchInput placeholder */
  var si = document.getElementById('searchInput');
  if(si) si.placeholder = t('list.searchPlaceholder');
}

/* ===================================================
   開啟儲存 Modal
   =================================================== */
function openSaveModal(){
  var toggle=document.getElementById('publicToggle');
  if(toggle) toggle.checked=false;
  document.getElementById('saveModal').style.display='flex';
}

async function executeCloudSave(){
  var btn=document.getElementById('btnConfirmSave'); if(btn)btn.disabled=true;
  var isPublic=document.getElementById('publicToggle')?document.getElementById('publicToggle').checked:false;
  try{
    var docRef=await window.api.addDoc(window.api.collection(window.db,'walk_records'),{
      name:document.getElementById('routeName').value||'未命名漫遊',
      city:window.cityName||'未知城市',
      distance:window.totalDistance||0,
      duration:window.durationStr||'',
      events:window.eventsData.map(function(ev){var c=Object.assign({},ev);delete c._overlay;return c;}),
      trackColor:window.selectedTrackColor||'#333333',
      isPinned:false, isPublic:isPublic,
      authorDisplayName:'', authorPhotoUrl:'',
      createdAt:window.api.serverTimestamp(),
      userId:window.currentUid||'anonymous'
    });
    var pathColRef=window.api.collection(window.db,'walk_records',docRef.id,'path_points');
    var chunkPromises=[];
    for(var i=0;i<window.walkPath.length;i+=PATH_CHUNK_SIZE){
      var chunk=window.walkPath.slice(i,i+PATH_CHUNK_SIZE);
      var chunkDocRef=window.api.doc(pathColRef,'chunk_'+Math.floor(i/PATH_CHUNK_SIZE));
      chunkPromises.push(window.api.setDoc(chunkDocRef,{index:Math.floor(i/PATH_CHUNK_SIZE),points:chunk}));
    }
    await Promise.all(chunkPromises);
    location.reload();
  }catch(e){
    console.error('[Save] 儲存失敗:',e);
    alert(t('modal.save.fail'));
    if(btn)btn.disabled=false;
  }
}

/* ===================================================
   fetchRecords / renderStats / buildCityFilter
   =================================================== */
async function fetchRecords(){
  var container=document.getElementById('recordsContainer');
  if(!container)return;
  container.innerHTML='<p style="text-align:center;padding:20px;">'+t('list.loading')+'</p>';
  try{
    var uid=window.currentUid||'anonymous';
    var q=window.api.query(window.api.collection(window.db,'walk_records'),window.api.where('userId','==',uid));
    var snap=await window.api.getDocs(q);
    window.currentDocs=[];
    snap.forEach(function(d){window.currentDocs.push(Object.assign({id:d.id},d.data()));});
    window.currentDocs.sort(function(a,b){
      return(b.isPinned-a.isPinned)||((b.createdAt&&b.createdAt.seconds||0)-(a.createdAt&&a.createdAt.seconds||0));
    });
    renderStats(window.currentDocs);
    buildCityFilter(window.currentDocs);
    renderCards(window.currentDocs);
  }catch(e){
    console.error(e);
    container.innerHTML='<p style="text-align:center;color:red;">'+t('list.loadFail')+'</p>';
  }
}

function renderStats(docs){
  var totalKm=0,cities={},totalEvents=0;
  docs.forEach(function(d){totalKm+=(d.distance||0);if(d.city)cities[d.city]=true;totalEvents+=(d.events?d.events.length:0);});
  document.getElementById('statRoutes').innerText=docs.length;
  document.getElementById('statKm').innerText=totalKm.toFixed(1);
  document.getElementById('statCities').innerText=Object.keys(cities).length;
  document.getElementById('statEvents').innerText=totalEvents;
}

function buildCityFilter(docs){
  var cities=[],seen={};
  docs.forEach(function(d){if(d.city&&!seen[d.city]){seen[d.city]=true;cities.push(d.city);}});
  var sel=document.getElementById('filterCity');
  while(sel.options.length>1)sel.remove(1);
  cities.forEach(function(c){
    var opt=document.createElement('option');opt.value=c;opt.text='🏙 '+c;sel.appendChild(opt);
  });
}

function applyFilters(){
  if(!window.currentDocs)return;
  var cityVal=document.getElementById('filterCity').value;
  var kmVal=document.getElementById('filterKm').value;
  var dateVal=document.getElementById('filterDate').value;
  var searchVal=(document.getElementById('searchInput').value||'').trim().toLowerCase();
  var hasFilter=cityVal||kmVal||dateVal||searchVal;
  document.getElementById('filterCity').classList.toggle('active',!!cityVal);
  document.getElementById('filterKm').classList.toggle('active',!!kmVal);
  document.getElementById('filterDate').classList.toggle('active',!!dateVal);
  document.getElementById('clearFilterBtn').classList.toggle('visible',!!hasFilter);
  var now=Date.now();
  var filtered=window.currentDocs.filter(function(d){
    if(searchVal&&!(d.name||'').toLowerCase().includes(searchVal))return false;
    if(cityVal&&d.city!==cityVal)return false;
    if(kmVal){var km=d.distance||0;
      if(kmVal==='0-1'&&km>=1)return false;
      if(kmVal==='1-5'&&(km<1||km>=5))return false;
      if(kmVal==='5-10'&&(km<5||km>=10))return false;
      if(kmVal==='10+'&&km<10)return false;
    }
    if(dateVal&&d.createdAt&&d.createdAt.seconds){
      if((now-d.createdAt.seconds*1000)>parseInt(dateVal)*86400000)return false;
    }
    return true;
  });
  document.getElementById('filterCount').innerText=hasFilter?t('list.filterCount',{n:filtered.length}):'';
  renderCards(filtered);
}

function clearFilters(){
  document.getElementById('filterCity').value='';
  document.getElementById('filterKm').value='';
  document.getElementById('filterDate').value='';
  document.getElementById('searchInput').value='';
  document.querySelectorAll('.filter-select').forEach(function(s){s.classList.remove('active');});
  document.getElementById('clearFilterBtn').classList.remove('visible');
  document.getElementById('filterCount').innerText='';
  renderCards(window.currentDocs);
}

/* ===================================================
   renderCards / appendCard / 批次操作
   =================================================== */
function renderCards(docs){
  var container=document.getElementById('recordsContainer');
  container.innerHTML='';
  if(!docs||docs.length===0){
    container.innerHTML='<p style="text-align:center;padding:30px;color:var(--text-soft);">'+t('list.empty')+'</p>';
    return;
  }
  var pinned=docs.filter(function(d){return d.isPinned;});
  var unpinned=docs.filter(function(d){return !d.isPinned;});
  var cityGroups={},cityOrder=[];
  unpinned.forEach(function(d){var c=d.city||'未知城市';if(!cityGroups[c]){cityGroups[c]=[];cityOrder.push(c);}cityGroups[c].push(d);});
  if(pinned.length>0){appendGroupHeader(container,t('list.pinnedGroup'));pinned.forEach(function(d){appendCard(container,d);});}
  cityOrder.forEach(function(city){appendGroupHeader(container,city);cityGroups[city].forEach(function(d){appendCard(container,d);});});
}

function appendGroupHeader(container,label){
  var h=document.createElement('div');h.className='city-group-header';h.innerText=label;container.appendChild(h);
}

function appendCard(container,data){
  var cardColor=data.trackColor||'#8FB9A8';
  var dateStr='';
  if(data.createdAt&&data.createdAt.seconds){
    dateStr=new Date(data.createdAt.seconds*1000).toLocaleDateString(
      window._lang==='en'?'en-US':'zh-TW',{month:'2-digit',day:'2-digit'}
    );
  }
  var metaParts=['👣 '+(data.distance||0).toFixed(2)+' km','⏱️ '+data.duration];
  if(dateStr)metaParts.push('📅 '+dateStr);
  if(data.city)metaParts.push('🏙 '+data.city);
  var row=document.createElement('div');
  row.className='route-row'+(data.isPinned?' is-pinned':'');
  row.setAttribute('data-id',data.id);
  row.style.borderLeftColor=data.isPinned?'var(--accent-pin)':cardColor;
  var pinLabel=data.isPinned?t('btn.unpinRoute'):t('btn.pinRoute');
  var publicLabel=data.isPublic?t('btn.publicRoute'):t('btn.privateRoute');
  var publicClass='route-action-btn btn-public'+(data.isPublic?' is-public':'');
  row.innerHTML=
    '<div class="route-row-main" onclick="onRowMainClick(event,\''+data.id+'\')">'+
      '<div class="route-checkbox-wrap"><div class="route-checkbox" id="chk-'+data.id+'" onclick="event.stopPropagation();toggleSelectCard(\''+data.id+'\')"></div></div>'+
      '<div class="route-color-dot" style="background:'+cardColor+'"></div>'+
      '<div class="route-row-info"><div class="route-row-name">'+data.name+'</div><div class="route-row-meta">'+metaParts.join('  ')+'</div></div>'+
      '<div class="route-row-arrow">▼</div>'+
    '</div>'+
    '<div class="route-row-actions"><div class="route-action-btns">'+
      '<button class="route-action-btn btn-load" onclick="loadSavedRoute(\''+data.id+'\')">'+t('btn.loadRoute')+'</button>'+
      '<button class="route-action-btn btn-pin" onclick="togglePin(event,\''+data.id+'\','+data.isPinned+')">'+pinLabel+'</button>'+
      '<button class="'+publicClass+'" onclick="togglePublic(event,\''+data.id+'\','+!!data.isPublic+')">'+publicLabel+'</button>'+
      '<button class="route-action-btn btn-share" onclick="openShareCard(event,\''+data.id+'\')">'+t('btn.shareRoute')+'</button>'+
      '<button class="route-action-btn btn-del" onclick="deleteRecord(event,\''+data.id+'\')">'+t('btn.deleteRoute')+'</button>'+
    '</div></div>';
  container.appendChild(row);
}

function onRowMainClick(e,id){
  if(document.body.classList.contains('select-mode')){toggleSelectCard(id);return;}
  var row=document.querySelector('.route-row[data-id="'+id+'"]');
  if(!row)return;
  var isExpanded=row.classList.contains('expanded');
  document.querySelectorAll('.route-row.expanded').forEach(function(r){r.classList.remove('expanded');});
  if(!isExpanded)row.classList.add('expanded');
}

function toggleSelectMode(){if(document.body.classList.contains('select-mode')){exitSelectMode();}else{enterSelectMode();}}
function enterSelectMode(){
  document.body.classList.add('select-mode');window._selectedIds=new Set();
  document.getElementById('btnManage').classList.add('active');
  document.getElementById('btnManage').innerText=t('btn.manageDone');
  document.getElementById('batchDeleteBar').classList.add('visible');updateBatchDeleteBar();
  document.querySelectorAll('.route-row.expanded').forEach(function(r){r.classList.remove('expanded');});
}
function exitSelectMode(){
  document.body.classList.remove('select-mode');window._selectedIds=new Set();
  document.getElementById('btnManage').classList.remove('active');
  document.getElementById('btnManage').innerText=t('btn.manage');
  document.getElementById('batchDeleteBar').classList.remove('visible');
  document.querySelectorAll('.route-checkbox.checked').forEach(function(c){c.classList.remove('checked');});
}
function toggleSelectCard(id){
  if(!window._selectedIds)window._selectedIds=new Set();
  var chk=document.getElementById('chk-'+id);
  if(window._selectedIds.has(id)){window._selectedIds.delete(id);if(chk)chk.classList.remove('checked');}
  else{window._selectedIds.add(id);if(chk)chk.classList.add('checked');}
  updateBatchDeleteBar();
}
function updateBatchDeleteBar(){
  var count=window._selectedIds?window._selectedIds.size:0;
  document.getElementById('batchDeleteLabel').innerText=t('list.batchSelected',{n:count});
  document.getElementById('batchDeleteBtn').disabled=count===0;
  document.getElementById('batchDeleteBtn').innerText=
    count>0?t('btn.batchDeleteCount',{n:count}):t('btn.batchDelete');
}

async function batchDelete(){
  var ids=window._selectedIds?Array.from(window._selectedIds):[];
  if(ids.length===0)return;
  if(!confirm(t('alert.batchDeleteConfirm',{n:ids.length})))return;
  var btn=document.getElementById('batchDeleteBtn');
  btn.disabled=true;btn.innerText=t('btn.batchDeleting');
  for(var i=0;i<ids.length;i++){
    var id=ids[i];var data=window.currentDocs&&window.currentDocs.find(function(d){return d.id===id;});
    if(data&&data.events&&window.storage&&window.storageApi){
      var sDeletes=[];
      data.events.forEach(function(ev){if(ev.photoUrl&&ev.photoUrl.startsWith('https://')){try{sDeletes.push(window.storageApi.deleteObject(window.storageApi.ref(window.storage,ev.photoUrl)).catch(function(){}));}catch(e){}}});
      if(sDeletes.length>0)await Promise.all(sDeletes);
    }
    try{var pc=window.api.collection(window.db,'walk_records',id,'path_points');var ps=await window.api.getDocs(pc);var cd=[];ps.forEach(function(d){cd.push(window.api.deleteDoc(d.ref));});if(cd.length>0)await Promise.all(cd);}catch(e){}
    try{await window.api.deleteDoc(window.api.doc(window.db,'walk_records',id));}catch(e){}
  }
  exitSelectMode();fetchRecords();
}

async function loadSavedRoute(id){
  var data=window.currentDocs.find(function(d){return d.id===id;});if(!data)return;
  switchPage('main');
  window.pathLine.setPath([]);
  window.historyMarkers.forEach(function(m){m.setMap(null);});window.historyMarkers.length=0;
  window.setStatusBar(t('status.loadingRoute'),'var(--status-locating)');
  var pts=[];
  if(data.path&&data.path.length>0){pts=data.path.map(function(p){return{lat:p.lat,lng:p.lng};});}
  else{
    try{
      var pc=window.api.collection(window.db,'walk_records',id,'path_points');
      var snap=await window.api.getDocs(pc);var chunks=[];
      snap.forEach(function(d){chunks.push(d.data());});
      chunks.sort(function(a,b){return a.index-b.index;});
      chunks.forEach(function(c){if(c.points)pts=pts.concat(c.points);});
    }catch(err){
      console.error('[loadSavedRoute]',err);
      window.setStatusBar(t('status.appName'),'var(--status-idle)');return;
    }
  }
  if(pts.length===0){window.setStatusBar(t('status.appName'),'var(--status-idle)');return;}
  window.pathLine.setPath(pts);
  window.pathLine.setOptions({strokeColor:data.trackColor||'#FEAD89',strokeOpacity:0.85,strokeWeight:6});
  if(data.events){
    data.events.forEach(function(ev,idx){
      var overlay=window.createEventMarker(ev.pos,ev.icon,ev.text,ev.placeName||'',ev.photoUrl||'',ev.createdAt||'',id,idx,data.trackColor||'');
      window.historyMarkers.push(overlay);
    });
  }
  window._loadedRouteId=id;
  window._loadedRouteEvents=data.events?data.events.slice():[];
  window.map.panTo(pts[0]);
  document.getElementById('btnFocusRouteWrap').classList.remove('hidden');
  window.setStatusBar(t('status.appName'),'var(--status-idle)');
}

async function deleteRecord(e,id){
  e.stopPropagation();
  if(!confirm(t('alert.deleteConfirm')))return;
  var data=window.currentDocs&&window.currentDocs.find(function(d){return d.id===id;});
  if(data&&data.events&&window.storage&&window.storageApi){
    var sDeletes=[];
    data.events.forEach(function(ev){if(ev.photoUrl&&ev.photoUrl.startsWith('https://')){try{sDeletes.push(window.storageApi.deleteObject(window.storageApi.ref(window.storage,ev.photoUrl)).catch(function(){}));}catch(e){}}});
    if(sDeletes.length>0)await Promise.all(sDeletes);
  }
  try{var pc=window.api.collection(window.db,'walk_records',id,'path_points');var ps=await window.api.getDocs(pc);var cd=[];ps.forEach(function(d){cd.push(window.api.deleteDoc(d.ref));});if(cd.length>0)await Promise.all(cd);}catch(e){}
  await window.api.deleteDoc(window.api.doc(window.db,'walk_records',id));
  fetchRecords();
}

async function togglePin(e,id,status){
  e.stopPropagation();
  await window.api.updateDoc(window.api.doc(window.db,'walk_records',id),{isPinned:!status});
  fetchRecords();
}

async function togglePublic(e,id,currentStatus){
  e.stopPropagation();
  try{await window.api.updateDoc(window.api.doc(window.db,'walk_records',id),{isPublic:!currentStatus});fetchRecords();}
  catch(err){console.error('[togglePublic]',err);alert(t('alert.togglePublicFail'));}
}

/* ===================================================
   分享卡片（略，保留原邏輯不重複，僅換字串）
   =================================================== */
function _mercX(lng){return(lng+180)/360;}
function _mercY(lat){var s=Math.sin(lat*Math.PI/180);return 0.5-Math.log((1+s)/(1-s))/(4*Math.PI);}
function _latLngToImgPx(lat,lng,cLat,cLng,zoom,imgW,imgH){
  var scale=256*Math.pow(2,zoom);
  var cx=_mercX(cLng)*scale,cy=_mercY(cLat)*scale;
  var px=_mercX(lng)*scale,py=_mercY(lat)*scale;
  return{x:imgW/2+(px-cx),y:imgH/2+(py-cy)};
}
function _calcBestZoom(pts,imgW,imgH,pad){
  for(var z=17;z>=1;z--){
    var scale=256*Math.pow(2,z);
    var xs=pts.map(function(p){return _mercX(p.lng)*scale;});
    var ys=pts.map(function(p){return _mercY(p.lat)*scale;});
    if(Math.max.apply(null,xs)-Math.min.apply(null,xs)<=imgW-pad*2&&Math.max.apply(null,ys)-Math.min.apply(null,ys)<=imgH-pad*2)return z;
  }return 12;
}

async function openShareCard(e,id){
  e.stopPropagation();
  var data=window.currentDocs.find(function(d){return d.id===id;});if(!data)return;
  document.getElementById('shareCardModal').style.display='flex';
  var canvas=document.getElementById('shareCardCanvas');
  canvas.width=1080;canvas.height=1350;
  var ctx=canvas.getContext('2d');
  ctx.fillStyle='#EBEBEB';ctx.fillRect(0,0,1080,1350);
  ctx.fillStyle='#8FB9A8';ctx.font='bold 44px Arial';ctx.textAlign='center';
  ctx.fillText(t('list.loading'),540,675);ctx.textAlign='left';
  window._shareCardData=data;window._shareCardPhotoIndex=0;
  var pts=[];
  if(data.path&&data.path.length>0){pts=data.path;}
  else{try{var pc=window.api.collection(window.db,'walk_records',id,'path_points');var snap=await window.api.getDocs(pc);var chunks=[];snap.forEach(function(d){chunks.push(d.data());});chunks.sort(function(a,b){return a.index-b.index;});chunks.forEach(function(c){if(c.points)pts=pts.concat(c.points);});}catch(err){}}
  window._shareCardPts=pts;
  var photoUrls=[];
  if(data.events)data.events.forEach(function(ev){if(ev.photoUrl)photoUrls.push(ev.photoUrl);});
  if(photoUrls.length>0){
    var imgs=await Promise.all(photoUrls.map(function(url){return new Promise(function(resolve){var img=new Image();img.crossOrigin='anonymous';img.onload=function(){resolve(img);};img.onerror=function(){resolve(null);};img.src=url;});}));
    window._shareCardPhotos=imgs.filter(Boolean);
  }else{window._shareCardPhotos=[];}
  var hint=document.getElementById('sharePhotoHint');
  if(window._shareCardPhotos.length>1){
    hint.style.display='block';
    document.getElementById('sharePhotoIndex').innerText=
      t('memory.pager',{cur:1,total:window._shareCardPhotos.length});
  }else{hint.style.display='none';}
  generateShareCard(data,0);
}

function cycleSharePhoto(){
  var photos=window._shareCardPhotos;if(!photos||photos.length<=1)return;
  var data=window._shareCardData;if(!data)return;
  window._shareCardPhotoIndex=(window._shareCardPhotoIndex+1)%photos.length;
  document.getElementById('sharePhotoIndex').innerText=
    t('memory.pager',{cur:window._shareCardPhotoIndex+1,total:photos.length});
  generateShareCard(data,window._shareCardPhotoIndex);
}
function closeShareCard(){document.getElementById('shareCardModal').style.display='none';}
function downloadShareCard(){
  var canvas=document.getElementById('shareCardCanvas');
  var link=document.createElement('a');
  link.download='citywalk-'+(window._shareCardData&&window._shareCardData.city||'route')+'.png';
  link.href=canvas.toDataURL('image/png');link.click();
}

async function generateShareCard(data,photoIndex){
  window._shareCardData=data;
  var canvas=document.getElementById('shareCardCanvas');
  var W=1080,H=1350;canvas.width=W;canvas.height=H;
  var ctx=canvas.getContext('2d');
  var DARK='#1C1C1C',WHITE='#FFFFFF',CREAM='#F5F2EC',SOFT='#888888';
  var GREEN=data.trackColor||'#8FB9A8';
  var HEADER_H=180,MAP_Y=HEADER_H,MAP_H=900,BOTTOM_Y=MAP_Y+MAP_H,BOTTOM_H=H-BOTTOM_Y;
  ctx.fillStyle=DARK;ctx.fillRect(0,0,W,HEADER_H);
  ctx.fillStyle=WHITE;ctx.font='bold 56px "Arial",sans-serif';ctx.textAlign='left';
  ctx.fillText(data.city||'—',56,82);
  ctx.fillStyle='rgba(255,255,255,0.62)';ctx.font='33px "Arial",sans-serif';
  ctx.fillText('👣 '+(data.distance||0).toFixed(2)+' km   ⏱ '+(data.duration||'—'),56,140);
  var dateStr=data.createdAt&&data.createdAt.seconds?new Date(data.createdAt.seconds*1000).toLocaleDateString(
    window._lang==='en'?'en-US':'zh-TW',{month:'2-digit',day:'2-digit'}):'';
  ctx.fillStyle='rgba(255,255,255,0.38)';ctx.font='28px "Arial",sans-serif';ctx.textAlign='right';
  ctx.fillText(dateStr,W-56,82);ctx.textAlign='left';
  var pts=window._shareCardPts||[];
  ctx.fillStyle='#E8E8E8';ctx.fillRect(0,MAP_Y,W,MAP_H);
  if(pts.length>1){
    var lats=pts.map(function(p){return p.lat;}),lngs=pts.map(function(p){return p.lng;});
    var cLat=(Math.max.apply(null,lats)+Math.min.apply(null,lats))/2;
    var cLng=(Math.max.apply(null,lngs)+Math.min.apply(null,lngs))/2;
    var zoom=_calcBestZoom(pts,W,MAP_H,80);
    var MAPS_KEY='AIzaSyD-7BNyEDGdFlK_-gyFlAN86r0ECjO3z40';
    var styleParams=['style=feature:all|element:geometry|saturation:-100|lightness:8','style=feature:all|element:labels|visibility:off','style=feature:road|element:geometry|lightness:55','style=feature:water|element:geometry|lightness:-15','style=feature:poi|visibility:off','style=feature:transit|visibility:off'].join('&');
    var staticUrl='https://maps.googleapis.com/maps/api/staticmap?center='+cLat+','+cLng+'&zoom='+zoom+'&size=540x450&scale=2&maptype=roadmap&'+styleParams+'&key='+MAPS_KEY;
    try{
      var mapImg=await new Promise(function(resolve,reject){var img=new Image();img.crossOrigin='anonymous';img.onload=function(){resolve(img);};img.onerror=function(e){reject(e);};img.src=staticUrl;});
      ctx.drawImage(mapImg,0,MAP_Y,W,MAP_H);
      ctx.beginPath();pts.forEach(function(p,i){var px=_latLngToImgPx(p.lat,p.lng,cLat,cLng,zoom,W,MAP_H);px.y+=MAP_Y;i===0?ctx.moveTo(px.x,px.y):ctx.lineTo(px.x,px.y);});
      ctx.strokeStyle=GREEN;ctx.lineWidth=10;ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=0.92;ctx.stroke();ctx.globalAlpha=1;
      var sp=_latLngToImgPx(pts[0].lat,pts[0].lng,cLat,cLng,zoom,W,MAP_H);sp.y+=MAP_Y;
      ctx.beginPath();ctx.arc(sp.x,sp.y,16,0,Math.PI*2);ctx.fillStyle=WHITE;ctx.fill();ctx.strokeStyle=GREEN;ctx.lineWidth=5;ctx.stroke();
      var ep=_latLngToImgPx(pts[pts.length-1].lat,pts[pts.length-1].lng,cLat,cLng,zoom,W,MAP_H);ep.y+=MAP_Y;
      ctx.beginPath();ctx.arc(ep.x,ep.y,16,0,Math.PI*2);ctx.fillStyle=GREEN;ctx.fill();
      if(data.events){ctx.font='34px serif';ctx.textAlign='center';data.events.forEach(function(ev){if(!ev.pos)return;var ip=_latLngToImgPx(ev.pos.lat,ev.pos.lng,cLat,cLng,zoom,W,MAP_H);ip.y+=MAP_Y;ctx.fillText(ev.icon||'📍',ip.x,ip.y-10);});ctx.textAlign='left';}
    }catch(corsErr){_drawAbstractRoute(ctx,pts,GREEN,MAP_Y,W,MAP_H,data.events);}
  }else{_drawAbstractRoute(ctx,pts,GREEN,MAP_Y,W,MAP_H,data.events);}
  var grad=ctx.createLinearGradient(0,BOTTOM_Y-80,0,BOTTOM_Y);
  grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,'rgba(0,0,0,0.15)');
  ctx.fillStyle=grad;ctx.fillRect(0,BOTTOM_Y-80,W,80);
  ctx.fillStyle=CREAM;ctx.fillRect(0,BOTTOM_Y,W,BOTTOM_H);
  ctx.strokeStyle='rgba(0,0,0,0.07)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,BOTTOM_Y);ctx.lineTo(W,BOTTOM_Y);ctx.stroke();
  ctx.fillStyle=DARK;ctx.font='bold 52px "Arial",sans-serif';ctx.textAlign='center';
  var rn=data.name||'—';while(ctx.measureText(rn).width>W-100&&rn.length>0)rn=rn.slice(0,-1);
  if(rn!==(data.name||'—'))rn+='...';ctx.fillText(rn,W/2,BOTTOM_Y+84);
  ctx.fillStyle=SOFT;ctx.font='28px "Arial",sans-serif';ctx.fillText('✦  CITY WALKER',W/2,BOTTOM_Y+144);
  if(data.events&&data.events.length>0){
    var chipTxt='📸 '+data.events.length+(window._lang==='en'?' moments':' 個記憶');
    ctx.font='26px "Arial",sans-serif';
    var chipW=ctx.measureText(chipTxt).width+44;var chipX=W/2-chipW/2,chipY2=BOTTOM_Y+170,chipR=23;
    ctx.fillStyle='rgba(143,185,168,0.2)';ctx.beginPath();
    if(ctx.roundRect){ctx.roundRect(chipX,chipY2,chipW,46,chipR);}
    else{ctx.moveTo(chipX+chipR,chipY2);ctx.lineTo(chipX+chipW-chipR,chipY2);ctx.arcTo(chipX+chipW,chipY2,chipX+chipW,chipY2+chipR,chipR);ctx.lineTo(chipX+chipW,chipY2+46-chipR);ctx.arcTo(chipX+chipW,chipY2+46,chipX+chipW-chipR,chipY2+46,chipR);ctx.lineTo(chipX+chipR,chipY2+46);ctx.arcTo(chipX,chipY2+46,chipX,chipY2+46-chipR,chipR);ctx.lineTo(chipX,chipY2+chipR);ctx.arcTo(chipX,chipY2,chipX+chipR,chipY2,chipR);ctx.closePath();}
    ctx.fill();ctx.fillStyle='#5A8A7A';ctx.fillText(chipTxt,W/2,BOTTOM_Y+202);
  }
  var photos=window._shareCardPhotos||[];
  var idx=(typeof photoIndex==='number'&&photoIndex>=0)?photoIndex:0;
  var selectedImg=photos[idx]||null;
  if(selectedImg){
    var photoW=260,photoH=260,photoPad=16;
    var px2=W-60-photoW-photoPad*2,py2=H-90-photoH-photoPad*3;
    var rot=-2.5*Math.PI/180;
    ctx.save();ctx.translate(px2+(photoW+photoPad*2)/2,py2+(photoH+photoPad*3)/2);
    ctx.rotate(rot);ctx.shadowColor='rgba(0,0,0,0.22)';ctx.shadowBlur=18;
    ctx.fillStyle=WHITE;ctx.fillRect(-(photoW/2+photoPad),-(photoH/2+photoPad),photoW+photoPad*2,photoH+photoPad*3);
    ctx.shadowBlur=0;ctx.drawImage(selectedImg,-photoW/2,-(photoH/2+photoPad)+photoPad,photoW,photoH);
    ctx.restore();
  }
  ctx.fillStyle=DARK;ctx.globalAlpha=0.5;ctx.font='26px "Arial",sans-serif';
  ctx.textAlign='center';ctx.fillText(data.name||'',W/2,H-36);ctx.textAlign='left';ctx.globalAlpha=1;
}

function _drawAbstractRoute(ctx,pts,color,mapY,W,mapH,events){
  ctx.fillStyle='#EBEBEB';ctx.fillRect(0,mapY,W,mapH);
  ctx.strokeStyle='rgba(255,255,255,0.55)';ctx.lineWidth=1;
  for(var gx=0;gx<W;gx+=80){ctx.beginPath();ctx.moveTo(gx,mapY);ctx.lineTo(gx,mapY+mapH);ctx.stroke();}
  for(var gy=mapY;gy<mapY+mapH;gy+=80){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}
  if(!pts||pts.length<2)return;
  var lats=pts.map(function(p){return p.lat;}),lngs=pts.map(function(p){return p.lng;});
  var minLat=Math.min.apply(null,lats),maxLat=Math.max.apply(null,lats);
  var minLng=Math.min.apply(null,lngs),maxLng=Math.max.apply(null,lngs);
  var PAD=80,latR=maxLat-minLat||0.001,lngR=maxLng-minLng||0.001;
  var sc=Math.min((W-PAD*2)/lngR,(mapH-PAD*2)/latR)*0.85;
  var offX=PAD+(W-PAD*2-lngR*sc)/2,offY=mapY+PAD+(mapH-PAD*2-latR*sc)/2;
  function tx(lng){return offX+(lng-minLng)*sc;}function ty(lat){return offY+(maxLat-lat)*sc;}
  ctx.beginPath();pts.forEach(function(p,i){i===0?ctx.moveTo(tx(p.lng),ty(p.lat)):ctx.lineTo(tx(p.lng),ty(p.lat));});
  ctx.strokeStyle=color;ctx.lineWidth=10;ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=0.88;ctx.stroke();ctx.globalAlpha=1;
  ctx.beginPath();ctx.arc(tx(pts[0].lng),ty(pts[0].lat),16,0,Math.PI*2);ctx.fillStyle='#FFF';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=5;ctx.stroke();
  var ep=pts[pts.length-1];ctx.beginPath();ctx.arc(tx(ep.lng),ty(ep.lat),16,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
  if(events){ctx.font='34px serif';ctx.textAlign='center';events.forEach(function(ev){if(!ev.pos)return;ctx.fillText(ev.icon||'📍',tx(ev.pos.lng),ty(ev.pos.lat)-10);});ctx.textAlign='left';}
}

/* ===================================================
   switchPage
   =================================================== */
function switchPage(p){
  document.querySelectorAll('.page').forEach(function(page){page.classList.add('hidden');});
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  var tp=document.getElementById('page-'+p),tn=document.getElementById('nav-'+p);
  if(tp)tp.classList.remove('hidden');if(tn)tn.classList.add('active');
  var mc=document.querySelector('.map-controls'),cp=document.getElementById('colorPicker');
  var isInit=!document.getElementById('state-init').classList.contains('hidden');
  if(p==='list'){
    if(mc)mc.style.display='none';if(cp)cp.style.display='none';
    if(window.updateAccountBanner)window.updateAccountBanner();
  } else if(p==='explore'){
    if(mc)mc.style.display='none';if(cp)cp.style.display='none';
    if(document.body.classList.contains('select-mode'))exitSelectMode();
    if(window.fetchExploreRoutes)window.fetchExploreRoutes();
  } else {
    if(document.body.classList.contains('select-mode'))exitSelectMode();
    if(mc)mc.style.display='flex';if(cp)cp.style.display=isInit?'flex':'none';
  }
  if(p==='list')fetchRecords();
}

/* ===================================================
   暴露全域
   =================================================== */
window.openSaveModal      = openSaveModal;
window.executeCloudSave   = executeCloudSave;
window.fetchRecords       = fetchRecords;
window.applyFilters       = applyFilters;
window.clearFilters       = clearFilters;
window.renderCards        = renderCards;
window.onRowMainClick     = onRowMainClick;
window.toggleSelectMode   = toggleSelectMode;
window.exitSelectMode     = exitSelectMode;
window.toggleSelectCard   = toggleSelectCard;
window.batchDelete        = batchDelete;
window.loadSavedRoute     = loadSavedRoute;
window.deleteRecord       = deleteRecord;
window.togglePin          = togglePin;
window.togglePublic       = togglePublic;
window.openShareCard      = openShareCard;
window.cycleSharePhoto    = cycleSharePhoto;
window.closeShareCard     = closeShareCard;
window.downloadShareCard  = downloadShareCard;
window.generateShareCard  = generateShareCard;
window.switchPage         = switchPage;
