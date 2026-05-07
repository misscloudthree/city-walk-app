/* ===================================================
   inspire.js — 靈感規劃系統（Places API、TSP、Routes API）
   City Walker v1.33.0
   =================================================== */

import { t } from './i18n/i18n.js';

var MOOD_TAGS = [
  { emoji:'☕', label:'咖啡時光', labelEn:'Coffee Time',   type:'cafe' },
  { emoji:'🥐', label:'烘焙香氣', labelEn:'Bakery Scents', type:'bakery' },
  { emoji:'🍜', label:'在地小吃', labelEn:'Local Eats',    type:'restaurant' },
  { emoji:'📚', label:'書店尋訪', labelEn:'Bookstores',    type:'book_store' },
  { emoji:'🌿', label:'公園綠地', labelEn:'Parks & Green', type:'park' },
  { emoji:'🏛️', label:'文化地標', labelEn:'Cultural Spots',type:'museum' }
];
/* PSEUDO: 取 mood label 時依語系決定 */
function _moodLabel(tag){ return window._lang==='en'?(tag.labelEn||tag.label):tag.label; }

var INSPIRE_RADIUS_MAP = { 1:250, 2:550, 5:1400, 10:2800 };
var inspireDistance = 2;
var moodCounts = {};
var inspireMarkers = [];
var _inspirePath = null;
var _inspireRouteData = [];
var _pinnedInspireIds = new Set();
var _usedInspirePlaceIds = new Set();
var _currentInspireSpots = [];
var _inspireWalkStarted = false;

function openInspireSheet(){
  moodCounts = {};
  buildMoodTags();
  updateInspireTotalHint();
  document.getElementById('inspireSheet').classList.add('open');
  document.getElementById('inspireBackdrop').classList.add('open');
}
function closeInspireSheet(){
  document.getElementById('inspireSheet').classList.remove('open');
  document.getElementById('inspireBackdrop').classList.remove('open');
}
function buildMoodTags(){
  var container = document.getElementById('moodTags');
  container.innerHTML = '';
  MOOD_TAGS.forEach(function(tag){
    var div = document.createElement('div');
    div.className = 'mood-tag' + ((moodCounts[tag.type]||0) > 0 ? ' active' : '');
    div.setAttribute('data-type', tag.type);
    div.innerHTML =
      '<span>' + tag.emoji + ' ' + _moodLabel(tag) + '</span>' +
      '<span class="mood-badge">' + (moodCounts[tag.type]||0) + '</span>';
    div.onclick = function(){ onMoodTagTap(tag.type); };
    container.appendChild(div);
  });
}
function selectInspireDistance(el){
  document.querySelectorAll('.dist-pill').forEach(function(p){ p.classList.remove('active'); });
  el.classList.add('active');
  inspireDistance = parseInt(el.getAttribute('data-km'));
}
function onMoodTagTap(type){
  var cur = moodCounts[type] || 0;
  cur = cur >= 5 ? 0 : cur + 1;
  moodCounts[type] = cur;
  var tagEl = document.querySelector('.mood-tag[data-type="'+type+'"]');
  if(!tagEl) return;
  tagEl.classList.toggle('active', cur > 0);
  tagEl.querySelector('.mood-badge').innerText = cur;
  updateInspireTotalHint();
}
function updateInspireTotalHint(){
  var total = Object.values(moodCounts).reduce(function(s,v){ return s+v; }, 0);
  var hint = document.getElementById('inspireTotalHint');
  if(hint){
    hint.innerText = t('inspire.tooMany');
    hint.style.display = total > 8 ? 'block' : 'none';
  }
}

function clearInspireMarkers(){
  inspireMarkers.forEach(function(m){ m.setMap(null); });
  inspireMarkers = [];
  if(_inspirePath){ _inspirePath.setMap(null); _inspirePath = null; }
  _inspireRouteData = [];
  _currentInspireSpots = [];
  _pinnedInspireIds = new Set();
  _inspireWalkStarted = false;
  document.getElementById('inspireStartBlock').style.display = 'none';
  document.getElementById('inspireRouteHint').style.display = 'none';
  document.getElementById('btnStartFromInspire').style.display = 'none';
  document.getElementById('btnRerollInspire').style.display = 'none';
  closeInspireTooltip();
}

