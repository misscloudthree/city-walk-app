/* ===================================================
   inspire.js — 靈感規劃系統（Places API、TSP、Routes API）
   City Walker v1.32.0
   =================================================== */

/* ===================================================
   [v1.26.0] 靈感規劃系統（完整版）
   承接 v1.25.0：新增 TSP 排序、Routes API 虛線路徑、
   marker 順序 badge、「以此靈感開始漫遊」按鈕

   全域變數：
   - inspireMarkers：地圖靈感 overlay 陣列
   - _inspirePath：Routes API 虛線 Polyline（清除時一起清）
   - _inspireRouteData：TSP 排序後的地點陣列
     { pos, emoji, name, placeId, order }
   =================================================== */
var MOOD_TAGS = [
  { emoji:'☕', label:'咖啡時光', type:'cafe' },
  { emoji:'🥐', label:'烘焙香氣', type:'bakery' },
  { emoji:'🍜', label:'在地小吃', type:'restaurant' },
  { emoji:'📚', label:'書店尋訪', type:'book_store' },
  { emoji:'🌿', label:'公園綠地', type:'park' },
  { emoji:'🏛️', label:'文化地標', type:'museum' }
];
var INSPIRE_RADIUS_MAP = { 1:250, 2:550, 5:1400, 10:2800 };
var inspireDistance = 2;
var moodCounts = {};
var inspireMarkers = [];
var _inspirePath = null;       /* [v1.26.0] Routes API 虛線 Polyline */
var _inspireRouteData = [];    /* [v1.26.0] TSP 排序後的地點資料 */
/* [v1.29.0] 固定地點 Set（placeId），重新生成時保留 */
var _pinnedInspireIds = new Set();
/* [v1.29.0] 跨次累積排除 Set，clearInspireMarkers 不清除 */
var _usedInspirePlaceIds = new Set();
/* [v1.29.0] 目前顯示的靈感地點資料（含固定狀態），供 reroll 用 */
var _currentInspireSpots = [];
/* [v1.29.0] 開始漫遊後鎖定 tooltip，走路中點 marker 不彈出固定視窗 */
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
      '<span>' + tag.emoji + ' ' + tag.label + '</span>' +
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
  document.getElementById('inspireTotalHint').style.display = total > 8 ? 'block' : 'none';
}

/* PSEUDO: clearInspireMarkers()
   [v1.26.0] 同時清除：
   1. inspireMarkers（所有 OverlayView）
   2. _inspirePath（虛線 Polyline）
   3. _inspireRouteData（TSP 路線陣列）
   4. 隱藏路徑提示列 + 「以此靈感開始漫遊」按鈕 */
function clearInspireMarkers(){
  inspireMarkers.forEach(function(m){ m.setMap(null); });
  inspireMarkers = [];
  if(_inspirePath){ _inspirePath.setMap(null); _inspirePath = null; }
  _inspireRouteData = [];
  _currentInspireSpots = [];
  /* [v1.29.0] 清固定 Set（結束靈感規劃時清）；_usedInspirePlaceIds 不清（累積排除） */
  _pinnedInspireIds = new Set();
  _inspireWalkStarted = false;
  document.getElementById('inspireStartBlock').style.display = 'none';
  document.getElementById('inspireRouteHint').style.display = 'none';
  document.getElementById('btnStartFromInspire').style.display = 'none';
  /* [v1.29.0] 同步隱藏換一組按鈕 */
  document.getElementById('btnRerollInspire').style.display = 'none';
  closeInspireTooltip();
}

/* ===================================================
   [v1.26.0] TSP 貪心算法（Nearest Neighbor）
   PSEUDO:
   1. 起點 = 使用者目前位置
   2. 未訪地點池 = rawSpots（含 pos / emoji / name / placeId）
   3. 每輪：找距當前位置最近的未訪地點，加入路線，移除出池
   4. 重複直到所有地點都被訪問
   5. 回傳排序後的陣列（不含起點）
   =================================================== */
