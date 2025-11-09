// firebase-config.js
// 正式／測試都可共用；Storage 一定要用 appspot.com 網域

export const firebaseConfig = {
  apiKey: "AIzaSyCCUzkxpn1quR9PPSBeZBGGl7XVh8vPzjY",
  authDomain: "medwell-test1.firebaseapp.com",
  databaseURL: "https://medwell-test1-default-rtdb.firebaseio.com",
  projectId: "medwell-test1",
  storageBucket: "medwell-test1.firebasestorage.app",
 // ✅ 修正：使用 appspot.com
  messagingSenderId: "860851688843",
  appId: "1:860851688843:web:622eb8feccad45ce640b8e",
  measurementId: "G-9FGX9SG7XB"
};

export const LIFF_ID = "2007870072-ZNeMmll2";
