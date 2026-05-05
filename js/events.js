/* ===================================================
   events.js — 事件紀錄、回憶視窗、照片上傳、Marker
   City Walker v1.32.0
   =================================================== */

var nearbyPlaces=[], selectedPlace=null;
var selectedPhotoBlob=null, selectedPhotoDataUrl=null;

/* ===================================================
   Icon 選擇器
   =================================================== */
var ICON_CATEGORIES=[
  {name:'美食',emoji:'🍽️',icons:['☕','🍔','🍜','🍣','🧁','🍺','🧃','🍦','🥐','🍱']},
  {name:'自然',emoji:'🌿',icons:['🌸','🌳','🌊','🌙','☀️','🌧️','🍂','🌈','🏔️','🌺']},
  {name:'地點',emoji:'📍',icons:['🏛️','🏪','🚉','🌉','🏠','🎭','🏟️','⛩️','🗼','🛣️']},
  {name:'心情',emoji:'💭',icons:['✨','❤️','😊','🥹','😮','💡','🤔','😴','🥰','🎉']},
  {name:'活動',emoji:'🎯',icons:['📸','🎵','🛍️','📖','🎨','🏃','🚲','⚽','🎮','🎤']},
  {name:'特別',emoji:'⭐',icons:['⭐','🏆','💎','🎁','🔖','📌','🗓️','💫','🕐','🎊']}
];

var EMOJI_TO_PLACE_TYPE = {
  '☕':'cafe','🍔':'restaurant','🍜':'restaurant','🍣':'restaurant',
  '🧁':'bakery','🍺':'bar','🧃':'cafe','🍦':'ice_cream_shop','🥐':'bakery','🍱':'restaurant',
  '🌸':'park','🌳':'park','🌊':'natural_feature','🌙':'','☀️':'','🌧️':'','🍂':'park','🌈':'','🏔️':'natural_feature','🌺':'park',
  '🏛️':'museum','🏪':'store','🚉':'transit_station','🌉':'tourist_attraction',
  '🏠':'lodging','🎭':'theater','🏟️':'stadium','⛩️':'tourist_attraction','🗼':'tourist_attraction','🛣️':'',
  '✨':'','❤️':'','😊':'','🥹':'','😮':'','💡':'','🤔':'','😴':'','🥰':'','🎉':'',
  '📸':'tourist_attraction','🎵':'night_club','🛍️':'shopping_mall',
  '📖':'book_store','🎨':'art_gallery','🏃':'park','🚲':'park','⚽':'stadium','🎮':'','🎤':'night_club',
  '⭐':'','🏆':'','💎':'','🎁':'','🔖':'','📌':'','🗓️':'','💫':'','🕐':'','🎊':''
};
window.EMOJI_TO_PLACE_TYPE = EMOJI_TO_PLACE_TYPE;

function buildIconPicker(){
  var tc=document.getElementById('iconCategoryTabs'); tc.innerHTML='';
  ICON_CATEGORIES.forEach(function(cat,idx){
    var tab=document.createElement('div');
    tab.className='icon-tab'+(idx===0?' active':'');
    tab.innerText=cat.emoji+' '+cat.name;
    tab.onclick=function(){switchIconCategory(idx);};
    tc.appendChild(tab);
  });
  renderIconGrid(0);
}
function switchIconCategory(idx){
  document.querySelectorAll('.icon-tab').forEach(function(t,i){t.classList.toggle('active',i===idx);});
  renderIconGrid(idx);
}
function renderIconGrid(idx){
  var grid=document.getElementById('iconGrid'); grid.innerHTML='';
  ICON_CATEGORIES[idx].icons.forEach(function(emoji){
    var cell=document.createElement('div');
    cell.className='icon-cell'+(emoji===window.selectedIcon?' selected':'');
    cell.innerText=emoji;
    cell.onclick=function(){
      window.selectedIcon=emoji;
      document.querySelectorAll('.icon-cell').forEach(function(c){c.classList.remove('selected');});
      cell.classList.add('selected');
      document.getElementById('selectedIconPreview').innerText=emoji;
    };
    grid.appendChild(cell);
  });
}

/* ===================================================
   照片處理
   =================================================== */
function openCamera(){ document.getElementById('photoFileInput').click(); }