function tspNearestNeighbor(startPos, spots){
  if(!spots || spots.length === 0) return [];
  var remaining = spots.slice();
  var sorted = [];
  var cur = startPos;
  while(remaining.length > 0){
    var bestIdx = 0, bestDist = Infinity;
    remaining.forEach(function(spot, idx){
      var d = haversineMeters(cur.lat, cur.lng, spot.pos.lat, spot.pos.lng);
      if(d < bestDist){ bestDist = d; bestIdx = idx; }
    });
    sorted.push(remaining[bestIdx]);
    cur = remaining[bestIdx].pos;
    remaining.splice(bestIdx, 1);
  }
  return sorted;
}

function haversineMeters(lat1, lng1, lat2, lng2){
  var R = 6371000;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
          Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
          Math.sin(dLng/2)*Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function drawInspireRoutePath(startPos, orderedSpots){
  if(_inspirePath){ _inspirePath.setMap(null); _inspirePath = null; }
  if(!orderedSpots || orderedSpots.length === 0) return;
  var ROUTES_KEY = 'AIzaSyD-7BNyEDGdFlK_-gyFlAN86r0ECjO3z40';
  var allPoints = [startPos].concat(orderedSpots.map(function(s){ return s.pos; }));
  var origin = allPoints[0], destination = allPoints[allPoints.length - 1];
  var intermediates = allPoints.slice(1, -1).map(function(p){
    return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
  });
  var requestBody = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode: 'WALK', computeAlternativeRoutes: false
  };
  if(intermediates.length > 0) requestBody.intermediates = intermediates;
  var pathPoints = null, distanceKm = null;
  try{
    var res = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes?key=' + ROUTES_KEY,
      { method:'POST', headers:{'Content-Type':'application/json','X-Goog-FieldMask':'routes.polyline.encodedPolyline,routes.distanceMeters'}, body:JSON.stringify(requestBody) }
    );
    if(!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if(!data.routes||!data.routes[0]) throw new Error('no routes');
    var route = data.routes[0];
    if(!route.polyline||!route.polyline.encodedPolyline) throw new Error('no polyline');
    pathPoints = decodePolyline(route.polyline.encodedPolyline);
    if(!pathPoints||pathPoints.length===0) throw new Error('decode failed');
    if(route.distanceMeters) distanceKm = (route.distanceMeters / 1000).toFixed(2);
  }catch(err){console.warn('[Routes API] fallback:', err.message);pathPoints = allPoints;}
  var lineSymbol = { path:'M 0,-1 0,1', strokeOpacity:1, scale:4 };
  _inspirePath = new google.maps.Polyline({
    map: map, path: pathPoints, strokeColor:'#8FB9A8', strokeOpacity:0, strokeWeight:4,
    icons: [{ icon:lineSymbol, offset:'0', repeat:'16px' }]
  });
  var hint = document.getElementById('inspireRouteHint');
  if(hint){
    hint.innerText = distanceKm
      ? t('inspire.routeHintKm',{km:distanceKm})
      : t('inspire.routeHintDefault');
    hint.style.display = 'block';
  }
}

