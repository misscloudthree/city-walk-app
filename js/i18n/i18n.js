/* ===================================================
   i18n.js — 多國語系核心
   City Walker v1.33.0

   PSEUDO:
   - 支援語系：zh-TW（預設）、en
   - 語系偵測順序：localStorage → navigator.language → 'zh-TW'
   - t(key, vars?) — 取字串並替換 {變數}
   - setLang(lang)  — 切換語系並重新渲染所有 data-i18n 元素
   - window._lang   — 目前語系代碼（全域可讀）
   =================================================== */

import zhTW from './zh-TW.js';
import en   from './en.js';

const LOCALES = { 'zh-TW': zhTW, en };
const SUPPORTED = Object.keys(LOCALES);
const STORAGE_KEY = 'cw_lang';

/* ─── 語系偵測 ───────────────────────────────────── */
function detectLang() {
  /* 1. localStorage 優先（使用者手動選擇過） */
  var stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED.includes(stored)) return stored;

  /* 2. 瀏覽器語系 */
  var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
  if (nav.startsWith('zh')) return 'zh-TW';
  if (nav.startsWith('en')) return 'en';

  return 'zh-TW'; /* fallback */
}

/* ─── 初始化 ─────────────────────────────────────── */
var _currentLang = detectLang();
window._lang = _currentLang;

/* ─── t() — 翻譯函式 ─────────────────────────────── */
/*
   PSEUDO: t(key, vars)
   1. 從 LOCALES[_currentLang] 取出 key 對應的字串
   2. 若找不到，fallback 到 zh-TW（避免空白）
   3. 若仍找不到，直接回傳 key（方便 debug）
   4. 替換所有 {varName} 佔位符
*/
function t(key, vars) {
  var dict = LOCALES[_currentLang] || LOCALES['zh-TW'];
  var str = dict[key];
  if (str === undefined) {
    str = LOCALES['zh-TW'][key]; /* fallback */
  }
  if (str === undefined) {
    console.warn('[i18n] missing key:', key);
    return key;
  }
  if (vars) {
    Object.keys(vars).forEach(function(k) {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
    });
  }
  return str;
}

/* ─── applyDataI18n() — 批次替換 HTML 靜態字串 ────── */
/*
   PSEUDO:
   - 尋找所有帶 data-i18n="key" 的元素 → 設定 innerText
   - 帶 data-i18n-placeholder="key" 的 input → 設定 placeholder
   - 帶 data-i18n-html="key" 的元素 → 設定 innerHTML（謹慎使用）
*/
function applyDataI18n() {
  /* innerText */
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    var vars = el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : undefined;
    el.innerText = t(key, vars);
  });

  /* placeholder */
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });

  /* innerHTML（只用在允許 HTML 標籤的情境） */
  document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
}

/* ─── setLang() — 切換語系 ──────────────────────── */
/*
   PSEUDO:
   1. 驗證語系代碼合法
   2. 更新 _currentLang + window._lang
   3. 存到 localStorage
   4. 重新執行 applyDataI18n()（靜態 HTML）
   5. 觸發自訂事件 'langchange'，讓各模組監聽後自行更新動態字串
   6. 更新語系切換按鈕的 active 狀態
*/
function setLang(lang) {
  if (!SUPPORTED.includes(lang)) return;
  _currentLang = lang;
  window._lang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  applyDataI18n();
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  _updateLangToggle();
}

/* ─── 語系切換按鈕狀態 ───────────────────────────── */
function _updateLangToggle() {
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    var isActive = btn.getAttribute('data-lang') === _currentLang;
    btn.classList.toggle('active', isActive);
  });
}

/* ─── 頁面就緒後自動套用 ─────────────────────────── */
/* PSEUDO: DOMContentLoaded 可能比 module 執行早，
   用 requestAnimationFrame 確保 DOM 全部就緒 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    requestAnimationFrame(applyDataI18n);
    requestAnimationFrame(_updateLangToggle);
  });
} else {
  requestAnimationFrame(applyDataI18n);
  requestAnimationFrame(_updateLangToggle);
}

/* ─── 暴露全域 ───────────────────────────────────── */
window.t          = t;
window.setLang    = setLang;
window.applyDataI18n = applyDataI18n;

export { t, setLang, applyDataI18n };
