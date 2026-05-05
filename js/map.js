/* ===================================================
   map.js — 地圖初始化、GPS、走路核心
   City Walker v1.32.0
   新增：UserWalkOverlay 走路動畫（v1.32.0）
   =================================================== */

var map, userMarker, pathLine, watchId, geocoder;
var walkPath=[], eventsData=[], totalDistance=0;
var startTime, durationStr, cityName='未知城市', selectedIcon='📸';
var historyMarkers=[], locatingTimer=null, selectedTrackColor='#333333';
var rawGpsBuffer=[], ROADS_API_KEY='AIzaSyD-7BNyEDGdFlK_-gyFlAN86r0ECjO3z40';
var pauseWindowPoints=[], pauseWindowStart=null;
var isGpsLost=false, lostTimer=null;

/* 暴露給其他模組使用 */
window.walkPath      = walkPath;
window.eventsData    = eventsData;
window.selectedIcon  = selectedIcon;
window.historyMarkers= historyMarkers;
window.selectedTrackColor = selectedTrackColor;

/* ===================================================
   薄荷綠地圖 Style
   =================================================== */
var MINT_MAP_STYLE = [
  {featureType:'all',elementType:'geometry',stylers:[{color:'#F2F4F0'}]},
  {featureType:'all',elementType:'labels.text.fill',stylers:[{color:'#5A6B63'}]},
  {featureType:'all',elementType:'labels.text.stroke',stylers:[{color:'#FFFFFF'},{weight:2}]},
  {featureType:'administrative',elementType:'geometry.stroke',stylers:[{color:'#C8D8D0'},{weight:1}]},
  {featureType:'administrative.land_parcel',elementType:'labels',stylers:[{visibility:'off'}]},
  {featureType:'landscape.natural',elementType:'geometry',stylers:[{color:'#A8CFBC'}]},
  {featureType:'poi.park',elementType:'geometry.fill',stylers:[{color:'#8FB9A8'}]},
  {featureType:'poi.park',elementType:'labels.text.fill',stylers:[{color:'#4A8070'}]},
  {featureType:'landscape.man_made',elementType:'geometry',stylers:[{color:'#E8ECE6'}]},
  {featureType:'poi',elementType:'geometry',stylers:[{color:'#DDE8E0'}]},
  {featureType:'poi',elementType:'labels',stylers:[{visibility:'simplified'}]},
  {featureType:'poi',elementType:'labels.icon',stylers:[{saturation:-40}]},
  {featureType:'road',elementType:'geometry.fill',stylers:[{color:'#FFFFFF'}]},
  {featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#D4E0D8'},{weight:0.5}]},
  {featureType:'road.highway',elementType:'geometry.fill',stylers:[{color:'#F0F5F0'}]},
  {featureType:'road.highway',elementType:'geometry.stroke',stylers:[{color:'#B8CCBF'},{weight:1}]},
  {featureType:'road.arterial',elementType:'geometry.fill',stylers:[{color:'#FFFFFF'}]},
  {featureType:'road.local',elementType:'geometry.fill',stylers:[{color:'#FAFAFA'}]},
  {featureType:'road',elementType:'labels.text.fill',stylers:[{color:'#6E8C7C'}]},
  {featureType:'road',elementType:'labels.text.stroke',stylers:[{color:'#FFFFFF'},{weight:2}]},
  {featureType:'water',elementType:'geometry.fill',stylers:[{color:'#C4DFF0'}]},
  {featureType:'water',elementType:'labels.text.fill',stylers:[{color:'#6FA8C8'}]},
  {featureType:'transit',elementType:'geometry',stylers:[{color:'#D8E8E0'}]},
  {featureType:'transit.station',elementType:'labels.icon',stylers:[{saturation:-20},{lightness:10}]},
];

/* ===================================================
   initMap — Google Maps 初始化
   =================================================== */
async function initMap(){
  var {Map} = await google.maps.importLibrary('maps');
  var mintStyledMap = new google.maps.StyledMapType(MINT_MAP_STYLE, {name:'CityWalker-Mint'});
  map = new Map(document.getElementById('map'),{
    zoom:17, center:{lat:25.0478,lng:121.5170},
    disableDefaultUI:true,
    mapTypeControlOptions:{mapTypeIds:['roadmap','styled_map']}
  });
  map.mapTypes.set('styled_map', mintStyledMap);
  map.setMapTypeId('styled_map');

  /* ===================================================
     [v1.32.0] UserWalkOverlay — 走路腳步動畫
     PSEUDO: 定義在 initMap 內部，確保 google 物件已載入
     google.maps.OverlayView 在 Maps SDK ready 後才能繼承
     =================================================== */
  function UserWalkOverlay(mapInstance){
    this._pos = null;
    this._div = null;
    this.setMap(mapInstance);
  }
  UserWalkOverlay.prototype = Object.create(google.maps.OverlayView.prototype);
  UserWalkOverlay.prototype.onAdd = function(){
    var div = document.createElement('div');
    div.className = 'user-walk-overlay';
    div.innerHTML = '<span class="foot-l">🦶</span><span class="foot-r">🦶</span>';
    this._div = div;
    this.getPanes().overlayMouseTarget.appendChild(div);
  };
  UserWalkOverlay.prototype.draw = function(){
    if(!this._div || !this._pos) return;
    var pt = this.getProjection().fromLatLngToDivPixel(this._pos);
    if(pt){ this._div.style.left = pt.x+'px'; this._div.style.top = pt.y+'px'; }
  };
  UserWalkOverlay.prototype.onRemove = function(){
    if(this._div && this._div.parentNode) this._div.parentNode.removeChild(this._div);
    this._div = null;
  };
  UserWalkOverlay.prototype.setPosition = function(latlng){
    if(!latlng) return;
    this._pos = (typeof latlng.lat === 'function')
      ? latlng
      : new google.maps.LatLng(latlng.lat, latlng.lng);
    this.draw();
  };
  UserWalkOverlay.prototype.getPosition = function(){ return this._pos; };
  UserWalkOverlay.prototype.startWalkAnim = function(){
    if(this._div){ this._div.classList.add('walking'); this._div.classList.remove('paused'); }
  };
  UserWalkOverlay.prototype.stopWalkAnim = function(mode){
    if(this._div){
      this._div.classList.remove('walking');
      if(mode === 'paused') this._div.classList.add('paused');
      else this._div.classList.remove('paused');
    }
  };

  /* [v1.32.0] 使用 UserWalkOverlay 取代原本 Marker */
  userMarker = new UserWalkOverlay(map);
  window.userMarker = userMarker;

  pathLine = new google.maps.Polyline({
    map, strokeColor:selectedTrackColor,
    strokeWeight:6, strokeOpacity:0.85
  });
  window.pathLine = pathLine;

  geocoder = new google.maps.Geocoder();
  window.geocoder = geocoder;
  window.map = map;

  document.getElementById('colorToggleBtn').style.backgroundColor = selectedTrackColor;

  if(window.buildIconPicker) window.buildIconPicker();

  setStatusBar('📡 取得位置中...','var(--status-locating)');
  navigator.geolocation.getCurrentPosition(
    function(pos){
      var p={lat:pos.coords.latitude,lng:pos.coords.longitude};
      map.setCenter(p); userMarker.setPosition(p);
      setStatusBar('City Walker','var(--status-idle)');
    },
    function(){ setStatusBar('City Walker','var(--status-idle)'); },
    {enableHighAccuracy:true,timeout:10000,maximumAge:0}
  );

  window._authReadyCallback = function(){};
  if(window.currentUid) window._authReadyCallback();

  /* tooltip dismiss（靈感規劃用） */
  if(window._attachTooltipDismiss) window._attachTooltipDismiss();

  /* 解鎖地標（走路頁初始化後載入） */
  if(window.loadUnlockedLandmarks) window.loadUnlockedLandmarks();

  /* 探索頁 swipe 初始化 */
  if(window._initExploreSwipe) window._initExploreSwipe();
}

/* ===================================================
   工具函式
   =================================================== */
function getUserPosition(){
  var pos = userMarker && userMarker.getPosition();
  if(!pos) return null;
  if(typeof pos.lat === 'function') return {lat:pos.lat(), lng:pos.lng()};
  return {lat:pos.lat, lng:pos.lng};
}

function setStatusBar(t, bg){
  var b = document.getElementById('statusBar');
  b.innerText = t;
  b.style.backgroundColor = bg || 'var(--status-idle)';
}

function focusOnMe(){
  navigator.geolocation.getCurrentPosition(
    function(pos){
      var p={lat:pos.coords.latitude,lng:pos.coords.longitude};
      userMarker.setPosition(p); map.panTo(p);
    },
    function(){ var p=getUserPosition(); if(p) map.panTo(p); },
    {enableHighAccuracy:true,timeout:8000,maximumAge:3000}
  );
}

function focusOnRouteStart(){
  var p = pathLine.getPath().getArray();
  if(p.length > 0) map.panTo(p[0]);
}

function toggleColorPicker(){
  document.getElementById('colorOptions').classList.toggle('open');
}

function selectColor(el){
  selectedTrackColor = el.getAttribute('data-color');
  window.selectedTrackColor = selectedTrackColor;
  document.getElementById('colorToggleBtn').style.backgroundColor = selectedTrackColor;
  document.querySelectorAll('.color-dot').forEach(function(d){d.classList.remove('selected');});
  el.classList.add('selected');
  if(pathLine) pathLine.setOptions({strokeColor:selectedTrackColor});
  document.getElementById('colorOptions').classList.remove('open');
}

document.addEventListener('click', function(e){
  var p = document.getElementById('colorPicker');
  if(p && !p.contains(e.target)) document.getElementById('colorOptions').classList.remove('open');
});

/* ===================================================
   Snap to Roads
   =================================================== */
async function snapToRoads(points){
  if(!points || points.length === 0) return;
  var pathStr = points.map(function(p){return p.lat+','+p.lng;}).join('|');
  try{
    var res = await fetch('https://roads.googleapis.com/v1/snapToRoads?path='+encodeURIComponent(pathStr)+'&interpolate=true&key='+ROADS_API_KEY);
    var data = await res.json();
    if(data.snappedPoints && data.snappedPoints.length > 0){
      data.snappedPoints.forEach(function(sp){
        walkPath.push({lat:sp.location.latitude,lng:sp.location.longitude});
      });
      pathLine.setPath(walkPath);
      var last = walkPath[walkPath.length-1];
      userMarker.setPosition(last); map.panTo(last);
    }
  }catch(err){
    console.warn('[Roads API]', err);
    points.forEach(function(p){walkPath.push(p);});
    pathLine.setPath(walkPath);
  }
}

async function flushRawBuffer(){
  if(rawGpsBuffer.length > 0){
    var r = rawGpsBuffer.slice(); rawGpsBuffer = [];
    await snapToRoads(r);
  }
}

/* ===================================================
   startWalk / endWalk
   =================================================== */
function startWalk(){
  startTime = new Date();
  document.getElementById('state-init').classList.add('hidden');
  document.getElementById('state-recording').classList.remove('hidden');
  setStatusBar('📡 取得定位狀態中','var(--status-locating)');
  document.getElementById('colorPicker').style.display = 'none';
  pathLine.setOptions({strokeColor:selectedTrackColor, strokeOpacity:0.85});
  pauseWindowPoints = []; pauseWindowStart = new Date();

  locatingTimer = setTimeout(function(){
    navigator.geolocation.clearWatch(watchId);
    setStatusBar('⚠️ 定位失敗','var(--status-ended)');
    document.getElementById('state-recording').classList.add('hidden');
    document.getElementById('state-finished').classList.remove('hidden');
    document.getElementById('summaryBox').innerHTML='<div style="text-align:center;color:var(--text-soft);padding:10px;">📡 請確認定位狀態後重新開始</div>';
  }, 60000);

  /* [v1.23.0] GPS 中斷恢復 */
  function _startWatching(){
    watchId = navigator.geolocation.watchPosition(function(pos){
      var newPoint = {lat:pos.coords.latitude, lng:pos.coords.longitude};
      if(pos.coords.accuracy > 40) return;

      /* GPS 恢復 */
      if(isGpsLost){
        isGpsLost = false;
        if(lostTimer){clearTimeout(lostTimer);lostTimer=null;}
        rawGpsBuffer = [];
        document.getElementById('btnResumeWalk').classList.add('hidden');
      }

      var lastRaw = rawGpsBuffer.length>0 ? rawGpsBuffer[rawGpsBuffer.length-1]
                  : (walkPath.length>0 ? walkPath[walkPath.length-1] : null);
      if(lastRaw){
        var dist = google.maps.geometry.spherical.computeDistanceBetween(
          new google.maps.LatLng(lastRaw.lat,lastRaw.lng),
          new google.maps.LatLng(newPoint.lat,newPoint.lng)
        );
        if(dist < 3 || dist > 80) return;
      }

      if(locatingTimer){clearTimeout(locatingTimer);locatingTimer=null;}
      rawGpsBuffer.push(newPoint); userMarker.setPosition(newPoint);
      if(rawGpsBuffer.length >= 5){
        var batch = rawGpsBuffer.slice(); rawGpsBuffer = [];
        snapToRoads(batch);
      }

      var now = new Date();
      pauseWindowPoints.push({point:newPoint, time:now});
      pauseWindowPoints = pauseWindowPoints.filter(function(item){return (now-item.time)<=15000;});

      var windowDist = 0;
      if(pauseWindowPoints.length >= 2){
        var first = pauseWindowPoints[0].point;
        var last  = pauseWindowPoints[pauseWindowPoints.length-1].point;
        windowDist = google.maps.geometry.spherical.computeDistanceBetween(
          new google.maps.LatLng(first.lat,first.lng),
          new google.maps.LatLng(last.lat,last.lng)
        );
      }

      var currentKm = walkPath.length>1
        ? google.maps.geometry.spherical.computeLength(pathLine.getPath())/1000 : 0;

      /* [v1.32.0] 依走路/暫停狀態切換腳步動畫 */
      if(windowDist > 7){
        setStatusBar('🚶 漫步中・'+currentKm.toFixed(2)+' km','var(--status-walking)');
        userMarker.startWalkAnim();
        pauseWindowPoints = [{point:newPoint,time:now}]; pauseWindowStart = now;
      } else if((now-pauseWindowStart) >= 15000){
        setStatusBar('☕ 暫停一下...','var(--status-paused)');
        userMarker.stopWalkAnim('paused');
      } else if(currentKm > 0){
        setStatusBar('🚶 漫步中・'+currentKm.toFixed(2)+' km','var(--status-walking)');
        userMarker.startWalkAnim();
      }

    }, function(err){
      console.error('[GPS]', err);
      setStatusBar('📡 取得定位狀態中','var(--status-locating)');
      /* [v1.23.0] GPS 中斷處理 */
      if(!isGpsLost){
        isGpsLost = true;
        lostTimer = setTimeout(function(){
          navigator.geolocation.clearWatch(watchId);
          setStatusBar('📡 定位中斷，點「繼續記錄」恢復','var(--status-paused)');
          document.getElementById('btnResumeWalk').classList.remove('hidden');
        }, 180000);
      }
    }, {enableHighAccuracy:true, maximumAge:0, timeout:10000});
  }

  _startWatching();
  /* [v1.23.0] 恢復監聽函式，供「繼續記錄」按鈕呼叫 */
  window._resumeWatching = function(){
    isGpsLost = false;
    if(lostTimer){clearTimeout(lostTimer);lostTimer=null;}
    document.getElementById('btnResumeWalk').classList.add('hidden');
    setStatusBar('📡 重新取得定位...','var(--status-locating)');
    _startWatching();
  };
}

async function endWalk(){
  navigator.geolocation.clearWatch(watchId);
  if(locatingTimer){clearTimeout(locatingTimer);locatingTimer=null;}
  if(lostTimer){clearTimeout(lostTimer);lostTimer=null;}
  isGpsLost = false;
  document.getElementById('btnResumeWalk').classList.add('hidden');
  setStatusBar('✅ 漫遊結束','var(--status-ended)');
  /* [v1.32.0] 結束時停止動畫 */
  userMarker.stopWalkAnim('idle');
  document.getElementById('state-recording').classList.add('hidden');
  document.getElementById('state-finished').classList.remove('hidden');
  document.getElementById('encourageBox').innerText = '「'+getDailyEncouragement()+'」';
  await flushRawBuffer();
  totalDistance = walkPath.length>1
    ? google.maps.geometry.spherical.computeLength(pathLine.getPath())/1000 : 0;
  window.totalDistance = totalDistance;
  durationStr = Math.floor(Math.abs(new Date()-startTime)/60000)+' 分鐘';
  window.durationStr = durationStr;

  if(walkPath.length > 0){
    geocoder.geocode({location:walkPath[walkPath.length-1]}, function(results,status){
      if(status==='OK' && results[0]){
        var cityObj = results[0].address_components.find(function(c){
          return c.types.includes('administrative_area_level_1')||c.types.includes('locality');
        });
        cityName = cityObj ? cityObj.long_name : '未知城市';
        window.cityName = cityName;
        var seenPlaces={}, placeNames=[];
        eventsData.forEach(function(ev){
          if(ev.placeName && !seenPlaces[ev.placeName]){
            seenPlaces[ev.placeName]=true;
            var s=ev.placeName.length>10?ev.placeName.slice(0,10)+'...':ev.placeName;
            placeNames.push(s);
          }
        });
        var placeLine = placeNames.length>0 ? '<br>📍 停留地標：'+placeNames.join(' / '):'';
        document.getElementById('summaryBox').innerHTML=
          '<strong>漫遊結算</strong><br>🏙️ 城市：'+cityName+
          '<br>👣 里程：'+totalDistance.toFixed(2)+' KM'+
          '<br>⏱️ 時長：'+durationStr+
          '<br>📸 事件：'+eventsData.length+' 個'+placeLine;
      }
    });
  }
}

function clearLoadedRoute(){
  pathLine.setPath([]);
  pathLine.setOptions({strokeColor:selectedTrackColor,strokeOpacity:0.85,strokeWeight:6});
  historyMarkers.forEach(function(m){m.setMap(null);});
  historyMarkers.length = 0;
  window._loadedRouteId = ''; window._loadedRouteEvents = [];
  document.getElementById('btnFocusRouteWrap').classList.add('hidden');
}

/* 激勵語句 */
var ENCOURAGE_LIST=[
  '每一步都是在和這座城市說你好。','你走過的路，都成為了你的一部分。',
  '不趕時間的移動，才看得見風景。','今天的漫遊，是送給未來的你的禮物。',
  '走路是最誠實的旅行方式。','迷路也是一種探索。',
  '城市的故事，藏在你停下來的每個瞬間。','腳步慢下來，世界就大了起來。',
  '你不是在趕路，你是在收集記憶。','走著走著，就找到了答案。',
  '每條路都值得被好好走過。','今天的你，多認識了一點這座城市。',
  '散步是一種溫柔的勇氣。','你的足跡，是這座城市最好的地圖。',
  '好好走路，是對自己最好的陪伴。','慢慢走，什麼都會來的。',
  '城市不大，只要你願意用腳丈量。','今天走過的路，明天會變成想念。',
  '每次 City Walk，都是一次小小的冒險。','謝謝你今天也好好走路了。'
];
function getDailyEncouragement(){
  var t=new Date();
  var s=t.getFullYear()*10000+(t.getMonth()+1)*100+t.getDate();
  return ENCOURAGE_LIST[s%ENCOURAGE_LIST.length];
}

/* ===================================================
   暴露全域
   =================================================== */
window.initMap          = initMap;
window.getUserPosition  = getUserPosition;
window.setStatusBar     = setStatusBar;
window.focusOnMe        = focusOnMe;
window.focusOnRouteStart= focusOnRouteStart;
window.toggleColorPicker= toggleColorPicker;
window.selectColor      = selectColor;
window.startWalk        = startWalk;
window.endWalk          = endWalk;
window.clearLoadedRoute = clearLoadedRoute;
window.flushRawBuffer   = flushRawBuffer;
window.getDailyEncouragement = getDailyEncouragement;

/* ===================================================
   PSEUDO: 自動初始化
   - type="module" 是 defer，保證 HTML 解析完才執行
   - Maps SDK 也是 defer，但誰先誰後不確定
   - 用 polling 每 100ms 檢查 google 是否就緒
   - 最多等 10 秒，避免無限等待
   =================================================== */
(function waitForGoogle(){
  var attempts = 0;
  var timer = setInterval(function(){
    attempts++;
    if(window.google && window.google.maps && window.google.maps.Map){
      clearInterval(timer);
      initMap();
    } else if(attempts > 100){
      clearInterval(timer);
      console.error('[map.js] Google Maps 載入逾時');
    }
  }, 100);
})();
