// public/js/knowledge-draw.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---- 可調整開關 ----
const SKIP_LIFF_LOGIN = true;   // ← 開發時 true 可跳過 LIFF；上線改 false
const SHOW_DEBUG      = true;   // ← 顯示除錯資訊
const COUNT_MODE      = "DOC_COUNT"; // "DOC_COUNT": 一筆=一時段；"TIMES_FIELD": 用 times/plannedCount

const liff = window.liff;

// ---- DOM ----
const quotaEl  = document.getElementById("quota");
const usedEl   = document.getElementById("used");
const drawBtn  = document.getElementById("drawBtn");
const errEl    = document.getElementById("errorMsg");
const resultEl = document.getElementById("result");
const cardImg  = document.getElementById("cardImg");
const cardName = document.getElementById("cardName");
const debugEl  = document.getElementById("debug");
function log(...a){ if(SHOW_DEBUG && debugEl){ debugEl.textContent += a.map(x=>typeof x==='string'?x:JSON.stringify(x,null,2)).join(' ') + "\n"; } console.log(...a); }

// ---- Utils ----
function todayStr(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function pick(list){ return list[Math.floor(Math.random()*list.length)]; }
function mockUid(){
  const k="dev_mock_uid";
  let id=localStorage.getItem(k);
  if(!id){ id="DEV_"+Math.random().toString(36).slice(2,10); localStorage.setItem(k,id); }
  return id;
}
async function loadManifest(){
  const res = await fetch("./cards-manifest.json", { cache:"no-store" });
  if(!res.ok) throw new Error("載入 cards-manifest.json 失敗");
  const data = await res.json();
  if(!Array.isArray(data) || data.length===0) throw new Error("cards-manifest.json 為空或格式錯誤");
  return data;
}
async function loadFirebaseConfig(){
  // 嘗試讀 ../firebase-config.js 的 named 或 default export；失敗則用 fallback（你提供的）
  try{
    const mod = await import("../firebase-config.js");
    const cfg = mod.firebaseConfig || mod.default;
    if(cfg) return cfg;
  }catch(e){ /* ignore and fallback */ }
  return {
    apiKey: "AIzaSyCCUzkxpn1quR9PPSBeZBGGl7XVh8vPzjY",
    authDomain: "medwell-test1.firebaseapp.com",
    projectId: "medwell-test1",
    // storageBucket 可省略；需用 Storage 再改成 medwell-test1.appspot.com
    messagingSenderId: "860851688843",
    appId: "1:860851688843:web:622eb8feccad45ce640b8e"
  };
}

// ---- Firestore helpers ----
async function getPlannedAndDone(db, userId, date){
  // 計畫數
  const s1 = await getDocs(query(collection(db,"reminders"), where("userId","==",userId), where("date","==",date)));
  let plannedCount = 0;
  if (COUNT_MODE === "DOC_COUNT"){
    plannedCount = s1.size;
  } else {
    s1.forEach(docSnap=>{
      const d=docSnap.data();
      if(Array.isArray(d.times)) plannedCount += d.times.length;
      else if(typeof d.plannedCount === "number") plannedCount += d.plannedCount;
      else if(typeof d.times === "number") plannedCount += d.times;
    });
  }
  // 完成數（每筆=完成一次）
  const s2 = await getDocs(query(collection(db,"checkins"), where("userId","==",userId), where("date","==",date)));
  const doneCount = s2.size;
  return { plannedCount, doneCount };
}
function computeQuota(plannedCount, doneCount){
  if(doneCount<=0) return 0;
  const base=1;
  const pct = Math.round((plannedCount>0?doneCount/plannedCount:1)*100);
  let bonus=0;
  if(pct>=80) bonus+=1;
  if(plannedCount>=3 && pct===100) bonus+=1;
  return Math.min(base+bonus, 3);
}
const drawDocId=(uid,date)=>`${uid}_${date}`;
async function getTodayUsed(db, uid, date){
  const snap = await getDoc(doc(db,"draw_history",drawDocId(uid,date)));
  if(!snap.exists()) return 0;
  return Number((snap.data()||{}).draws||0);
}
async function appendDraw(db, uid, date, card){
  const ref  = doc(db,"draw_history",drawDocId(uid,date));
  const snap = await getDoc(ref);
  const entry = { id: card.id, name: card.name, image: card.image, ts: Date.now() };
  if(!snap.exists()){
    await setDoc(ref, { userId:uid, date, draws:1, items:[entry] });
  }else{
    const data = snap.data()||{};
    await updateDoc(ref, { draws: Number(data.draws||0)+1, items: arrayUnion(entry) });
  }
}

// ---- Main ----
(async()=>{
  try{
    // 1) Firebase
    const firebaseConfig = await loadFirebaseConfig();
    const app = initializeApp(firebaseConfig);
    const db  = getFirestore(app);

    // 2) LIFF / userId（可跳過）
    let userId;
    try{
      await liff.init({ liffId: "2007870072-ZNeMmll2" });
      if(!SKIP_LIFF_LOGIN){
        if(!liff.isLoggedIn()){ liff.login(); return; }
        userId = (await liff.getProfile()).userId;
      }else{
        userId = mockUid();
        log("[DEV] Skip LIFF. mock userId =", userId);
      }
    }catch(e){
      userId = mockUid();
      log("[DEV] LIFF init failed. use mock userId =", userId, e?.message||e);
    }

    const date = todayStr();
    // ==== DEV：自動塞今天的測試資料（只在跳過 LIFF 登入時執行）====
if (SKIP_LIFF_LOGIN) {
  const PLANNED = 3; // 今天計畫的時段數（想測 1 抽就改 1）
  const DONE    = 3; // 今天完成的次數   （想測 1 抽就改 1）

  // 1) 建立今日 reminders（依 COUNT_MODE 不同而不同）
  if (COUNT_MODE === "DOC_COUNT") {
    // 一筆 = 一個時段 → 建幾筆就是幾個時段
    for (let i = 0; i < PLANNED; i++) {
      await setDoc(
        doc(db, "reminders", `${userId}_${date}_p${i}`),
        { userId, date } // 你的 schema 有其它欄位可一併放進來
      );
    }
  } else {
    // 用 times/plannedCount 欄位計算
    await setDoc(
      doc(db, "reminders", `${userId}_${date}`),
      { userId, date, plannedCount: PLANNED },
      { merge: true }
    );
  }

  // 2) 建立今日 checkins（每筆 = 完成一次）
  for (let i = 0; i < DONE; i++) {
    await setDoc(
      doc(db, "checkins", `${userId}_${date}_c${i}`),
      { userId, date }
    );
  }
}


    // 3) 載入卡片清單
    const manifest = await loadManifest();

    // 4) 計算 quota / used
    const { plannedCount, doneCount } = await getPlannedAndDone(db, userId, date);
    const quota = computeQuota(plannedCount, doneCount);
    const used  = await getTodayUsed(db, userId, date);

    quotaEl.textContent = String(quota);
    usedEl.textContent  = String(used);

    log({ plannedCount, doneCount, quota, used, cards: manifest.length });

    // 5) 抽卡
    drawBtn.addEventListener("click", async ()=>{
      const latestUsed = await getTodayUsed(db, userId, date);

      if(quota===0){
        const msg="今天尚未完成任何簽到，無法抽卡。";
        errEl.textContent = msg; alert(msg); return;
      }
      if(latestUsed>=quota){
        const msg="今日抽卡次數已用完！";
        errEl.textContent = msg; alert(msg); return;
      }

      const card = pick(manifest);
      cardImg.src = card.image;
      cardName.textContent = card.name;
      resultEl.classList.remove("hidden");

      await appendDraw(db, userId, date, card);
      const newUsed = latestUsed + 1;
      usedEl.textContent = String(newUsed);
      if(newUsed>=quota) drawBtn.disabled = true;

      log({ action:"draw", picked: card, newUsed });
    });

  }catch(e){
    console.error("[knowledge-draw] init error:", e);
    errEl.textContent = "抽卡初始化失敗：" + (e?.message||e);
  }
})();
