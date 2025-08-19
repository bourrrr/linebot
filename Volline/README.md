# MakeWell · LINE 轉送聊天室（最小可用版）

## 1. 目錄
```
makewell-bot-skeleton/
├─ .firebaserc
├─ firebase.json
├─ firestore.rules
├─ firestore.indexes.json
└─ functions/
   ├─ package.json
   └─ index.js
```

## 2. 安裝與部署
```bash
# 登入與初始化（若尚未）
npm i -g firebase-tools
firebase login

# 設定預設專案（或手動編輯 .firebaserc）
firebase use YOUR_FIREBASE_PROJECT_ID

# 設定 Secrets（LINE 憑證）
firebase functions:secrets:set LINE_CHANNEL_SECRET
firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN

# 部署 Firestore 規則與索引
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes

# 部署 Functions
firebase deploy --only functions
```

## 3. LINE Webhook 設定
- 將部署後的 `lineWebhook` URL 貼到 LINE Developers > Messaging API > Webhook URL
- 啟用 Use webhook，關閉 Auto-reply（避免與機器人邏輯衝突）。

## 4. 呼叫 createMatch / closeMatch（前端示例）
```js
import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
const app = initializeApp({ /* your config */ });
const functions = getFunctions(app);

const createMatch = httpsCallable(functions, 'createMatch');
const closeMatch  = httpsCallable(functions, 'closeMatch');

await createMatch({
  taskId: 'T-2025-0001',
  patientUserId: '<LINE_userId_patient>',
  volunteerUserId: '<LINE_userId_volunteer>',
  patientAuthUid: '<FirebaseAuthUid_patient>',     // 若你的使用者也有登入網頁
  volunteerAuthUid: '<FirebaseAuthUid_volunteer>'  // 可選，用於 Firestore 規則判斷
});

await closeMatch({ matchId: '<auto from createMatch>', reason: '任務完成' });
```

## 5. 重點
- Webhook 僅允許文字訊息，圖片/檔案一律回覆不支援且不轉送。
- 任務關閉後，Webhook 會停止轉送；Firestore 規則也禁止客戶端寫入訊息。
- 所有寫入都由 Admin SDK（Functions）執行；前台通常只讀取訊息（或完全不連 Firestore，改看你需求）。
```