function tspNearestNeighbor(startPos, spots){
  if(!spots || spots.length === 0) return [];
  var remaining = spots.slice();
  var sorted = [];
  var cur = startPos;
  while(remaining.length > 0){
    var bestIdx = 0;
    var bestDist = Infinity;
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

/* PSEUDO: Haversine 公式，回傳兩點間距離（公尺） */
function haversineMeters(lat1, lng1, lat2, lng2){
  var R = 6371000;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
          Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
          Math.sin(dLng/2)*Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* ===================================================
   [v1.26.0] Routes API 虛線路徑
   PSEUDO:
   1. 建 waypoints：起點 → 各靈感地點（TSP 順序）
   2. POST computeRoutes（travelMode: WALK）
   3. 成功 → 解碼 encoded polyline → 畫虛線 Polyline
   4. 失敗（任何原因）→ fallback：直接連各點直線（不提示用戶）
   5. 顯示「預計步行約 X km」提示列
   防呆：API 失敗靜默 fallback，主流程不受影響
   =================================================== */
async function drawInspireRoutePath(startPos, orderedSpots){
  if(_inspirePath){ _inspirePath.setMap(null); _inspirePath = null; }
  if(!orderedSpots || orderedSpots.length === 0) return;

  var ROUTES_KEY = 'AIzaSyD-7BNyEDGdFlK_-gyFlAN86r0ECjO3z40';
  var allPoints = [startPos].concat(orderedSpots.map(function(s){ return s.pos; }));
  var origin = allPoints[0];
  var destination = allPoints[allPoints.length - 1];
  var intermediates = allPoints.slice(1, -1).map(function(p){
    return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
  });

  var requestBody = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode: 'WALK',
    computeAlternativeRoutes: false
  };
  if(intermediates.length > 0) requestBody.intermediates = intermediates;

  var pathPoints = null;
  var distanceKm = null;

  try{
    var res = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes?key=' + ROUTES_KEY,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.distanceMeters'
        },
        body: JSON.stringify(requestBody)
      }
    );
    if(!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if(!data.routes || !data.routes[0]) throw new Error('no routes');
    var route = data.routes[0];
    if(!route.polyline || !route.polyline.encodedPolyline) throw new Error('no polyline');
    pathPoints = decodePolyline(route.polyline.encodedPolyline);
    if(!pathPoints || pathPoints.length === 0) throw new Error('decode failed');
    if(route.distanceMeters) distanceKm = (route.distanceMeters / 1000).toFixed(2);
  }catch(err){
    /* 防呆 fallback：靜默失敗，直線連各點 */
    console.warn('[Routes API] fallback:', err.message);
    pathPoints = allPoints;
  }

  /* 畫虛線 Polyline（strokeOpacity:0 + icons DASHED） */
  var lineSymbol = { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 4 };
  _inspirePath = new google.maps.Polyline({
    map: map,
    path: pathPoints,
    strokeColor: '#8FB9A8',
    strokeOpacity: 0,
    strokeWeight: 4,
    icons: [{ icon: lineSymbol, offset: '0', repeat: '16px' }]
  });

  /* 顯示距離提示列 */
  var hint = document.getElementById('inspireRouteHint');
  if(hint){
    hint.innerText = distanceKm ? '🚶 預計步行約 ' + distanceKm + ' km' : '🚶 建議路線已標示';
    hint.style.display = 'block';
  }
}

/* ===================================================
   [v1.26.0] decodePolyline()
   Google Encoded Polyline Algorithm 解碼
   輸入：encoded string
   輸出：[{lat, lng}, ...] 陣列
   =================================================== */