function handlePhotoSelected(input){
  if(!input.files||!input.files[0]) return;
  var file=input.files[0];
  document.getElementById('eventModal').style.display='none';
  document.getElementById('photoConfirmModal').style.display='flex';
  var reader=new FileReader();
  reader.onload=function(e){
    compressImage(e.target.result,800,0.7,function(blob,dataUrl){
      selectedPhotoBlob=blob; selectedPhotoDataUrl=dataUrl;
      document.getElementById('photoConfirmImg').src=dataUrl;
    });
  };
  reader.readAsDataURL(file);
  input.value='';
}

function compressImage(dataUrl,maxWidth,quality,callback){
  var img=new Image();
  img.onload=function(){
    var canvas=document.createElement('canvas');
    var scale=Math.min(1,maxWidth/img.width);
    canvas.width=img.width*scale; canvas.height=img.height*scale;
    var ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    canvas.toBlob(function(blob){
      var reader=new FileReader();
      reader.onload=function(e){callback(blob,e.target.result);};
      reader.readAsDataURL(blob);
    },'image/jpeg',quality);
  };
  img.src=dataUrl;
}

function retakePhoto(){
  selectedPhotoBlob=null; selectedPhotoDataUrl=null;
  document.getElementById('photoConfirmModal').style.display='none';
  document.getElementById('eventModal').style.display='flex';
  setTimeout(function(){openCamera();},100);
}
function cancelPhoto(){
  selectedPhotoBlob=null; selectedPhotoDataUrl=null;
  document.getElementById('photoConfirmModal').style.display='none';
  document.getElementById('eventModal').style.display='flex';
}
function confirmPhoto(){
  document.getElementById('photoConfirmModal').style.display='none';
  document.getElementById('eventModal').style.display='flex';
  if(selectedPhotoDataUrl){
    var thumb=document.getElementById('photoPreviewThumb');
    thumb.src=selectedPhotoDataUrl; thumb.style.display='block';
    document.getElementById('cameraBtn').innerText='📷 換照片';
  }
}

/* ===================================================
   地標搜尋
   =================================================== */
function onPlaceSearchInput(val){
  var clearBtn=document.getElementById('placeSearchClear');
  if(clearBtn) clearBtn.classList.toggle('visible',val.length>0);
  if(window._placeSearchTimer) clearTimeout(window._placeSearchTimer);
  if(!val.trim()){renderPlaceTags(nearbyPlaces,'nearby');return;}
  window._placeSearchTimer=setTimeout(function(){searchPlaceByText(val);},400);
}
function clearPlaceSearch(){
  document.getElementById('placeSearchInput').value='';
  document.getElementById('placeSearchClear').classList.remove('visible');
  if(window._placeSearchTimer){clearTimeout(window._placeSearchTimer);window._placeSearchTimer=null;}
  selectedPlace=null;
  renderPlaceTags(nearbyPlaces,'nearby');
}
async function searchPlaceByText(text){
  var tagsContainer=document.getElementById('placeTags');
  tagsContainer.innerHTML='<span class="place-detecting">搜尋中...</span>';
  try{
    var {Place}=await google.maps.importLibrary('places');
    var currentPos=window.getUserPosition();
    var request={
      textQuery:text,fields:['displayName','location','id'],
      locationBias:currentPos?{center:currentPos,radius:2000}:undefined
    };
    var {places}=await Place.searchByText(request);
    if(!places||places.length===0){tagsContainer.innerHTML='<span class="place-detecting">（無結果）</span>';return;}
    renderPlaceTags(places.slice(0,5).map(function(p){
      return{name:p.displayName,placeId:p.id,lat:p.location?p.location.lat():0,lng:p.location?p.location.lng():0};
    }),'search');
  }catch(err){
    console.error('[PlaceSearch]',err);
    tagsContainer.innerHTML='<span class="place-detecting">（搜尋失敗）</span>';
  }
}
function renderPlaceTags(places,mode){
  var tagsContainer=document.getElementById('placeTags');
  tagsContainer.innerHTML='';
  if(!places||places.length===0){
    tagsContainer.innerHTML='<span class="place-detecting">（附近無地標）</span>';return;
  }
  places.forEach(function(placeData){
    var name=placeData.name||placeData.displayName||'';
    var shortName=name.length>10?name.slice(0,10)+'...':name;
    var tag=document.createElement('div');
    tag.className='place-tag';
    tag.innerText='📍 '+shortName;
    tag.onclick=function(){
      if(selectedPlace&&selectedPlace.placeId===placeData.placeId){
        selectedPlace=null;tag.classList.remove('selected');
      } else {
        selectedPlace=placeData;
        document.querySelectorAll('.place-tag').forEach(function(t){t.classList.remove('selected');});
        tag.classList.add('selected');
      }
    };
    tagsContainer.appendChild(tag);
  });
}

