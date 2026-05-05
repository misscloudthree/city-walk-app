/* ===================================================
   config.js — Firebase 初始化
   City Walker v1.32.0
   =================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, setDoc, serverTimestamp, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, linkWithCredential, signInWithPopup, signInWithRedirect, getRedirectResult, linkWithPopup, signOut, deleteUser } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDc460QtdfTv32gEPNPLVCMOxPz0hCWxbQ",
  authDomain: "city-walk-project.firebaseapp.com",
  projectId: "city-walk-project",
  storageBucket: "city-walk-project.firebasestorage.app",
  messagingSenderId: "190868537611",
  appId: "1:190868537611:web:9a97031a9357f4d39be20e"
};

const app      = initializeApp(firebaseConfig);
const db       = getFirestore(app);
const auth     = getAuth(app);
const storage  = getStorage(app);

/* 暴露到 window，讓其他非 module script 使用 */
window.db      = db;
window.storage = storage;
window.storageApi = { ref, uploadBytes, getDownloadURL, deleteObject };
window.api = { addDoc, getDocs, updateDoc, deleteDoc, doc, setDoc, collection, serverTimestamp, query, where, orderBy };

/* Auth 相關 API 暴露 */
window._auth               = auth;
window._GoogleAuthProvider = GoogleAuthProvider;
window._linkWithCredential = linkWithCredential;
window._signInWithPopup    = signInWithPopup;
window._signInWithRedirect = signInWithRedirect;
window._getRedirectResult  = getRedirectResult;
window._linkWithPopup      = linkWithPopup;
window._signOut            = signOut;
window._deleteUser         = deleteUser;

/* 匿名登入 */
signInAnonymously(auth).catch(function(err){
  console.warn('[Auth] 匿名登入失敗:', err);
});

/* Auth 狀態監聽 */
onAuthStateChanged(auth, function(user){
  if(user){
    window.currentUid      = user.uid;
    window._firebaseUser   = user;
    if(window._authReadyCallback) window._authReadyCallback();
    if(window.updateAccountBanner) window.updateAccountBanner();
  }
});

/* Redirect 回調處理 */
getRedirectResult(auth).then(function(result){
  if(!result) return;
  var credential = GoogleAuthProvider.credentialFromResult(result);
  if(!credential) return;
  if(result.user && !result.user.isAnonymous){
    console.log('[Auth] Google redirect 綁定成功:', result.user.email);
  }
}).catch(function(err){
  if(err && err.code !== 'auth/no-auth-event'){
    console.warn('[Auth] Redirect result error:', err);
  }
});