function decodePolyline(encoded){
  var points = [];
  var index = 0, lat = 0, lng = 0;
  while(index < encoded.length){
    var b, shift = 0, result = 0;
    do{ b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; }while(b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do{ b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; }while(b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/* ===================================================
   [新增 v1.27.1] buildPlaceFreqTable()
   PSEUDO:
   1. 獨立 query Firestore：isPublic==true 的所有路線
   2. 展開每條路線的 events 陣列
   3. 只保留有 placeId 的事件（自由點無法統計）
   4. 建頻率表：{ placeId: { name, pos, icon, placeType, count, lastSeen(ms) } }
      - placeType 優先用 ev.placeType，fallback 用 icon 反查 EMOJI_TO_PLACE_TYPE
   5. 套稀缺評分公式：
      score = count × (1 / log(count + 2)) × e^(-daysSinceLastSeen / 30)
      - 1/log(count+2)：稀缺加成，count 越高加成越低
      - e^(-days/30)：新鮮度衰減，超過 30 天沒新事件分數下降
   6. 回傳陣列，依 score DESC 排序
   注意：失敗時靜默回傳 []，不影響主流程
   =================================================== */
async function buildPlaceFreqTable() {
  try {
    var q = window.api.query(
      window.api.collection(window.db, 'walk_records'),
      window.api.where('isPublic', '==', true)
    );
    var snap = await window.api.getDocs(q);
    var freqMap = {};
    var now = Date.now();

    snap.forEach(function(d) {
      var data = d.data();
      if (!data.events || !Array.isArray(data.events)) return;
      data.events.forEach(function(ev) {
        if (!ev.placeId) return; /* 無 placeId → 跳過，無法統計 */
        if (!ev.pos) return;    /* 無座標 → 跳過，無法顯示 marker */

        /* PSEUDO: 取得 lastSeen 時間戳（ms）
           事件有 createdAt（ISO string）→ parse；否則用路線 createdAt.seconds */
        var lastSeen = now;
        if (ev.createdAt) {
          try { lastSeen = new Date(ev.createdAt).getTime(); } catch(e) {}
        } else if (data.createdAt && data.createdAt.seconds) {
          lastSeen = data.createdAt.seconds * 1000;
        }

        if (freqMap[ev.placeId]) {
          freqMap[ev.placeId].count += 1;
          /* 保留最新的 lastSeen */
          if (lastSeen > freqMap[ev.placeId].lastSeen) {
            freqMap[ev.placeId].lastSeen = lastSeen;
          }
        } else {
          /* PSEUDO: placeType 優先用欄位值，fallback 用 icon 反查映射表 */
          var pt = ev.placeType || EMOJI_TO_PLACE_TYPE[ev.icon] || '';
          freqMap[ev.placeId] = {
            placeId: ev.placeId,
            name: ev.placeName || '',
            pos: ev.pos,
            icon: ev.icon || '📍',
            placeType: pt,
            count: 1,
            lastSeen: lastSeen
          };
        }
      });
    });

    /* PSEUDO: 套稀缺評分公式並轉成陣列
       score = count × (1 / log(count + 2)) × e^(-days / 30) */
    var result = Object.values(freqMap).map(function(entry) {
      var days = (now - entry.lastSeen) / (1000 * 60 * 60 * 24);
      var score = entry.count * (1 / Math.log(entry.count + 2)) * Math.exp(-days / 30);
      return Object.assign({}, entry, { score: score });
    });

    result.sort(function(a, b) { return b.score - a.score; });
    return result;

  } catch(err) {
    console.warn('[buildPlaceFreqTable] 失敗，靜默忽略:', err);
    return [];
  }
}

/* ===================================================
   [v1.26.0] searchInspireSpots() 完整版
   [v1.27.1] 新增 Layer 1 稀缺推薦：
   - 搜尋前先呼叫 buildPlaceFreqTable() 取社群頻率表
   - Layer 1 高分地點插入 rawSpots 前排（只取 type 符合心情的）
   - Places API 補缺口
   - 全局 placeId 去重（Layer 1 已有的，Places 結果跳過）
   =================================================== */
async function searchInspireSpots(){
  var total = Object.values(moodCounts).reduce(function(s,v){ return s+v; }, 0);
  if(total === 0){ alert('請先選擇至少一種心情 ✦'); return; }
  var currentPos = getUserPosition();
  if(!currentPos){ alert('無法取得目前位置，請先允許定位'); return; }

  var searchBtn = document.querySelector('#inspirePanel .btn-event');
  if(searchBtn){ searchBtn.disabled = true; searchBtn.innerText = '搜尋中...'; }
  var radius = INSPIRE_RADIUS_MAP[inspireDistance] || 550;

  try{
    var {Place} = await google.maps.importLibrary('places');
    clearInspireMarkers();
    var rawSpots = [];

    /* ===================================================
       [v1.27.1] Layer 1：稀缺推薦
       PSEUDO:
       1. 取目前選取的心情 type 集合（selectedTypes）
       2. 撈社群頻率表（靜默失敗回 []）
       3. 過濾：placeType 在 selectedTypes 中（或 placeType 空但 icon 符合）
       4. 取 score 最高的前 N 個（N = 各類型 count 總和，但最多 3 個，避免 Layer 1 吃滿）
       5. 推入 rawSpots 前排，並記錄 placeId 到 layer1SeenIds（給去重用）
       =================================================== */
    var selectedTypes = {};
    MOOD_TAGS.forEach(function(tag){
      if((moodCounts[tag.type]||0) > 0) selectedTypes[tag.type] = true;
    });

    var layer1SeenIds = {};
    var freqTable = await buildPlaceFreqTable();

    /* PSEUDO: 過濾符合心情 type 的地點，最多取前 3 個加入 rawSpots
       [v1.29.0] 同時排除 _usedInspirePlaceIds（跨次累積） */
    var layer1Candidates = freqTable.filter(function(entry) {
      if (!entry.placeType) return false;
      if (!selectedTypes[entry.placeType]) return false;
      /* [v1.29.0] 排除已顯示過的地點（除非是固定的） */
      if (_usedInspirePlaceIds.has(entry.placeId) && !_pinnedInspireIds.has(entry.placeId)) return false;
      return true;
    }).slice(0, 3);

    layer1Candidates.forEach(function(entry) {
      rawSpots.push({
        pos: entry.pos,
        emoji: entry.icon,
        name: entry.name,
        placeId: entry.placeId
      });
      layer1SeenIds[entry.placeId] = true;
    });

    /* ===================================================
       Layer 2（原有）：Places API 補缺口
       PSEUDO: 同原本邏輯，但同時收集「全部搜尋結果」到 allPlacesPool
       供 Layer 3 探索槽使用
       =================================================== */
    var allPlacesPool = []; /* [v1.27.2] 收集所有 Places API 結果（含未被選入的） */

    var searchTasks = MOOD_TAGS
      .filter(function(tag){ return (moodCounts[tag.type]||0) > 0; })
      .map(async function(tag){
        var count = moodCounts[tag.type];
        try{
          var result = await Place.searchNearby({
            fields: ['displayName','location','id'],
            locationRestriction: { center: currentPos, radius: radius },
            includedTypes: [tag.type]
          });
          var places = result.places || [];
          /* 前 count 個加入 rawSpots（原本邏輯）
             [v1.29.0] 排除已用過的 placeId（跨次累積）*/
          places.slice(0, count).forEach(function(place){
            if(!place.location) return;
            /* [v1.29.0] 跳過已用過的地點（除非固定） */
            if(place.id && _usedInspirePlaceIds.has(place.id) && !_pinnedInspireIds.has(place.id)) return;
            rawSpots.push({
              pos: { lat: place.location.lat(), lng: place.location.lng() },
              emoji: tag.emoji,
              name: place.displayName || tag.label,
              placeId: place.id || ''
            });
          });
          /* [v1.27.2] count 之後的結果推入備選池，供 Layer 3 用 */
          places.slice(count).forEach(function(place){
            if(!place.location) return;
            allPlacesPool.push({
              pos: { lat: place.location.lat(), lng: place.location.lng() },
              emoji: tag.emoji,
              name: place.displayName || tag.label,
              placeId: place.id || ''
            });
          });
        }catch(err){ console.warn('[Inspire] Places type='+tag.type, err); }
      });

    await Promise.all(searchTasks);
    closeInspireSheet();

    /* [v1.26.1 bugfix + v1.27.1] 全局去重：合併 Layer 1 已有的 id
       PSEUDO: 用 placeId 建 seen map
       - Layer 1 地點已加入 layer1SeenIds，Places API 結果若重複則丟棄
       - 無 placeId 的地點不做去重，直接保留 */
    var _seenPlaceIds = Object.assign({}, layer1SeenIds);
    rawSpots = rawSpots.filter(function(spot){
      if(!spot.placeId) return true;
      if(_seenPlaceIds[spot.placeId] && !layer1SeenIds[spot.placeId]) return false;
      /* PSEUDO: Layer 1 地點本身保留（layer1SeenIds 裡的），Places API 重複的才丟 */
      if(_seenPlaceIds[spot.placeId] && layer1SeenIds[spot.placeId]){
        layer1SeenIds[spot.placeId] = false;
        return true;
      }
      _seenPlaceIds[spot.placeId] = true;
      return true;
    });

    /* ===================================================
       [v1.27.2] Layer 3：探索保留槽
       PSEUDO:
       1. 從 allPlacesPool 過濾掉已在 rawSpots 的 placeId
          （即 _seenPlaceIds 裡有的）
       2. 若有候選 → 隨機挑 1 個加入 rawSpots 尾端
       3. 無候選 → 靜默略過，不影響主流程
       =================================================== */
    var layer3Candidates = allPlacesPool.filter(function(spot){
      if(!spot.placeId) return false;          /* 無 id → 跳過 */
      return !_seenPlaceIds[spot.placeId];     /* 不在已選清單裡 */
    });

    if(layer3Candidates.length > 0){
      var randIdx = Math.floor(Math.random() * layer3Candidates.length);
      var layer3Pick = layer3Candidates[randIdx];
      rawSpots.push(layer3Pick);
    }

    if(rawSpots.length === 0){
      setStatusBar('附近沒有找到符合的地點', 'var(--status-paused)');
      setTimeout(function(){ setStatusBar('City Walker','var(--status-idle)'); }, 3000);
      return;
    }

    /* ① TSP 排序 */
    var orderedSpots = tspNearestNeighbor(currentPos, rawSpots);
    _inspireRouteData = orderedSpots;
    /* [v1.29.0] 儲存目前顯示的地點，供 reroll 用；記錄到累積排除 Set */
    _currentInspireSpots = orderedSpots.slice();
    orderedSpots.forEach(function(spot){
      if(spot.placeId) _usedInspirePlaceIds.add(spot.placeId);
    });

    /* ③ 帶順序 badge 的 marker */
    var bounds = new google.maps.LatLngBounds();
    bounds.extend(new google.maps.LatLng(currentPos.lat, currentPos.lng));
    orderedSpots.forEach(function(spot, idx){
      /* [v1.29.0] 傳入 placeId 給 marker，供固定功能用 */
      var overlay = createInspireMarker(spot.pos, spot.emoji, spot.name, idx + 1, spot.placeId);
      inspireMarkers.push(overlay);
      bounds.extend(new google.maps.LatLng(spot.pos.lat, spot.pos.lng));
    });

    map.fitBounds(bounds, { top:80, right:30, bottom:160, left:30 });
    setStatusBar('✦ 找到 '+inspireMarkers.length+' 個好去處，已規劃路線', 'var(--status-walking)');
    setTimeout(function(){ setStatusBar('City Walker','var(--status-idle)'); }, 5000);

    /* ② Routes API 虛線（不阻塞） */
    drawInspireRoutePath(currentPos, orderedSpots);

    /* ④ 顯示「以此靈感開始漫遊」+ 「🔄 換一組」*/
    /* [v1.32.1] 顯示靈感區塊（含 hint、兩顆按鈕） */
    document.getElementById('inspireStartBlock').style.display = 'block';
    document.getElementById('btnStartFromInspire').style.display = 'block';
    document.getElementById('btnRerollInspire').style.display = 'block';

  }catch(err){
    console.error('[Inspire] 搜尋失敗:', err);
    alert('搜尋失敗，請稍後再試');
  }finally{
    if(searchBtn){ searchBtn.disabled = false; searchBtn.innerText = '✦ 找附近好去處'; }
  }
}

/* ===================================================
   [v1.26.0] startWalkFromInspire()
   PSEUDO:
   1. 隱藏按鈕與提示列
   2. 保留 inspireMarkers 在地圖上（讓使用者邊走邊對照）
   3. 保留 _inspirePath 虛線
   4. 呼叫 startWalk()
   注意：startWalk() 本身不清靈感標記；
   若使用者之後按「開始 City Walk！」正常流程也不清，
   只有 clearInspireMarkers() 才會清（目前無自動呼叫點）
   =================================================== */
function startWalkFromInspire(){
  /* [v1.32.1] 隱藏整個靈感區塊 */
  document.getElementById('inspireStartBlock').style.display = 'none';
  document.getElementById('btnStartFromInspire').style.display = 'none';
  document.getElementById('inspireRouteHint').style.display = 'none';
  document.getElementById('btnRerollInspire').style.display = 'none';
  closeInspireTooltip();
  /* [v1.29.0] 開始漫遊時清掉固定 Set，並鎖定 tooltip（走路中不再彈出） */
  _pinnedInspireIds = new Set();
  _inspireWalkStarted = true;
  /* [v1.26.0 bugfix] 保留 markers + 虛線，讓使用者邊走邊對照
     _inspireRouteData 也保留，未來可做到站打卡功能 */
  startWalk();
}

/* ===================================================
   [v1.29.0] tooltip 系統
   PSEUDO:
   - showInspireTooltip(markerDiv, placeId, name)
     → 在 markerDiv 上插入 tooltip（絕對定位）
     → 顯示地點名稱 + 「📌 固定 / 📌 已固定」按鈕
   - closeInspireTooltip()
     → 移除目前顯示中的 tooltip div
   - 點擊地圖其他地方 → 自動呼叫 closeInspireTooltip()
   =================================================== */
var _currentTooltipEl = null; /* 目前顯示的 tooltip DOM element */

function showInspireTooltip(markerDiv, placeId, name){
  closeInspireTooltip(); /* 先關掉上一個 */
  var tip = document.createElement('div');
  tip.className = 'inspire-tooltip';
  tip.style.cssText = 'opacity:1;white-space:nowrap;';

  if(_inspireWalkStarted){
    /* [v1.29.1] 走路中：只顯示地點名稱，不顯示固定按鈕 */
    tip.innerHTML = '<div style="font-size:12px;">' + (name || '') + '</div>';
    tip.style.pointerEvents = 'none';
  } else {
    /* 規劃中：顯示名稱 + 固定按鈕 */
    var isPinned = placeId && _pinnedInspireIds.has(placeId);
    tip.style.pointerEvents = 'auto';
    tip.innerHTML =
      '<div style="font-size:12px;margin-bottom:4px;">' + (name || '') + '</div>' +
      '<button class="inspire-pin-btn' + (isPinned ? ' pinned' : '') + '" ' +
      'onclick="event.stopPropagation();pinInspireSpot(\'' + (placeId||'') + '\')">' +
      (isPinned ? '📌 已固定' : '📌 固定') + '</button>';
  }

  /* 插入 marker div 作為子元素（讓它跟著 marker 走） */
  markerDiv.appendChild(tip);
  markerDiv.classList.add('show-tip');
  _currentTooltipEl = { tip: tip, markerDiv: markerDiv };
}

function closeInspireTooltip(){
  if(_currentTooltipEl){
    var old = _currentTooltipEl;
    if(old.tip && old.tip.parentNode) old.tip.parentNode.removeChild(old.tip);
    if(old.markerDiv) old.markerDiv.classList.remove('show-tip');
    _currentTooltipEl = null;
  }
}

/* 點地圖空白處關閉 tooltip — 在 initMap() 完成後由 _attachTooltipDismiss() 呼叫 */
function _attachTooltipDismiss(){
  if(window.map){
    window.map.addListener('click', function(){ closeInspireTooltip(); });
  }
}

/* ===================================================
   [v1.29.0] pinInspireSpot(placeId)
   PSEUDO:
   1. 若 placeId 在 _pinnedInspireIds → 取消固定（delete）
   2. 否則 → 加入 _pinnedInspireIds
   3. 更新 inspireMarkers 中對應 marker div 的 class（is-pinned）
   4. 更新 tooltip 內的按鈕文字
   =================================================== */
function pinInspireSpot(placeId){
  if(!placeId) return;
  var wasPinned = _pinnedInspireIds.has(placeId);
  if(wasPinned){
    _pinnedInspireIds.delete(placeId);
  } else {
    _pinnedInspireIds.add(placeId);
  }
  /* 更新 marker div 的 is-pinned class */
  inspireMarkers.forEach(function(m){
    if(m.placeId_ === placeId && m.div_){
      m.div_.classList.toggle('is-pinned', !wasPinned);
    }
  });
  /* 更新 tooltip 按鈕 */
  if(_currentTooltipEl && _currentTooltipEl.tip){
    var btn = _currentTooltipEl.tip.querySelector('.inspire-pin-btn');
    if(btn){
      btn.innerText = wasPinned ? '📌 固定' : '📌 已固定';
      btn.classList.toggle('pinned', !wasPinned);
    }
  }
}

/* ===================================================
   [v1.29.0] rerollInspireSpots()
   PSEUDO:
   1. 取得固定地點資料（從 _currentInspireSpots 過濾）
   2. 清除所有非固定的 inspire markers（OverlayView.setMap(null)）
   3. 清除虛線路徑
   4. 隨機偏移搜尋中心 ±150m（策略 B）
   5. 重新呼叫 searchInspireSpots() 邏輯
      → 固定地點直接放入 rawSpots（不受 _usedInspirePlaceIds 排除）
      → 其餘用 Places API 補缺口（排除 _usedInspirePlaceIds）
   6. 重新 TSP + 畫虛線，序號重新排列
   =================================================== */
async function rerollInspireSpots(){
  var currentPos = getUserPosition();
  if(!currentPos){ alert('無法取得目前位置'); return; }

  var btn = document.getElementById('btnRerollInspire');
  var startBtn = document.getElementById('btnStartFromInspire');
  if(btn){ btn.disabled = true; btn.innerText = '搜尋中...'; }
  if(startBtn) startBtn.style.display = 'none';
  closeInspireTooltip();

  /* ① 取出固定地點資料 */
  var pinnedSpots = _currentInspireSpots.filter(function(spot){
    return spot.placeId && _pinnedInspireIds.has(spot.placeId);
  });
  var pinnedCount = pinnedSpots.length;
  /* 需要補的地點數 = 原本地點總數 - 固定數量 */
  var targetTotal = _currentInspireSpots.length || Object.values(moodCounts).reduce(function(s,v){return s+v;},0);
  var needCount = Math.max(1, targetTotal - pinnedCount);

  /* ② 清除非固定的 markers */
  var keptMarkers = [];
  inspireMarkers.forEach(function(m){
    if(m.placeId_ && _pinnedInspireIds.has(m.placeId_)){
      keptMarkers.push(m);
    } else {
      m.setMap(null);
    }
  });
  inspireMarkers = keptMarkers;

  /* ③ 清虛線 */
  if(_inspirePath){ _inspirePath.setMap(null); _inspirePath = null; }
  _inspireRouteData = [];

  try{
    var {Place} = await google.maps.importLibrary('places');

    /* ④ 隨機偏移搜尋中心 ±150m（策略 B）
       PSEUDO: 在 lat/lng 各加 ±(0~150m 轉換成度數) 的隨機偏移
       150m ≈ 0.00135 度 */
    var OFFSET_DEG = 0.00135;
    var offsetLat = (Math.random() * 2 - 1) * OFFSET_DEG;
    var offsetLng = (Math.random() * 2 - 1) * OFFSET_DEG;
    var searchCenter = { lat: currentPos.lat + offsetLat, lng: currentPos.lng + offsetLng };
    var radius = INSPIRE_RADIUS_MAP[inspireDistance] || 550;

    /* ⑤ 收集新地點（扣掉固定地點的配額）
       PSEUDO: 依各心情 count 按比例補缺口，但總量不超過 needCount */
    var rawSpots = pinnedSpots.slice(); /* 固定地點先放入 */
    var allPlacesPool = [];
    var _seenIds = {};
    pinnedSpots.forEach(function(s){ if(s.placeId) _seenIds[s.placeId] = true; });

    var activeTags = MOOD_TAGS.filter(function(tag){ return (moodCounts[tag.type]||0) > 0; });
    var totalMoodCount = activeTags.reduce(function(s,t){ return s + (moodCounts[t.type]||0); }, 0);

    var searchTasks = activeTags.map(async function(tag){
      /* 按比例分配：該類型佔總數的比例 × needCount，至少 1 個 */
      var quota = Math.max(1, Math.round((moodCounts[tag.type] / totalMoodCount) * needCount));
      try{
        var result = await Place.searchNearby({
          fields: ['displayName','location','id'],
          locationRestriction: { center: searchCenter, radius: radius },
          includedTypes: [tag.type]
        });
        var places = result.places || [];
        places.forEach(function(place){
          if(!place.location || !place.id) return;
          /* 排除已固定地點 + 已用過地點（策略 A） */
          if(_seenIds[place.id]) return;
          if(_usedInspirePlaceIds.has(place.id)) return;
          allPlacesPool.push({
            pos: { lat: place.location.lat(), lng: place.location.lng() },
            emoji: tag.emoji,
            name: place.displayName || tag.label,
            placeId: place.id,
            quota: quota,
            type: tag.type
          });
        });
      }catch(err){ console.warn('[Reroll] Places type='+tag.type, err); }
    });
    await Promise.all(searchTasks);

    /* 按 type 配額從 allPlacesPool 挑地點 */
    var typeQuota = {};
    activeTags.forEach(function(tag){
      typeQuota[tag.type] = Math.max(1, Math.round((moodCounts[tag.type]/totalMoodCount)*needCount));
    });
    var typeFilled = {};
    allPlacesPool.forEach(function(spot){
      var qt = typeQuota[spot.type] || 1;
      var filled = typeFilled[spot.type] || 0;
      if(filled < qt && rawSpots.length < targetTotal){
        rawSpots.push(spot);
        _seenIds[spot.placeId] = true;
        typeFilled[spot.type] = filled + 1;
      }
    });

    if(rawSpots.length === pinnedCount){
      /* 沒有新地點 */
      setStatusBar('沒有更多新地點了，試試調整心情', 'var(--status-paused)');
      setTimeout(function(){ setStatusBar('City Walker','var(--status-idle)'); }, 3000);
      if(btn){ btn.disabled = false; btn.innerText = '🔄 換一組'; }
      if(startBtn) startBtn.style.display = 'block';
      return;
    }

    /* ⑥ 記錄到累積排除 Set */
    rawSpots.forEach(function(spot){
      if(spot.placeId) _usedInspirePlaceIds.add(spot.placeId);
    });
    _currentInspireSpots = rawSpots.slice();

    /* ⑦ TSP + 重建 markers（序號重新排列） */
    var orderedSpots = tspNearestNeighbor(currentPos, rawSpots);
    _inspireRouteData = orderedSpots;

    /* 清掉原本保留的固定 markers（重新建，序號要更新） */
    keptMarkers.forEach(function(m){ m.setMap(null); });
    inspireMarkers = [];

    var bounds = new google.maps.LatLngBounds();
    bounds.extend(new google.maps.LatLng(currentPos.lat, currentPos.lng));
    orderedSpots.forEach(function(spot, idx){
      var overlay = createInspireMarker(spot.pos, spot.emoji, spot.name, idx + 1, spot.placeId);
      inspireMarkers.push(overlay);
      bounds.extend(new google.maps.LatLng(spot.pos.lat, spot.pos.lng));
    });

    map.fitBounds(bounds, { top:80, right:30, bottom:160, left:30 });
    setStatusBar('✦ 換好了！共 '+inspireMarkers.length+' 個去處', 'var(--status-walking)');
    setTimeout(function(){ setStatusBar('City Walker','var(--status-idle)'); }, 4000);

    drawInspireRoutePath(currentPos, orderedSpots);

  }catch(err){
    console.error('[Reroll] 失敗:', err);
    setStatusBar('換一組失敗，請稍後再試', 'var(--status-paused)');
    setTimeout(function(){ setStatusBar('City Walker','var(--status-idle)'); }, 3000);
  }finally{
    if(btn){ btn.disabled = false; btn.innerText = '🔄 換一組'; }
    if(startBtn) startBtn.style.display = 'block';
  }
}

/* ===================================================
   [v1.26.0] createInspireMarker() — 新增 order badge
   [v1.29.0] 新增 placeId 參數；點擊顯示含「📌 固定」按鈕的 tooltip
   PSEUDO:
   - order > 0 → 右上角加 Unicode 圈數字 badge
   - 點擊 marker → showInspireTooltip()（包含固定按鈕）
   - 固定後 badge 變金色（is-pinned class）
   =================================================== */
function createInspireMarker(pos, emoji, name, order, placeId){
  var CIRCLE_NUMS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩',
                     '⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
  function InspireOverlay(position, emoji, name, order, placeId){
    this.position_ = new google.maps.LatLng(position.lat, position.lng);
    this.emoji_ = emoji; this.name_ = name; this.order_ = order || 0;
    this.placeId_ = placeId || '';
    this.div_ = null;
    this.setMap(map);
  }
  InspireOverlay.prototype = Object.create(google.maps.OverlayView.prototype);
  InspireOverlay.prototype.onAdd = function(){
    var div = document.createElement('div');
    div.className = 'inspire-marker-div';
    /* [v1.29.0] 初始固定狀態 */
    if(this.placeId_ && _pinnedInspireIds.has(this.placeId_)){
      div.classList.add('is-pinned');
    }
    div.innerText = this.emoji_;
    /* [v1.26.0] 順序 badge */
    if(this.order_ > 0){
      var badge = document.createElement('div');
      badge.className = 'inspire-order-badge';
      badge.innerText = this.order_ <= 20 ? CIRCLE_NUMS[this.order_-1] : String(this.order_);
      div.appendChild(badge);
    }
    var self = this;
    /* [v1.29.0] 點擊顯示含固定按鈕的 tooltip（取代舊的純文字 tooltip） */
    function onTap(e){
      if(e.preventDefault) e.preventDefault();
      e.stopPropagation();
      showInspireTooltip(div, self.placeId_, self.name_);
    }
    div.addEventListener('click', onTap);
    div.addEventListener('touchstart', onTap, {passive:false});
    this.div_ = div;
    this.getPanes().overlayMouseTarget.appendChild(div);
  };
  InspireOverlay.prototype.draw = function(){
    var pt = this.getProjection().fromLatLngToDivPixel(this.position_);
    if(this.div_ && pt){ this.div_.style.left = pt.x+'px'; this.div_.style.top = pt.y+'px'; }
  };
  InspireOverlay.prototype.onRemove = function(){
    if(this.div_){ this.div_.parentNode.removeChild(this.div_); this.div_ = null; }
  };
  return new InspireOverlay(pos, emoji, name, order, placeId);
}

/* [v1.26.0] 暴露全域 */
window.openInspireSheet=openInspireSheet;
window.closeInspireSheet=closeInspireSheet;
window.selectInspireDistance=selectInspireDistance;
window.searchInspireSpots=searchInspireSpots;
window.clearInspireMarkers=clearInspireMarkers;
window.startWalkFromInspire=startWalkFromInspire;
/* [v1.27.1] */
window.buildPlaceFreqTable=buildPlaceFreqTable;
/* [v1.29.0] */
window.rerollInspireSpots=rerollInspireSpots;
window.pinInspireSpot=pinInspireSpot;
window.showInspireTooltip=showInspireTooltip;
window.closeInspireTooltip=closeInspireTooltip;

/* [inspire.js] 以上為完整靈感規劃系統 */