/* ===================================================
   openEventCanvas / closeEventModal / saveEvent
   =================================================== */
async function openEventCanvas(){
  document.getElementById('eventModal').style.display='flex';
  selectedPlace=null; nearbyPlaces=[];
  document.getElementById('placeTags').innerHTML='<span class="place-detecting">偵測中...</span>';
  document.getElementById('placeSearchInput').value='';
  document.getElementById('placeSearchClear').classList.remove('visible');
  switchIconCategory(0);
  document.getElementById('selectedIconPreview').innerText=window.selectedIcon||'📸';
  selectedPhotoBlob=null; selectedPhotoDataUrl=null;
  document.getElementById('photoPreviewThumb').style.display='none';
  document.getElementById('photoPreviewThumb').src='';
  document.getElementById('cameraBtn').innerText='📷 加入照片';

  var currentPos=window.getUserPosition();
  if(!currentPos){document.getElementById('placeTags').innerHTML='<span class="place-detecting">（無法取得位置）</span>';return;}
  try{
    var {Place}=await google.maps.importLibrary('places');
    var {places}=await Place.searchNearby({
      fields:['displayName','location','id'],
      locationRestriction:{center:currentPos,radius:100}
    });
    if(!places||places.length===0){
      document.getElementById('placeTags').innerHTML='<span class="place-detecting">（附近無地標）</span>';return;
    }
    places.slice(0,3).forEach(function(place){
      if(!place.location)return;
      nearbyPlaces.push({name:place.displayName,placeId:place.id,lat:place.location.lat(),lng:place.location.lng()});
    });
    renderPlaceTags(nearbyPlaces,'nearby');
  }catch(err){
    console.error('[Places]',err);
    document.getElementById('placeTags').innerHTML='<span class="place-detecting">（地標偵測失敗）</span>';
  }
}

function closeEventModal(){
  selectedPlace=null; selectedPhotoBlob=null; selectedPhotoDataUrl=null;
  document.getElementById('eventModal').style.display='none';
}

async function saveEvent(){
  var text=document.getElementById('eventText').value;
  var eventPos,placeName,placeId;
  if(selectedPlace){eventPos={lat:selectedPlace.lat,lng:selectedPlace.lng};placeName=selectedPlace.name;placeId=selectedPlace.placeId;}
  else{eventPos=window.getUserPosition()||{lat:0,lng:0};placeName='';placeId='';}

  var photoUrl='';
  if(selectedPhotoBlob&&window.storage&&window.storageApi&&window.currentUid){
    var confirmBtn=document.querySelector('#eventModal .btn-event');
    var originalText=confirmBtn?confirmBtn.innerText:'';
    if(confirmBtn){confirmBtn.disabled=true;confirmBtn.innerText='上傳中...';}
    try{
      var timestamp=Date.now();
      var rand=Math.floor(Math.random()*9000+1000);
      var filePath='photos/'+window.currentUid+'/'+timestamp+'_'+rand+'.jpg';
      var fileRef=window.storageApi.ref(window.storage,filePath);
      await window.storageApi.uploadBytes(fileRef,selectedPhotoBlob,{contentType:'image/jpeg'});
      photoUrl=await window.storageApi.getDownloadURL(fileRef);
    }catch(err){console.warn('[Storage] 照片上傳失敗:',err);photoUrl='';}
    finally{if(confirmBtn){confirmBtn.disabled=false;confirmBtn.innerText=originalText;}}
  }

  var eventCreatedAt=new Date().toISOString();
  var eventIndex=window.eventsData.length;
  var resolvedPlaceType=EMOJI_TO_PLACE_TYPE[window.selectedIcon]||'';
  window.eventsData.push({text,icon:window.selectedIcon,pos:eventPos,placeName,placeId,photoUrl,createdAt:eventCreatedAt,placeType:resolvedPlaceType});

  var overlay=createEventMarker(eventPos,window.selectedIcon,text,placeName,photoUrl,eventCreatedAt,'',eventIndex);
  window.eventsData[eventIndex]._overlay=overlay;
  document.getElementById('eventText').value='';
  selectedPlace=null; selectedPhotoBlob=null; selectedPhotoDataUrl=null;
  document.getElementById('eventModal').style.display='none';
}

/* ===================================================
   回憶視窗
   =================================================== */
