/* ===================================================
   explore.js — 探索頁（全屏卡片、swipe、canvas 繪圖）
   City Walker v1.33.0
   =================================================== */

import { t } from './i18n/i18n.js';

var exploreDistKm=5, _exploreAllDocs=[], _exploreFiltered=[];
var _exploreIndex=0, _explorePtsCache={}, _exploreViews=[], _exploreViewIdx=0;
var _exploreUserPos=null, _exploreSwipeStartY=null, _exploreHintTimer=null;
var _exploreAnimating=false;

function haversineKm(a,b){
  var R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180;
  var lat1=a.lat*Math.PI/180,lat2=b.lat*Math.PI/180;
  var x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function selectExplorePill(el){
  document.querySelectorAll('.explore-pill').forEach(function(p){p.classList.remove('active');});
  el.classList.add('active');
  exploreDistKm=parseInt(el.getAttribute('data-km'));
  _buildFilteredAndShow();
}

async function fetchExploreRoutes(){
  var loading=document.getElementById('exploreLoading');
  var cardWrap=document.getElementById('exploreCardWrap');
  var empty=document.getElementById('exploreEmpty');
  var hint=document.getElementById('exploreNoGpsHint');
  var pillBar=document.getElementById('explorePillBar');
  loading.style.display='block'; cardWrap.style.display='none';
  empty.style.display='none'; hint.style.display='none';
  pillBar.classList.remove('no-gps');

  /* 更新 loading / empty 文字（支援語系切換） */
  loading.innerText = t('explore.loading');
  var emptyTitle = empty.querySelector('div');
  if(emptyTitle) emptyTitle.innerText = t('explore.empty');
  var emptyHint = empty.querySelector('span');
  if(emptyHint) emptyHint.innerText = t('explore.emptyHint');
  document.getElementById('exploreSwipeHint').innerText = t('explore.swipeHint');

  _exploreUserPos=window.getUserPosition?window.getUserPosition():null;
  if(!_exploreUserPos){
    try{
      _exploreUserPos=await new Promise(function(resolve,reject){
        navigator.geolocation.getCurrentPosition(
          function(pos){resolve({lat:pos.coords.latitude,lng:pos.coords.longitude});},
          reject,{enableHighAccuracy:true,timeout:8000,maximumAge:30000}
        );
      });
    }catch(e){_exploreUserPos=null;}
  }
  if(!_exploreUserPos){
    hint.style.display='block';
    hint.innerHTML=t('explore.noGps').replace('\n','<br>');
    pillBar.classList.add('no-gps');
  }
  try{
    var q=window.api.query(window.api.collection(window.db,'walk_records'),window.api.where('isPublic','==',true),window.api.orderBy('createdAt','desc'));
    var snap=await window.api.getDocs(q);
    var uid=window.currentUid||'anonymous';
    _exploreAllDocs=[];
    snap.forEach(function(d){var data=Object.assign({id:d.id},d.data());if(data.userId!==uid)_exploreAllDocs.push(data);});
    for(var i=_exploreAllDocs.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var tmp=_exploreAllDocs[i];_exploreAllDocs[i]=_exploreAllDocs[j];_exploreAllDocs[j]=tmp;}
  }catch(err){console.error('[explore]',err);_exploreAllDocs=[];}
  loading.style.display='none';
  _buildFilteredAndShow();
}

function _buildFilteredAndShow(){
  _exploreFiltered=_exploreAllDocs.filter(function(data){
    if(!_exploreUserPos)return true;
    var sp=data.events&&data.events.length>0?data.events[0].pos:null;
    if(!sp)return true;
    return haversineKm(_exploreUserPos,sp)<=exploreDistKm;
  });
  _exploreIndex=0;_explorePtsCache={};showExploreCard(0);
}

async function showExploreCard(index){
  var empty=document.getElementById('exploreEmpty');
  var cardWrap=document.getElementById('exploreCardWrap');
  if(_exploreFiltered.length===0){cardWrap.style.display='none';empty.style.display='block';return;}
  _exploreIndex=((index%_exploreFiltered.length)+_exploreFiltered.length)%_exploreFiltered.length;
  var data=_exploreFiltered[_exploreIndex];
  empty.style.display='none';cardWrap.style.display='block';
  _exploreViewIdx=0;_showExploreMap();
  document.getElementById('exploreCityLabel').innerText=data.city||'';
  if(_exploreUserPos&&data.events&&data.events.length>0&&data.events[0].pos){
    var d=haversineKm(_exploreUserPos,data.events[0].pos);
    document.getElementById('exploreDistLabel').innerText=
      d<1?t('explore.distM',{m:(d*1000).toFixed(0)}):t('explore.distKm',{km:d.toFixed(1)});
  }else{document.getElementById('exploreDistLabel').innerText='';}
  var seenPlaces={},placeNames=[];
  if(data.events)data.events.forEach(function(ev){if(ev.placeName&&!seenPlaces[ev.placeName]&&placeNames.length<3){seenPlaces[ev.placeName]=true;placeNames.push(ev.placeName);}});
  document.getElementById('exploreCardLandmarks').innerText=placeNames.length>0?'📍 '+placeNames.join('  ·  '):'';
  document.getElementById('exploreCardName').innerText=data.name||'—';
  document.getElementById('exploreCardMeta').innerText='👣 '+(data.distance||0).toFixed(2)+' km'+(data.duration?'   ⏱ '+data.duration:'');
  _exploreViews=[{type:'map'}];
  if(data.events){data.events.forEach(function(ev){
    if(ev.photoUrl){_exploreViews.push({type:'photo',photoUrl:ev.photoUrl,text:ev.text||'',icon:ev.icon||'📝',placeName:ev.placeName||''});}
    else if(ev.text){_exploreViews.push({type:'text',text:ev.text,icon:ev.icon||'📝',placeName:ev.placeName||''});}
  });}
  var pts=_explorePtsCache[data.id]||null;
  if(!pts){
    try{
      var snap=await window.api.getDocs(window.api.collection(window.db,'walk_records',data.id,'path_points'));
      var chunks=[];snap.forEach(function(d){chunks.push(d.data());});
      chunks.sort(function(a,b){return a.index-b.index;});
      pts=[];chunks.forEach(function(c){if(c.points)pts=pts.concat(c.points);});
      _explorePtsCache[data.id]=pts;
    }catch(e){pts=[];}
  }
  _drawExploreMap(data,pts);_prefetchNextExplorePts();
}

async function _drawExploreMap(data,pts){
  var wrap=document.getElementById('exploreCardWrap');
  var canvas=document.getElementById('exploreMapCanvas');
  var W=wrap.offsetWidth||window.innerWidth,H=wrap.offsetHeight||(window.innerHeight-125);
  canvas.width=W;canvas.height=H;
  var ctx=canvas.getContext('2d');
  var GREEN=data.trackColor||'#8FB9A8';
  ctx.fillStyle='#2A2A2A';ctx.fillRect(0,0,W,H);
  if(!pts||pts.length<2){_drawExploreAbstract(ctx,W,H,GREEN);return;}
  var lats=pts.map(function(p){return p.lat;}),lngs=pts.map(function(p){return p.lng;});
  var cLat=(Math.max.apply(null,lats)+Math.min.apply(null,lats))/2;
  var cLng=(Math.max.apply(null,lngs)+Math.min.apply(null,lngs))/2;
  var zoom=_calcBestZoomE(pts,W,H,60);
  var MAPS_KEY='AIzaSyD-7BNyEDGdFlK_-gyFlAN86r0ECjO3z40';
  var reqW=Math.min(640,Math.round(W/2)),reqH=Math.min(640,Math.round(H/2));
  var styleParams=['style=feature:all|element:geometry|saturation:-100|lightness:5','style=feature:all|element:labels|visibility:off','style=feature:road|element:geometry|lightness:45','style=feature:water|element:geometry|lightness:-20','style=feature:poi|visibility:off','style=feature:transit|visibility:off'].join('&');
  var staticUrl='https://maps.googleapis.com/maps/api/staticmap?center='+cLat+','+cLng+'&zoom='+zoom+'&size='+reqW+'x'+reqH+'&scale=2&maptype=roadmap&'+styleParams+'&key='+MAPS_KEY;
  try{
    var mapImg=await new Promise(function(resolve,reject){var img=new Image();img.crossOrigin='anonymous';img.onload=function(){resolve(img);};img.onerror=function(e){reject(e);};img.src=staticUrl;});
    ctx.drawImage(mapImg,0,0,W,H);
  }catch(e){_drawExploreAbstract(ctx,W,H,GREEN);}
  ctx.beginPath();pts.forEach(function(p,i){var px=_latLngToImgPxE(p.lat,p.lng,cLat,cLng,zoom,W,H);i===0?ctx.moveTo(px.x,px.y):ctx.lineTo(px.x,px.y);});
  ctx.strokeStyle=GREEN;ctx.lineWidth=8;ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=0.92;ctx.stroke();ctx.globalAlpha=1;
  var sp=_latLngToImgPxE(pts[0].lat,pts[0].lng,cLat,cLng,zoom,W,H);
  ctx.beginPath();ctx.arc(sp.x,sp.y,12,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=GREEN;ctx.lineWidth=4;ctx.stroke();
  var ep2=_latLngToImgPxE(pts[pts.length-1].lat,pts[pts.length-1].lng,cLat,cLng,zoom,W,H);
  ctx.beginPath();ctx.arc(ep2.x,ep2.y,12,0,Math.PI*2);ctx.fillStyle=GREEN;ctx.fill();
  if(data.events){ctx.font='24px serif';ctx.textAlign='center';data.events.forEach(function(ev){if(!ev.pos)return;var ip=_latLngToImgPxE(ev.pos.lat,ev.pos.lng,cLat,cLng,zoom,W,H);ctx.fillText(ev.icon||'📍',ip.x,ip.y-8);});ctx.textAlign='left';}
}

function _mercXE(lng){return(lng+180)/360;}
function _mercYE(lat){var s=Math.sin(lat*Math.PI/180);return 0.5-Math.log((1+s)/(1-s))/(4*Math.PI);}
function _latLngToImgPxE(lat,lng,cLat,cLng,zoom,imgW,imgH){
  var scale=256*Math.pow(2,zoom);
  return{x:imgW/2+(_mercXE(lng)-_mercXE(cLng))*scale,y:imgH/2+(_mercYE(lat)-_mercYE(cLat))*scale};
}
function _calcBestZoomE(pts,imgW,imgH,pad){
  for(var z=17;z>=1;z--){
    var scale=256*Math.pow(2,z);
    var xs=pts.map(function(p){return _mercXE(p.lng)*scale;});
    var ys=pts.map(function(p){return _mercYE(p.lat)*scale;});
    if(Math.max.apply(null,xs)-Math.min.apply(null,xs)<=imgW-pad*2&&Math.max.apply(null,ys)-Math.min.apply(null,ys)<=imgH-pad*2)return z;
  }return 12;
}
function _drawExploreAbstract(ctx,W,H,color){
  ctx.fillStyle='#333';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,255,255,0.06)';ctx.lineWidth=1;
  for(var x=0;x<W;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(var y=0;y<H;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
}
function _showExploreMap(){
  document.getElementById('explorePhotoWrap').classList.add('hidden');
  document.getElementById('exploreTextWrap').classList.add('hidden');
  document.getElementById('explorePhotoTextOverlay').classList.remove('show');
  document.getElementById('explorePhotoBadge').classList.remove('show');
}
function cycleExploreView(){
  if(_exploreViews.length<=1)return;
  _exploreViewIdx=(_exploreViewIdx+1)%_exploreViews.length;
  var view=_exploreViews[_exploreViewIdx];
  if(view.type==='map'){_showExploreMap();_showExploreViewHint(t('explore.viewMap'));}
  else if(view.type==='photo'){
    document.getElementById('explorePhotoImg').src=view.photoUrl;
    document.getElementById('explorePhotoWrap').classList.remove('hidden');
    document.getElementById('exploreTextWrap').classList.add('hidden');
    var textOverlay=document.getElementById('explorePhotoTextOverlay');
    if(view.text){document.getElementById('explorePhotoTextStr').innerText=view.text;textOverlay.classList.add('show');}
    else{textOverlay.classList.remove('show');}
    var badge=document.getElementById('explorePhotoBadge');
    if(view.placeName){badge.innerText='📍 '+view.placeName;badge.classList.add('show');}else{badge.classList.remove('show');}
    var photoViews=_exploreViews.filter(function(v){return v.type==='photo';});
    var cur=_exploreViews.slice(0,_exploreViewIdx+1).filter(function(v){return v.type==='photo';}).length;
    _showExploreViewHint(t('explore.viewPhoto',{cur:cur,total:photoViews.length}));
  }else if(view.type==='text'){
    document.getElementById('exploreTextIcon').innerText=view.icon||'📝';
    document.getElementById('exploreTextContent').innerText=view.text;
    document.getElementById('exploreTextWrap').classList.remove('hidden');
    document.getElementById('explorePhotoWrap').classList.add('hidden');
    _showExploreViewHint(t('explore.viewText'));
  }
}
function _showExploreViewHint(text){
  var el=document.getElementById('exploreViewHint');el.innerText=text;el.classList.add('show');
  if(_exploreHintTimer)clearTimeout(_exploreHintTimer);
  _exploreHintTimer=setTimeout(function(){el.classList.remove('show');},1500);
}
function nextExploreCard(){
  if(_exploreAnimating)return;
  if(_exploreFiltered.length<=1){showExploreCard(_exploreIndex+1);return;}
  _exploreAnimating=true;
  var wrap=document.getElementById('exploreCardWrap');
  var canvas=document.getElementById('exploreMapCanvas');
  var snapshot=canvas.toDataURL('image/jpeg',0.7);
  var oldSlot=document.createElement('div');oldSlot.className='explore-card-slot';
  oldSlot.style.cssText='background:url('+snapshot+') center/cover no-repeat;z-index:20;';
  wrap.appendChild(oldSlot);
  requestAnimationFrame(function(){requestAnimationFrame(function(){oldSlot.classList.add('slide-out-up');});});
  showExploreCard(_exploreIndex+1);
  wrap.style.transform='translateY(40px)';wrap.style.opacity='0.6';
  wrap.style.transition='transform 0.28s ease-out, opacity 0.28s ease-out';
  requestAnimationFrame(function(){requestAnimationFrame(function(){wrap.style.transform='translateY(0)';wrap.style.opacity='1';});});
  setTimeout(function(){if(oldSlot.parentNode)oldSlot.parentNode.removeChild(oldSlot);wrap.style.transition='';wrap.style.transform='';wrap.style.opacity='';_exploreAnimating=false;},310);
}
function _prefetchNextExplorePts(){
  if(_exploreFiltered.length===0)return;
  var nextIdx=(_exploreIndex+1)%_exploreFiltered.length;
  var next=_exploreFiltered[nextIdx];
  if(!next||_explorePtsCache[next.id])return;
  window.api.getDocs(window.api.collection(window.db,'walk_records',next.id,'path_points'))
    .then(function(snap){var chunks=[];snap.forEach(function(d){chunks.push(d.data());});chunks.sort(function(a,b){return a.index-b.index;});var pts=[];chunks.forEach(function(c){if(c.points)pts=pts.concat(c.points);});_explorePtsCache[next.id]=pts;}).catch(function(){});
}
function _initExploreSwipe(){
  var el=document.getElementById('exploreCardWrap');if(!el)return;
  el.addEventListener('touchstart',function(e){_exploreSwipeStartY=e.touches[0].clientY;},{passive:true});
  el.addEventListener('touchend',function(e){
    if(_exploreSwipeStartY===null)return;
    var dy=e.changedTouches[0].clientY-_exploreSwipeStartY;_exploreSwipeStartY=null;
    if(dy<-50&&!_exploreAnimating)nextExploreCard();
  },{passive:true});
}

window.selectExplorePill  = selectExplorePill;
window.fetchExploreRoutes = fetchExploreRoutes;
window.showExploreCard    = showExploreCard;
window.cycleExploreView   = cycleExploreView;
window.nextExploreCard    = nextExploreCard;
window._initExploreSwipe  = _initExploreSwipe;
window.haversineKm        = haversineKm;
