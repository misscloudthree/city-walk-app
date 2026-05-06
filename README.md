# City Walker 🗺

> 一款記錄城市漫遊軌跡的 PWA App

**目前版本：v1.32.2**
**部署：GitHub + Vercel**
**網址：https://city-walk-app.vercel.app**

---

## 專案結構

```
city-walker/
├── index.html              # HTML 骨架、載入順序
├── vercel.json             # COOP Header（Google 登入必要）
├── README.md               # 本文件
├── css/
│   └── style.css           # 全部 CSS
└── js/
    ├── config.js           # Firebase 初始化、Auth 暴露
    ├── map.js              # 地圖、GPS、走路核心、UserWalkOverlay
    ├── events.js           # 事件紀錄、回憶視窗、照片上傳、地標搜尋
    ├── records.js          # 我的路線頁、篩選、統計、分享卡片、雲端存取
    ├── explore.js          # 探索頁、全屏卡片、swipe
    ├── inspire.js          # 靈感規劃、Places API、TSP、Routes API
    └── auth.js             # 帳號綁定、Bottom Sheet、登出、刪除帳號
```

---

## 技術棧

| 項目 | 技術 |
|------|------|
| 地圖 | Google Maps JavaScript API（薄荷綠自訂 Style）|
| 路線吸附 | Google Roads API（Snap to Roads）|
| 地標搜尋 | Google Places API（New）|
| 路線規劃 | Google Routes API |
| 資料庫 | Firebase Firestore |
| 照片儲存 | Firebase Storage |
| 帳號 | Firebase Auth（匿名 + Google 綁定）|
| 部署 | Vercel（GitHub 自動部署）|
| 字體 | Caveat（手寫）、Poly（內文）|

---

## Firebase 設定

```
Project ID: city-walk-project
Auth Domain: city-walk-project.firebaseapp.com
Storage Bucket: city-walk-project.firebasestorage.app
```

**Firestore Security Rules（重要！每 30 天需確認未過期）**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /walk_records/{recordId} {
      allow read: if request.auth != null && (
        resource.data.userId == request.auth.uid ||
        resource.data.isPublic == true
      );
      allow create: if request.auth != null &&
        request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null &&
        resource.data.userId == request.auth.uid;
      match /path_points/{chunkId} {
        allow read: if request.auth != null && (
          get(/databases/$(database)/documents/walk_records/$(recordId)).data.userId == request.auth.uid ||
          get(/databases/$(database)/documents/walk_records/$(recordId)).data.isPublic == true
        );
        allow write: if request.auth != null &&
          get(/databases/$(database)/documents/walk_records/$(recordId)).data.userId == request.auth.uid;
      }
    }
  }
}
```

---

## 模組對照表（改哪個功能上傳哪個檔案）

| 要改的功能 | 上傳檔案 |
|-----------|---------|
| 地圖顯示、GPS、走路核心、走路動畫 | `js/map.js` |
| 事件紀錄彈窗、回憶視窗、照片、地標 | `js/events.js` |
| 我的路線頁、篩選、統計、分享卡片 | `js/records.js` |
| 探索頁、swipe、公開路線 | `js/explore.js` |
| 靈感規劃、TSP 排序、Routes 虛線 | `js/inspire.js` |
| Google 帳號綁定、登出、刪除帳號 | `js/auth.js` |
| 顏色、動畫、排版 | `css/style.css` |
| HTML 結構、頁面、載入順序 | `index.html` |
| Firebase 設定、Auth API | `js/config.js` |
| 不確定在哪裡 | 全部上傳 |

---

## 核心資料結構

### walk_records（Firestore）
```javascript
{
  name: '未命名漫遊',
  city: '台北市',
  distance: 2.14,          // km
  duration: '42 分鐘',
  events: [                // 事件陣列
    {
      icon: '☕',
      text: '心情文字',
      pos: { lat, lng },
      placeName: '星巴克',
      placeId: 'ChIJ...',
      placeType: 'cafe',
      photoUrl: 'https://...',
      createdAt: '2026-05-06T08:00:00.000Z'
    }
  ],
  trackColor: '#8FB9A8',
  isPinned: false,
  isPublic: false,
  userId: 'firebase-uid',
  createdAt: Timestamp
}

// subcollection: walk_records/{id}/path_points
{
  index: 0,               // chunk 順序
  points: [{ lat, lng }]  // 每筆最多 500 點
}
```

---

## 版本紀錄

| 版本 | 主要功能 |
|------|---------|
| v1.32.2 | 靈感距離提示移至地圖上方浮層，不與按鈕重疊 |
| v1.32.1 | 靈感路線 UI 修正、開始漫遊清除靈感標記 |
| v1.32.0 | 走路腳步動畫（UserWalkOverlay）、模組化拆檔 |
| v1.31.x | 靈感規劃系統（TSP、Routes API、換一組）|
| v1.30.x | 探索頁（公開路線、全屏 swipe 卡片）|
| v1.29.x | 靈感 tooltip、換一組功能 |
| v1.28.x | 分享卡片重新設計（Static Maps API）|
| v1.27.x | 解鎖地標系統 |
| v1.26.x | 以靈感開始漫遊 |
| v1.23.x | GPS 中斷恢復機制 |
| v1.19.x | 探索頁初版 |
| v1.17.x | Firebase Auth、Google 帳號綁定 |
| v1.16.x | 批次刪除、管理模式 |
| v1.15.x | 路線名稱搜尋 |
| v1.13.x | 個人統計、城市分組、篩選列 |
| v1.12.x | IG 分享卡片 |
| v1.10.x | 照片上傳、手寫字體、Caveat |

---

## 開新 Session 的開場白

```
我是 City Walker 專案的開發者。
請先閱讀附上的 README.md 了解專案架構。

目前版本：v1.32.2
本次要做：[描述需求]

[上傳相關的 js 檔案]
```

---

## 合作原則

- **穩定優先**：不隨意改動無關的程式碼
- **精確更新**：每次只輸出有改動的檔案（不整包輸出）
- **版本迭代**：小修 v1.X.X，大功能 v1.X.0
- **Pseudo Code**：複雜邏輯附上虛擬碼註解
- **回歸測試**：每次更新附上功能回歸 checklist

---

## 本機開發 & 部署流程

```bash
# 第一次設定（只做一次）
git clone https://github.com/misscloudthree/city-walk-app.git
cd city-walk-app

# 每次改完檔案
git add .
git commit -m "feat/fix: 說明改了什麼 vX.XX.X"
git tag vX.XX.X
git push
git push origin vX.XX.X
# → Vercel 自動部署，約 30 秒上線
```

---

## 待開發 / 已知問題

- [ ] Google Maps API 載入警告（loading=async）待優化
- [ ] inspire.js 超過 850 行，考慮未來再拆分
- [ ] 走路動畫在低階手機效能測試

---

*Last updated: v1.32.2*