function closeMemoryBox(){
  exitMemoryEditMode();
  document.getElementById('memoryPager').style.display='none';
  window._memoryPagerEvents=[];
  document.getElementById('memoryBox').style.display='none';
}
function enterMemoryEdit(){
  var currentText=document.getElementById('memoryText').innerText;
  if(currentText==='那一天，在這裡留下了足跡...') currentText='';
  document.getElementById('memoryEditArea').value=currentText;
  document.getElementById('memoryText').style.display='none';
  document.getElementById('memoryEditArea').style.display='block';
  document.getElementById('btnMemoryEdit').style.display='none';
  document.getElementById('btnMemorySave').style.display='inline-block';
  document.getElementById('btnMemoryCancel').style.display='inline-block';
  document.getElementById('memoryEditArea').focus();
}
function exitMemoryEditMode(){
  document.getElementById('memoryText').style.display='block';
  document.getElementById('memoryEditArea').style.display='none';
  document.getElementById('btnMemoryEdit').style.display='inline-block';
  document.getElementById('btnMemorySave').style.display='none';
  document.getElementById('btnMemoryCancel').style.display='none';
}
function cancelMemoryEdit(){ exitMemoryEditMode(); }

async function saveMemoryEdit(){
  var newText=document.getElementById('memoryEditArea').value.trim();
  var box=document.getElementById('memoryBox');
  var routeId=box.dataset.routeId||'';
  var eventIndex=parseInt(box.dataset.eventIndex);
  document.getElementById('memoryText').innerText=newText||'那一天，在這裡留下了足跡...';
  exitMemoryEditMode();
  if(!routeId){
    if(isNaN(eventIndex)||eventIndex<0||!window.eventsData[eventIndex]) return;
    window.eventsData[eventIndex].text=newText;
    var oldOverlay=window.eventsData[eventIndex]._overlay;
    if(oldOverlay) oldOverlay.setMap(null);
    var ev=window.eventsData[eventIndex];
    var newOverlay=createEventMarker(ev.pos,ev.icon,newText,ev.placeName,ev.photoUrl,ev.createdAt,'',eventIndex);
    window.eventsData[eventIndex]._overlay=newOverlay;
    return;
  }
  if(isNaN(eventIndex)||eventIndex<0) return;
  if(window._loadedRouteEvents&&window._loadedRouteEvents[eventIndex]){
    window._loadedRouteEvents[eventIndex].text=newText;
  }
  try{
    var data=window.currentDocs&&window.currentDocs.find(function(d){return d.id===routeId;});
    if(data&&data.events&&data.events[eventIndex]!==undefined){
      data.events[eventIndex].text=newText;
      await window.api.updateDoc(window.api.doc(window.db,'walk_records',routeId),{events:data.events});
    }
  }catch(err){console.error('[saveMemoryEdit] Firestore 更新失敗:',err);}
  if(window.historyMarkers&&window.historyMarkers[eventIndex]){
    window.historyMarkers[eventIndex].setMap(null);
    var evData=window._loadedRouteEvents[eventIndex];
    window.historyMarkers[eventIndex]=createEventMarker(
      evData.pos,evData.icon,newText,evData.placeName||'',evData.photoUrl||'',
      evData.createdAt||'',routeId,eventIndex,data?data.trackColor||'':''
    );
  }
}

function fillMemoryBox(icon,text,placeName,photoUrl,createdAt,routeId,eventIndex){
  document.getElementById('memoryIcon').innerText=icon||'📸';
  document.getElementById('memoryPlace').innerText=placeName?('📍 '+placeName):'';
  var timeEl=document.getElementById('memoryTime');
  if(createdAt){
    try{
      var d=new Date(createdAt);
      var hh=String(d.getHours()).padStart(2,'0');
      var mm=String(d.getMinutes()).padStart(2,'0');
      timeEl.innerText='🕐 '+hh+':'+mm+' 在這裡';
    }catch(ex){timeEl.innerText='';}
  }else{timeEl.innerText='';}
  var polaroid=document.getElementById('memoryPolaroid');
  var memPhoto=document.getElementById('memoryPhoto');
  if(photoUrl){memPhoto.src=photoUrl;polaroid.classList.remove('hidden');}
  else{polaroid.classList.add('hidden');memPhoto.src='';}
  document.getElementById('memoryText').innerText=text||'那一天，在這裡留下了足跡...';
  var box=document.getElementById('memoryBox');
  box.dataset.routeId=routeId||'';
  box.dataset.eventIndex=eventIndex;
}

