/* ===================================================
   auth.js — 帳號綁定、帳號設定 Bottom Sheet、登出、刪除帳號
   City Walker v1.32.0
   =================================================== */

/* ===================================================
   updateAccountBanner — 依 Firebase user 狀態更新橫幅
   =================================================== */
function updateAccountBanner(){
  var banner=document.getElementById('accountBanner');
  var anonDiv=document.getElementById('bannerAnon');
  var linkedDiv=document.getElementById('bannerLinked');
  if(!banner)return;
  var user=window._firebaseUser||null;
  if(!user){banner.style.display='none';return;}
  if(user.isAnonymous){
    banner.style.display='block';banner.style.background='#FFFBF0';banner.style.border='1.5px solid #FFE5A0';
    anonDiv.style.display='block';linkedDiv.style.display='none';
  }else{
    banner.style.display='block';banner.style.background='#EEF6F3';banner.style.border='1.5px solid var(--accent-positive)';
    anonDiv.style.display='none';linkedDiv.style.display='block';
    var email=user.email||'';
    document.getElementById('bannerEmail').innerText=email;
    document.getElementById('bannerAvatar').innerText=email?email[0].toUpperCase():'G';
  }
}

/* ===================================================
   linkGoogleAccount — 使用 linkWithPopup 直接綁定
   =================================================== */
async function linkGoogleAccount(){
  var btn=document.getElementById('btnLinkGoogle');
  if(btn){btn.disabled=true;btn.innerText='連結中...';}
  var auth=window._auth;var Provider=window._GoogleAuthProvider;
  var withPopup=window._linkWithPopup;var withRedirect=window._signInWithRedirect;
  if(!auth||!Provider||!withPopup){
    alert('Auth 尚未就緒，請稍後再試。');
    if(btn){btn.disabled=false;btn.innerText='綁定 Google';}
    return;
  }
  try{
    var provider=new Provider();provider.setCustomParameters({prompt:'select_account'});
    var anonymousUser=auth.currentUser;if(!anonymousUser)throw new Error('no-current-user');
    await withPopup(anonymousUser,provider);
    alert('🎉 帳號綁定成功！你的資料已安全保存。');
    if(window.updateAccountBanner)window.updateAccountBanner();
  }catch(err){
    console.error('[Auth] 帳號綁定失敗:',err);
    if(err.code==='auth/popup-blocked'||err.code==='auth/cancelled-popup-request'){
      try{var p2=new Provider();p2.setCustomParameters({prompt:'select_account'});await withRedirect(auth.currentUser,p2);return;}
      catch(re){console.error('[Auth] Redirect fallback 失敗:',re);alert('綁定失敗，請稍後再試。');}
    }else if(err.code==='auth/credential-already-in-use'){alert('這個 Google 帳號已綁定其他裝置，請換一個 Google 帳號。');}
    else if(err.code==='auth/popup-closed-by-user'){/* 使用者自己關掉，不提示 */}
    else if(err.code==='auth/provider-already-linked'){if(window.updateAccountBanner)window.updateAccountBanner();}
    else{alert('綁定失敗，請稍後再試。（'+err.code+'）');}
  }finally{
    if(btn){
      btn.disabled=false;
      btn.innerHTML='<svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> 綁定 Google';
    }
  }
}

/* ===================================================
   帳號設定 Bottom Sheet
   =================================================== */
function openAccountSheet(){
  var user=window._firebaseUser;var email=user&&user.email?user.email:'';
  document.getElementById('sheetEmail').innerText=email||'未知帳號';
  document.getElementById('sheetAvatar').innerText=email?email[0].toUpperCase():'G';
  document.getElementById('sheetBackdrop').classList.add('open');
  document.getElementById('accountSettingSheet').classList.add('open');
}
function closeAccountSheet(){
  document.getElementById('sheetBackdrop').classList.remove('open');
  document.getElementById('accountSettingSheet').classList.remove('open');
}

async function signOutAccount(){
  closeAccountSheet();
  var auth=window._auth;var signOutFn=window._signOut;
  if(!auth||!signOutFn){alert('Auth 尚未就緒，請稍後再試。');return;}
  try{await signOutFn(auth);alert('已成功登出。');location.reload();}
  catch(err){console.error('[Auth] 登出失敗:',err);alert('登出失敗，請稍後再試。');}
}

async function deleteAccount(){
  closeAccountSheet();
  var confirmed=confirm('是否確認刪除帳號？（所有路線、個人資訊皆會一併刪除，之後重新綁定也無法尋回）');
  if(!confirmed)return;
  var auth=window._auth;var deleteUserFn=window._deleteUser;var uid=window.currentUid;
  if(!auth||!deleteUserFn||!uid){alert('Auth 尚未就緒，請稍後再試。');return;}
  var statusBar=document.getElementById('statusBar');
  if(statusBar)statusBar.innerText='🗑️ 刪除帳號中...';
  try{
    var q=window.api.query(window.api.collection(window.db,'walk_records'),window.api.where('userId','==',uid));
    var snap=await window.api.getDocs(q);
    var docs=[];snap.forEach(function(d){docs.push({id:d.id,data:d.data()});});
    for(var i=0;i<docs.length;i++){
      var docId=docs[i].id;var data=docs[i].data;
      if(data.events&&window.storage&&window.storageApi){
        var pd=[];data.events.forEach(function(ev){if(ev.photoUrl&&ev.photoUrl.startsWith('https://')){try{pd.push(window.storageApi.deleteObject(window.storageApi.ref(window.storage,ev.photoUrl)).catch(function(){}));}catch(e){}}});
        if(pd.length>0)await Promise.all(pd);
      }
      try{var pc=window.api.collection(window.db,'walk_records',docId,'path_points');var ps=await window.api.getDocs(pc);var cd=[];ps.forEach(function(d){cd.push(window.api.deleteDoc(d.ref));});if(cd.length>0)await Promise.all(cd);}catch(e){}
      try{await window.api.deleteDoc(window.api.doc(window.db,'walk_records',docId));}catch(e){}
    }
    await deleteUserFn(auth.currentUser);
    alert('帳號已刪除，感謝你使用 City Walker。');
    location.reload();
  }catch(err){
    console.error('[Auth] 刪除帳號失敗:',err);
    if(err.code==='auth/requires-recent-login'){alert('為了安全，請先登出後重新登入，再執行刪除帳號。');}
    else{alert('刪除失敗，請稍後再試。（'+err.code+'）');}
    if(statusBar)statusBar.innerText='City Walker';
  }
}

/* ===================================================
   暴露全域
   =================================================== */
window.updateAccountBanner = updateAccountBanner;
window.linkGoogleAccount   = linkGoogleAccount;
window.openAccountSheet    = openAccountSheet;
window.closeAccountSheet   = closeAccountSheet;
window.signOutAccount      = signOutAccount;
window.deleteAccount       = deleteAccount;
