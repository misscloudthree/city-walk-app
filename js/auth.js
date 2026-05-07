/* ===================================================
   auth.js — 帳號綁定、帳號設定 Bottom Sheet、登出、刪除帳號
   City Walker v1.33.0
   =================================================== */

import { t } from './i18n/i18n.js';

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
    /* 更新匿名橫幅文字 */
    var anonLabel=anonDiv.querySelector('div > div:first-child');
    var anonHint=anonDiv.querySelector('div > div:last-child');
    if(anonLabel) anonLabel.innerText=t('account.anonLabel');
    if(anonHint)  anonHint.innerText=t('account.anonHint');
  }else{
    banner.style.display='block';banner.style.background='#EEF6F3';banner.style.border='1.5px solid var(--accent-positive)';
    anonDiv.style.display='none';linkedDiv.style.display='block';
    var email=user.email||'';
    document.getElementById('bannerEmail').innerText=email;
    document.getElementById('bannerAvatar').innerText=email?email[0].toUpperCase():'G';
    /* 已綁定 label */
    var linkedLabel=linkedDiv.querySelector('div > div:first-child');
    if(linkedLabel) linkedLabel.innerText=t('account.linkedLabel');
  }
}

async function linkGoogleAccount(){
  var btn=document.getElementById('btnLinkGoogle');
  if(btn){btn.disabled=true;btn.innerText=t('btn.linking');}
  var auth=window._auth;var Provider=window._GoogleAuthProvider;
  var withPopup=window._linkWithPopup;var withRedirect=window._signInWithRedirect;
  if(!auth||!Provider||!withPopup){
    alert(t('alert.authNotReady'));
    if(btn){btn.disabled=false;btn.innerText=t('btn.linkGoogle');}
    return;
  }
  try{
    var provider=new Provider();provider.setCustomParameters({prompt:'select_account'});
    var anonymousUser=auth.currentUser;if(!anonymousUser)throw new Error('no-current-user');
    await withPopup(anonymousUser,provider);
    alert(t('alert.linkSuccess'));
    if(window.updateAccountBanner)window.updateAccountBanner();
  }catch(err){
    console.error('[Auth] 帳號綁定失敗:',err);
    if(err.code==='auth/popup-blocked'||err.code==='auth/cancelled-popup-request'){
      try{var p2=new Provider();p2.setCustomParameters({prompt:'select_account'});await withRedirect(auth.currentUser,p2);return;}
      catch(re){console.error('[Auth] Redirect fallback:',re);alert(t('alert.linkFail',{code:'redirect'}));}
    }else if(err.code==='auth/credential-already-in-use'){alert(t('alert.linkCredInUse'));}
    else if(err.code==='auth/popup-closed-by-user'){/* 使用者自己關掉，靜默 */}
    else if(err.code==='auth/provider-already-linked'){if(window.updateAccountBanner)window.updateAccountBanner();}
    else{alert(t('alert.linkFail',{code:err.code||'unknown'}));}
  }finally{
    if(btn){
      btn.disabled=false;
      btn.innerHTML=
        '<svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">'+
        '<path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>'+
        '<path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>'+
        '<path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>'+
        '<path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>'+
        '</svg> ' + t('btn.linkGoogle');
    }
  }
}

function openAccountSheet(){
  var user=window._firebaseUser;var email=user&&user.email?user.email:'';
  document.getElementById('sheetEmail').innerText=email||t('account.unknown');
  document.getElementById('sheetAvatar').innerText=email?email[0].toUpperCase():'G';
  /* 更新 sheet 內文字 */
  var loginLabel=document.querySelector('#sheetUserInfo div > div:first-child');
  if(loginLabel) loginLabel.innerText=t('account.loginLabel');
  var signOutSpan=document.querySelector('.sheet-btn:not(.danger) span:last-child');
  if(signOutSpan) signOutSpan.innerText=t('btn.signOut');
  var delSpan=document.querySelector('.sheet-btn.danger span:last-child');
  if(delSpan) delSpan.innerText=t('btn.deleteAccount');
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
  if(!auth||!signOutFn){alert(t('alert.authNotReady'));return;}
  try{await signOutFn(auth);alert(t('alert.signOutSuccess'));location.reload();}
  catch(err){console.error('[Auth] 登出失敗:',err);alert(t('alert.signOutFail'));}
}

async function deleteAccount(){
  closeAccountSheet();
  if(!confirm(t('alert.deleteAccountConfirm'))) return;
  var auth=window._auth;var deleteUserFn=window._deleteUser;var uid=window.currentUid;
  if(!auth||!deleteUserFn||!uid){alert(t('alert.authNotReady'));return;}
  var statusBar=document.getElementById('statusBar');
  if(statusBar) statusBar.innerText=t('status.deleting');
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
    alert(t('alert.deleteAccountSuccess'));
    location.reload();
  }catch(err){
    console.error('[Auth] 刪除帳號失敗:',err);
    if(err.code==='auth/requires-recent-login'){alert(t('alert.deleteAccountRelogin'));}
    else{alert(t('alert.deleteAccountFail',{code:err.code||'unknown'}));}
    if(statusBar)statusBar.innerText=t('status.appName');
  }
}

/* 語系切換時同步更新橫幅文字 */
document.addEventListener('langchange', function(){ updateAccountBanner(); });

window.updateAccountBanner = updateAccountBanner;
window.linkGoogleAccount   = linkGoogleAccount;
window.openAccountSheet    = openAccountSheet;
window.closeAccountSheet   = closeAccountSheet;
window.signOutAccount      = signOutAccount;
window.deleteAccount       = deleteAccount;