function navigateMemory(dir){
  var pagerEvents=window._memoryPagerEvents;
  if(!pagerEvents||pagerEvents.length<=1) return;
  var box=document.getElementById('memoryBox');
  var cur=parseInt(box.dataset.pagerCurrent)||0;
  cur=(cur+dir+pagerEvents.length)%pagerEvents.length;
  box.dataset.pagerCurrent=cur;
  var item=pagerEvents[cur];
  var ev=item.ev;
  fillMemoryBox(ev.icon,ev.text,ev.placeName||'',ev.photoUrl||'',ev.createdAt||'',box.dataset.routeId,item.idx);
  document.getElementById('memoryPagerLabel').innerText=(cur+1)+' / '+pagerEvents.length;
  exitMemoryEditMode();
}

/* ===================================================
   createEventMarker — 事件地圖標記
   =================================================== */
function createEventMarker(pos,icon,text,placeName,photoUrl,createdAt,routeId,eventIndex,trackColor){
  routeId=routeId||'';
  eventIndex=(typeof eventIndex==='number')?eventIndex:-1;
  trackColor=trackColor||'';

  function EmojiOverlay(position,icon,text,placeName,photoUrl,createdAt){
    this.position_=new google.maps.LatLng(position.lat,position.lng);
    this.icon_=icon; this.text_=text; this.placeName_=placeName||'';
    this.photoUrl_=photoUrl||''; this.createdAt_=createdAt||'';
    this.div_=null; this.setMap(window.map);
  }
  EmojiOverlay.prototype=Object.create(google.maps.OverlayView.prototype);
  EmojiOverlay.prototype.onAdd=function(){
    var div=document.createElement('div');
    div.className='event-marker-div'; div.innerText=this.icon_;
    if(trackColor){
      div.style.color=trackColor;
      var dot=document.createElement('div');
      dot.className='route-dot'; div.appendChild(dot);
    }
    var ci=this.icon_,ct=this.text_,cp=this.placeName_,cph=this.photoUrl_,cat=this.createdAt_;
    function showMemory(e){
      e.stopPropagation(); if(e.preventDefault)e.preventDefault();
      var pagerEvents=[]; var pagerStart=0;
      var currentPlaceId=(window._loadedRouteEvents&&eventIndex>=0&&window._loadedRouteEvents[eventIndex])
        ?(window._loadedRouteEvents[eventIndex].placeId||''):'';
      if(routeId&&currentPlaceId&&window._loadedRouteEvents){
        window._loadedRouteEvents.forEach(function(ev,idx){
          if(ev.placeId&&ev.placeId===currentPlaceId){
            if(idx===eventIndex) pagerStart=pagerEvents.length;
            pagerEvents.push({ev:ev,idx:idx});
          }
        });
      }
      if(pagerEvents.length<=1) pagerEvents=[];
      var box=document.getElementById('memoryBox');
      box.dataset.routeId=routeId; box.dataset.eventIndex=eventIndex;
      box.dataset.pagerCurrent=pagerStart;
      window._memoryPagerEvents=pagerEvents;
      fillMemoryBox(ci,ct,cp,cph,cat,routeId,eventIndex);
      var pagerEl=document.getElementById('memoryPager');
      if(pagerEvents.length>1){
        pagerEl.style.display='flex';
        document.getElementById('memoryPagerLabel').innerText=(pagerStart+1)+' / '+pagerEvents.length;
      }else{pagerEl.style.display='none';}
      exitMemoryEditMode();
      document.getElementById('memoryBox').style.display='flex';
    }
    div.addEventListener('click',showMemory);
    div.addEventListener('touchstart',showMemory,{passive:false});
    this.div_=div; this.getPanes().overlayMouseTarget.appendChild(div);
  };
  EmojiOverlay.prototype.draw=function(){
    var pt=this.getProjection().fromLatLngToDivPixel(this.position_);
    if(this.div_&&pt){this.div_.style.left=pt.x+'px';this.div_.style.top=pt.y+'px';}
  };
  EmojiOverlay.prototype.onRemove=function(){
    if(this.div_){this.div_.parentNode.removeChild(this.div_);this.div_=null;}
  };
  return new EmojiOverlay(pos,icon,text,placeName,photoUrl,createdAt);
}

/* ===================================================
   解鎖地標
   =================================================== */
var _unlockMarkers=[];