function decodePolyline(encoded){
  var points=[], index=0, lat=0, lng=0;
  while(index<encoded.length){
    var b,shift=0,result=0;
    do{b=encoded.charCodeAt(index++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
    lat+=((result&1)?~(result>>1):(result>>1));
    shift=0;result=0;
    do{b=encoded.charCodeAt(index++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
    lng+=((result&1)?~(result>>1):(result>>1));
    points.push({lat:lat/1e5,lng:lng/1e5});
  }
  return points;
}

async function buildPlaceFreqTable(){
  try{
    var q=window.api.query(window.api.collection(window.db,'walk_records'),window.api.where('isPublic','==',true));
    var snap=await window.api.getDocs(q);
    var freqMap={}, now=Date.now();
    snap.forEach(function(d){
      var data=d.data();
      if(!data.events||!Array.isArray(data.events)) return;
      data.events.forEach(function(ev){
        if(!ev.placeId||!ev.pos) return;
        var lastSeen=now;
        if(ev.createdAt){try{lastSeen=new Date(ev.createdAt).getTime();}catch(e){}}
        else if(data.createdAt&&data.createdAt.seconds){lastSeen=data.createdAt.seconds*1000;}
        if(freqMap[ev.placeId]){
          freqMap[ev.placeId].count+=1;
          if(lastSeen>freqMap[ev.placeId].lastSeen) freqMap[ev.placeId].lastSeen=lastSeen;
        }else{
          var pt=ev.placeType||(window.EMOJI_TO_PLACE_TYPE&&window.EMOJI_TO_PLACE_TYPE[ev.icon])||'';
          freqMap[ev.placeId]={placeId:ev.placeId,name:ev.placeName||'',pos:ev.pos,icon:ev.icon||'📍',placeType:pt,count:1,lastSeen};
        }
      });
    });
    var result=Object.values(freqMap).map(function(entry){
      var days=(now-entry.lastSeen)/(1000*60*60*24);
      var score=entry.count*(1/Math.log(entry.count+2))*Math.exp(-days/30);
      return Object.assign({},entry,{score});
    });
    result.sort(function(a,b){return b.score-a.score;});
    return result;
  }catch(err){console.warn('[buildPlaceFreqTable] 失敗:',err);return [];}
}

async function searchInspireSpots(){
  var total=Object.values(moodCounts).reduce(function(s,v){return s+v;},0);
  if(total===0){alert(t('alert.inspireNeedMood'));return;}
  var currentPos=getUserPosition();
  if(!currentPos){alert(t('alert.inspireNeedGps'));return;}
  var searchBtn=document.querySelector('#inspirePanel .btn-event');
  if(searchBtn){searchBtn.disabled=true;searchBtn.innerText=t('btn.searching');}
  var radius=INSPIRE_RADIUS_MAP[inspireDistance]||550;
  try{
    var {Place}=await google.maps.importLibrary('places');
    clearInspireMarkers();
    var rawSpots=[];
    var selectedTypes={};
    MOOD_TAGS.forEach(function(tag){if((moodCounts[tag.type]||0)>0)selectedTypes[tag.type]=true;});
    var layer1SeenIds={};
    var freqTable=await buildPlaceFreqTable();
    var layer1Candidates=freqTable.filter(function(entry){
      if(!entry.placeType||!selectedTypes[entry.placeType]) return false;
      if(_usedInspirePlaceIds.has(entry.placeId)&&!_pinnedInspireIds.has(entry.placeId)) return false;
      return true;
    }).slice(0,3);
    layer1Candidates.forEach(function(entry){
      rawSpots.push({pos:entry.pos,emoji:entry.icon,name:entry.name,placeId:entry.placeId});
      layer1SeenIds[entry.placeId]=true;
    });
    var allPlacesPool=[];
    var searchTasks=MOOD_TAGS.filter(function(tag){return (moodCounts[tag.type]||0)>0;}).map(async function(tag){
      var count=moodCounts[tag.type];
      try{
        var result=await Place.searchNearby({fields:['displayName','location','id'],locationRestriction:{center:currentPos,radius},includedTypes:[tag.type]});
        var places=result.places||[];
        places.slice(0,count).forEach(function(place){
          if(!place.location) return;
          if(place.id&&_usedInspirePlaceIds.has(place.id)&&!_pinnedInspireIds.has(place.id)) return;
          rawSpots.push({pos:{lat:place.location.lat(),lng:place.location.lng()},emoji:tag.emoji,name:place.displayName||_moodLabel(tag),placeId:place.id||''});
        });
        places.slice(count).forEach(function(place){
          if(!place.location) return;
          allPlacesPool.push({pos:{lat:place.location.lat(),lng:place.location.lng()},emoji:tag.emoji,name:place.displayName||_moodLabel(tag),placeId:place.id||''});
        });
      }catch(err){console.warn('[Inspire] Places type='+tag.type,err);}
    });
    await Promise.all(searchTasks);
    closeInspireSheet();
    var _seenPlaceIds=Object.assign({},layer1SeenIds);
    rawSpots=rawSpots.filter(function(spot){
      if(!spot.placeId) return true;
      if(_seenPlaceIds[spot.placeId]&&!layer1SeenIds[spot.placeId]) return false;
      if(_seenPlaceIds[spot.placeId]&&layer1SeenIds[spot.placeId]){layer1SeenIds[spot.placeId]=false;return true;}
      _seenPlaceIds[spot.placeId]=true;return true;
    });
    var layer3Candidates=allPlacesPool.filter(function(spot){if(!spot.placeId)return false;return!_seenPlaceIds[spot.placeId];});
    if(layer3Candidates.length>0){rawSpots.push(layer3Candidates[Math.floor(Math.random()*layer3Candidates.length)]);}
    if(rawSpots.length===0){
      window.setStatusBar(t('status.inspireNone'),'var(--status-paused)');
      setTimeout(function(){window.setStatusBar(t('status.appName'),'var(--status-idle)');},3000);
      return;
    }
    var orderedSpots=tspNearestNeighbor(currentPos,rawSpots);
    _inspireRouteData=orderedSpots;
    _currentInspireSpots=orderedSpots.slice();
    orderedSpots.forEach(function(spot){if(spot.placeId)_usedInspirePlaceIds.add(spot.placeId);});
    var bounds=new google.maps.LatLngBounds();
    bounds.extend(new google.maps.LatLng(currentPos.lat,currentPos.lng));
    orderedSpots.forEach(function(spot,idx){
      var overlay=createInspireMarker(spot.pos,spot.emoji,spot.name,idx+1,spot.placeId);
      inspireMarkers.push(overlay);
      bounds.extend(new google.maps.LatLng(spot.pos.lat,spot.pos.lng));
    });
    map.fitBounds(bounds,{top:80,right:30,bottom:160,left:30});
    window.setStatusBar(t('status.inspireFound',{n:inspireMarkers.length}),'var(--status-walking)');
    setTimeout(function(){window.setStatusBar(t('status.appName'),'var(--status-idle)');},5000);
    drawInspireRoutePath(currentPos,orderedSpots);
    document.getElementById('inspireStartBlock').style.display='block';
    document.getElementById('btnStartFromInspire').style.display='block';
    document.getElementById('btnRerollInspire').style.display='block';
  }catch(err){
    console.error('[Inspire] 搜尋失敗:',err);
    alert(t('alert.inspireFail'));
  }finally{
    if(searchBtn){searchBtn.disabled=false;searchBtn.innerText=t('btn.searchInspire');}
  }
}

function startWalkFromInspire(){
  document.getElementById('inspireStartBlock').style.display='none';
  document.getElementById('btnStartFromInspire').style.display='none';
  document.getElementById('inspireRouteHint').style.display='none';
  document.getElementById('btnRerollInspire').style.display='none';
  closeInspireTooltip();
  _pinnedInspireIds=new Set();
  _inspireWalkStarted=true;
  startWalk();
}

var _currentTooltipEl=null;
function showInspireTooltip(markerDiv,placeId,name){
  closeInspireTooltip();
  var tip=document.createElement('div');
  tip.className='inspire-tooltip';
  tip.style.cssText='opacity:1;white-space:nowrap;';
  if(_inspireWalkStarted){
    tip.innerHTML='<div style="font-size:12px;">'+(name||'')+'</div>';
    tip.style.pointerEvents='none';
  }else{
    var isPinned=placeId&&_pinnedInspireIds.has(placeId);
    tip.style.pointerEvents='auto';
    tip.innerHTML=
      '<div style="font-size:12px;margin-bottom:4px;">'+(name||'')+'</div>'+
      '<button class="inspire-pin-btn'+(isPinned?' pinned':'')+'" '+
      'onclick="event.stopPropagation();pinInspireSpot(\''+(placeId||'')+'\')">' +
      (isPinned?t('btn.pinnedSpot'):t('btn.pinSpot'))+'</button>';
  }
  markerDiv.appendChild(tip);
  markerDiv.classList.add('show-tip');
  _currentTooltipEl={tip,markerDiv};
}
function closeInspireTooltip(){
  if(_currentTooltipEl){
    var old=_currentTooltipEl;
    if(old.tip&&old.tip.parentNode) old.tip.parentNode.removeChild(old.tip);
    if(old.markerDiv) old.markerDiv.classList.remove('show-tip');
    _currentTooltipEl=null;
  }
}
function _attachTooltipDismiss(){
  if(window.map) window.map.addListener('click',function(){closeInspireTooltip();});
}

function pinInspireSpot(placeId){
  if(!placeId) return;
  var wasPinned=_pinnedInspireIds.has(placeId);
  if(wasPinned){_pinnedInspireIds.delete(placeId);}else{_pinnedInspireIds.add(placeId);}
  inspireMarkers.forEach(function(m){
    if(m.placeId_===placeId&&m.div_) m.div_.classList.toggle('is-pinned',!wasPinned);
  });
  if(_currentTooltipEl&&_currentTooltipEl.tip){
    var btn=_currentTooltipEl.tip.querySelector('.inspire-pin-btn');
    if(btn){
      btn.innerText=wasPinned?t('btn.pinSpot'):t('btn.pinnedSpot');
      btn.classList.toggle('pinned',!wasPinned);
    }
  }
}

async function rerollInspireSpots(){
  var currentPos=getUserPosition();
  if(!currentPos){alert(t('alert.rerollNeedGps'));return;}
  var btn=document.getElementById('btnRerollInspire');
  var startBtn=document.getElementById('btnStartFromInspire');
  if(btn){btn.disabled=true;btn.innerText=t('btn.rerolling');}
  if(startBtn) startBtn.style.display='none';
  closeInspireTooltip();
  var pinnedSpots=_currentInspireSpots.filter(function(spot){return spot.placeId&&_pinnedInspireIds.has(spot.placeId);});
  var targetTotal=_currentInspireSpots.length||Object.values(moodCounts).reduce(function(s,v){return s+v;},0);
  var needCount=Math.max(1,targetTotal-pinnedSpots.length);
  var keptMarkers=[];
  inspireMarkers.forEach(function(m){
    if(m.placeId_&&_pinnedInspireIds.has(m.placeId_)){keptMarkers.push(m);}else{m.setMap(null);}
  });
  inspireMarkers=keptMarkers;
  if(_inspirePath){_inspirePath.setMap(null);_inspirePath=null;}
  _inspireRouteData=[];
  try{
    var {Place}=await google.maps.importLibrary('places');
    var OFFSET_DEG=0.00135;
    var searchCenter={lat:currentPos.lat+(Math.random()*2-1)*OFFSET_DEG,lng:currentPos.lng+(Math.random()*2-1)*OFFSET_DEG};
    var radius=INSPIRE_RADIUS_MAP[inspireDistance]||550;
    var rawSpots=pinnedSpots.slice();
    var allPlacesPool=[];
    var _seenIds={};
    pinnedSpots.forEach(function(s){if(s.placeId)_seenIds[s.placeId]=true;});
    var activeTags=MOOD_TAGS.filter(function(tag){return (moodCounts[tag.type]||0)>0;});
    var totalMoodCount=activeTags.reduce(function(s,tg){return s+(moodCounts[tg.type]||0);},0);
    var searchTasks=activeTags.map(async function(tag){
      var quota=Math.max(1,Math.round((moodCounts[tag.type]/totalMoodCount)*needCount));
      try{
        var result=await Place.searchNearby({fields:['displayName','location','id'],locationRestriction:{center:searchCenter,radius},includedTypes:[tag.type]});
        (result.places||[]).forEach(function(place){
          if(!place.location||!place.id) return;
          if(_seenIds[place.id]||_usedInspirePlaceIds.has(place.id)) return;
          allPlacesPool.push({pos:{lat:place.location.lat(),lng:place.location.lng()},emoji:tag.emoji,name:place.displayName||_moodLabel(tag),placeId:place.id,quota,type:tag.type});
        });
      }catch(err){console.warn('[Reroll] Places type='+tag.type,err);}
    });
    await Promise.all(searchTasks);
    var typeQuota={},typeFilled={};
    activeTags.forEach(function(tag){typeQuota[tag.type]=Math.max(1,Math.round((moodCounts[tag.type]/totalMoodCount)*needCount));});
    allPlacesPool.forEach(function(spot){
      var qt=typeQuota[spot.type]||1,filled=typeFilled[spot.type]||0;
      if(filled<qt&&rawSpots.length<targetTotal){rawSpots.push(spot);_seenIds[spot.placeId]=true;typeFilled[spot.type]=filled+1;}
    });
    if(rawSpots.length===pinnedSpots.length){
      window.setStatusBar(t('status.inspireNoMore'),'var(--status-paused)');
      setTimeout(function(){window.setStatusBar(t('status.appName'),'var(--status-idle)');},3000);
      if(btn){btn.disabled=false;btn.innerText=t('btn.reroll');}
      if(startBtn) startBtn.style.display='block';
      return;
    }
    rawSpots.forEach(function(spot){if(spot.placeId)_usedInspirePlaceIds.add(spot.placeId);});
    _currentInspireSpots=rawSpots.slice();
    var orderedSpots=tspNearestNeighbor(currentPos,rawSpots);
    _inspireRouteData=orderedSpots;
    keptMarkers.forEach(function(m){m.setMap(null);});
    inspireMarkers=[];
    var bounds=new google.maps.LatLngBounds();
    bounds.extend(new google.maps.LatLng(currentPos.lat,currentPos.lng));
    orderedSpots.forEach(function(spot,idx){
      var overlay=createInspireMarker(spot.pos,spot.emoji,spot.name,idx+1,spot.placeId);
      inspireMarkers.push(overlay);
      bounds.extend(new google.maps.LatLng(spot.pos.lat,spot.pos.lng));
    });
    map.fitBounds(bounds,{top:80,right:30,bottom:160,left:30});
    window.setStatusBar(t('status.inspireRerolled',{n:inspireMarkers.length}),'var(--status-walking)');
    setTimeout(function(){window.setStatusBar(t('status.appName'),'var(--status-idle)');},4000);
    drawInspireRoutePath(currentPos,orderedSpots);
  }catch(err){
    console.error('[Reroll] 失敗:',err);
    window.setStatusBar(t('status.inspireRerollFail'),'var(--status-paused)');
    setTimeout(function(){window.setStatusBar(t('status.appName'),'var(--status-idle)');},3000);
  }finally{
    if(btn){btn.disabled=false;btn.innerText=t('btn.reroll');}
    if(startBtn) startBtn.style.display='block';
  }
}

function createInspireMarker(pos,emoji,name,order,placeId){
  var CIRCLE_NUMS=['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
  function InspireOverlay(position,emoji,name,order,placeId){
    this.position_=new google.maps.LatLng(position.lat,position.lng);
    this.emoji_=emoji;this.name_=name;this.order_=order||0;this.placeId_=placeId||'';
    this.div_=null;this.setMap(map);
  }
  InspireOverlay.prototype=Object.create(google.maps.OverlayView.prototype);
  InspireOverlay.prototype.onAdd=function(){
    var div=document.createElement('div');div.className='inspire-marker-div';
    if(this.placeId_&&_pinnedInspireIds.has(this.placeId_)) div.classList.add('is-pinned');
    div.innerText=this.emoji_;
    if(this.order_>0){
      var badge=document.createElement('div');badge.className='inspire-order-badge';
      badge.innerText=this.order_<=20?CIRCLE_NUMS[this.order_-1]:String(this.order_);
      div.appendChild(badge);
    }
    var self=this;
    function onTap(e){if(e.preventDefault)e.preventDefault();e.stopPropagation();showInspireTooltip(div,self.placeId_,self.name_);}
    div.addEventListener('click',onTap);div.addEventListener('touchstart',onTap,{passive:false});
    this.div_=div;this.getPanes().overlayMouseTarget.appendChild(div);
  };
  InspireOverlay.prototype.draw=function(){
    var pt=this.getProjection().fromLatLngToDivPixel(this.position_);
    if(this.div_&&pt){this.div_.style.left=pt.x+'px';this.div_.style.top=pt.y+'px';}
  };
  InspireOverlay.prototype.onRemove=function(){
    if(this.div_){this.div_.parentNode.removeChild(this.div_);this.div_=null;}
  };
  return new InspireOverlay(pos,emoji,name,order,placeId);
}

/* 語系切換時重建 moodTags 標籤文字 */
document.addEventListener('langchange', function(){
  if(document.getElementById('moodTags').children.length > 0) buildMoodTags();
  updateInspireTotalHint();
  /* 重建 inspire sheet 靜態文字 */
  var sheetTitle = document.querySelector('#inspirePanel > div[style*="font-weight"]');
  /* 靜態部分已由 applyDataI18n 處理 data-i18n，動態部分由此處理 */
});

window.openInspireSheet      = openInspireSheet;
window.closeInspireSheet     = closeInspireSheet;
window.selectInspireDistance = selectInspireDistance;
window.searchInspireSpots    = searchInspireSpots;
window.clearInspireMarkers   = clearInspireMarkers;
window.startWalkFromInspire  = startWalkFromInspire;
window.buildPlaceFreqTable   = buildPlaceFreqTable;
window.rerollInspireSpots    = rerollInspireSpots;
window.pinInspireSpot        = pinInspireSpot;
window.showInspireTooltip    = showInspireTooltip;
window.closeInspireTooltip   = closeInspireTooltip;
window._attachTooltipDismiss = _attachTooltipDismiss;