async function loadUnlockedLandmarks(){
  _unlockMarkers.forEach(function(m){m.setMap(null);}); _unlockMarkers=[];
  var uid=window.currentUid||'anonymous';
  try{
    var q=window.api.query(window.api.collection(window.db,'walk_records'),window.api.where('userId','==',uid));
    var snap=await window.api.getDocs(q);
    var placeMap={};
    snap.forEach(function(d){
      var data=d.data(); var trackColor=data.trackColor||'#8FB9A8';
      if(!data.events||!Array.isArray(data.events)) return;
      data.events.forEach(function(ev){
        if(!ev.placeId||!ev.pos) return;
        if(!placeMap[ev.placeId]) placeMap[ev.placeId]={pos:ev.pos,events:[]};
        placeMap[ev.placeId].events.push({icon:ev.icon||'📍',text:ev.text||'',placeName:ev.placeName||'',photoUrl:ev.photoUrl||'',createdAt:ev.createdAt||'',trackColor});
      });
    });
    Object.keys(placeMap).forEach(function(placeId){
      var entry=placeMap[placeId];
      var m=createUnlockMarker(placeId,entry.pos,entry.events,entry.events[0].trackColor||'#8FB9A8');
      _unlockMarkers.push(m);
    });
  }catch(err){console.warn('[loadUnlockedLandmarks] 失敗:',err);}
}

function createUnlockMarker(placeId,pos,events,color){
  function UnlockOverlay(position){
    this.position_=new google.maps.LatLng(position.lat,position.lng);
    this.div_=null; this.setMap(window.map);
  }
  UnlockOverlay.prototype=Object.create(google.maps.OverlayView.prototype);
  UnlockOverlay.prototype.onAdd=function(){
    var div=document.createElement('div'); div.className='unlock-marker-div'; div.innerText='🏠';
    div.addEventListener('click',function(e){e.stopPropagation();showUnlockMemory(events);});
    div.addEventListener('touchstart',function(e){e.stopPropagation();if(e.preventDefault)e.preventDefault();showUnlockMemory(events);},{passive:false});
    this.div_=div; this.getPanes().overlayMouseTarget.appendChild(div);
  };
  UnlockOverlay.prototype.draw=function(){
    var pt=this.getProjection().fromLatLngToDivPixel(this.position_);
    if(this.div_&&pt){this.div_.style.left=pt.x+'px';this.div_.style.top=pt.y+'px';}
  };
  UnlockOverlay.prototype.onRemove=function(){
    if(this.div_){this.div_.parentNode.removeChild(this.div_);this.div_=null;}
  };
  return new UnlockOverlay(pos);
}

function showUnlockMemory(events){
  if(!events||events.length===0) return;
  var first=events[0];
  fillMemoryBox(first.icon,first.text,first.placeName,first.photoUrl,first.createdAt,'',-1);
  var pagerEl=document.getElementById('memoryPager');
  if(events.length>1){
    window._memoryPagerEvents=events.map(function(ev,i){return{ev:ev,idx:i};});
    var box=document.getElementById('memoryBox');
    box.dataset.pagerCurrent=0; box.dataset.routeId=''; box.dataset.eventIndex=-1;
    pagerEl.style.display='flex';
    document.getElementById('memoryPagerLabel').innerText='1 / '+events.length;
  }else{window._memoryPagerEvents=[];pagerEl.style.display='none';}
  exitMemoryEditMode();
  document.getElementById('memoryBox').style.display='flex';
}

/* ===================================================
   暴露全域
   =================================================== */
window.buildIconPicker     = buildIconPicker;
window.switchIconCategory  = switchIconCategory;
window.openCamera          = openCamera;
window.handlePhotoSelected = handlePhotoSelected;
window.retakePhoto         = retakePhoto;
window.cancelPhoto         = cancelPhoto;
window.confirmPhoto        = confirmPhoto;
window.onPlaceSearchInput  = onPlaceSearchInput;
window.clearPlaceSearch    = clearPlaceSearch;
window.openEventCanvas     = openEventCanvas;
window.closeEventModal     = closeEventModal;
window.saveEvent           = saveEvent;
window.closeMemoryBox      = closeMemoryBox;
window.enterMemoryEdit     = enterMemoryEdit;
window.cancelMemoryEdit    = cancelMemoryEdit;
window.saveMemoryEdit      = saveMemoryEdit;
window.exitMemoryEditMode  = exitMemoryEditMode;
window.fillMemoryBox       = fillMemoryBox;
window.navigateMemory      = navigateMemory;
window.createEventMarker   = createEventMarker;
window.loadUnlockedLandmarks = loadUnlockedLandmarks;
window.showUnlockMemory    = showUnlockMemory;
window.selectedIcon        = '📸';
