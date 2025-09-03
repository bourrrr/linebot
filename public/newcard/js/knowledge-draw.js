// ./js/knowledge-draw.js
// 需要：
// 1) public/cards.json（或改 fetch 路徑）
// 2) ./js/firebase-config.js 輸出 firebaseConfig
// 3) 已在 HTML 先載入 <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp,
  collection, query, where, getDocs, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

// ========== ⚙️ 路徑設定（請依你的實際集合調整） ==================
const CHECKIN_COLLECTION_ROOT = "checkins"; // 方案A：簽到彙總
// 結構建議：checkins/{uid}/days/{YYYYMMDD} => { total_plans, completed_count }
// （若你已有 completion_rate 也可直接用）

const REMINDER_COLLECTION = "reminders";    // 方案B：從提醒集合推算
// 建議字段示意：
// reminders/{reminderId} => { userId, active: true, scheduleDays: [1..7], logs: { '2025-09-03': true/false } }
// 其中 logs[dateKey] 為是否完成

const DRAWS_SUBCOL = "daily_draws";         // users/{uid}/daily_draws/{YYYYMMDD}
const CARDS_JSON_URL = "/cards.json";       // 卡片清單（可改路徑）

// ========== 基礎初始化 ==========
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ========== DOM ==========
const $quota   = document.getElementById("quota");
const $used    = document.getElementById("used");
const $drawBtn = document.getElementById("drawBtn");
const $error   = document.getElementById("errorMsg");
const $result  = document.getElementById("result");
const $cardName= document.getElementById("cardName");
const $cardImg = document.getElementById("cardImg");
const $debug   = document.getElementById("debug");

// ========== 工具 ==========
const TZ = 'Asia/Taipei';
function todayKey() {
  const now = new Date();
  const y = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric'}).format(now);
  const m = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, month:'2-digit'}).format(now);
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, day:'2-digit'}).format(now);
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}
function weekdayTaipei() {
  // 1-7 => 1=Mon ... 7=Sun（習慣用法，可依你 reminders 的定義調整）
  const wd = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday:'numeric' }).format(new Date()), 10);
  return wd === 0 ? 7 : wd; // 防呆：某些實作會回 0
}
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function logDebug(obj, title="DEBUG"){
  try{
    const now = new Date().toLocaleString('zh-TW', { timeZone: TZ });
    const prev = $debug.textContent ? $debug.textContent + "\n\n" : "";
    $debug.textContent = `${prev}[${now}] ${title}:\n${JSON.stringify(obj, null, 2)}`;
  }catch(e){}
}
function showError(msg){
  $error.textContent = msg || "";
}

// ========== 抽卡邏輯 ==========
async function fetchCards() {
  const resp = await fetch(CARDS_JSON_URL);
  if (!resp.ok) throw new Error(`讀取 cards.json 失敗：${resp.status}`);
  return resp.json(); // 期待格式：[{id,name,image,rarity,weight}, ...]
}

function randomPickByWeight(items) {
  // items: { weight: number }
  const total = items.reduce((s,it)=>s+(it.weight||1), 0);
  let r = Math.random() * total;
  for (const it of items){
    r -= (it.weight||1);
    if (r <= 0) return it;
  }
  return items[items.length-1];
}

function computeQuota({ totalPlans, completedCount }){
  // 規則：保底 1 + 完成度≥80% +（當日計畫≥3 且 100% 再 +1），上限 3
  const base = 1;
  const rate = totalPlans > 0 ? (completedCount/totalPlans) : 0;
  let q = base;
  if (rate >= 0.8) q += 1;
  if (totalPlans >= 3 && completedCount === totalPlans) q += 1;
  return clamp(q, 1, 3);
}

// ========== 方案A：從 checkins/{uid}/days/{YYYYMMDD} 讀取 ==========
async function getTodayStatusFromCheckins(uid, dateKey){
  const ref = doc(db, CHECKIN_COLLECTION_ROOT, uid, "days", dateKey);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const total = Number(data.total_plans || 0);
  const done  = Number(data.completed_count || 0);
  return { totalPlans: total, completedCount: done, source: 'checkins' };
}

// ========== 方案B：從 reminders 推算（可刪） ==========
async function getTodayStatusFromReminders(uid, dateKey){
  // 假設 reminders 有 userId 欄、active、scheduleDays（1-7），logs[dateKey] = true/false
  const qq = query(
    collection(db, REMINDER_COLLECTION),
    where("userId","==", uid),
    where("active","==", true)
  );
  const cursor = await getDocs(qq);
  let total = 0, done = 0;
  const wk = weekdayTaipei();
  cursor.forEach(docSnap=>{
    const r = docSnap.data() || {};
    const days = r.scheduleDays || [];
    const isTodayPlanned = days.includes(wk) || days.includes(String(wk));
    if (isTodayPlanned) {
      total += 1;
      const logs = r.logs || {};
      if (logs[dateKey] === true) done += 1;
    }
  });
  if (total === 0) return null; // 沒有計畫就回 null 讓 A 方案接手
  return { totalPlans: total, completedCount: done, source: 'reminders' };
}

// ========== 讀/寫當日抽卡計數 ==========
function drawDocRef(uid, dateKey){
  return doc(db, "users", uid, DRAWS_SUBCOL, dateKey);
}
async function readDailyDraw(uid, dateKey){
  const snap = await getDoc(drawDocRef(uid, dateKey));
  return snap.exists() ? snap.data() : null;
}
async function initDailyDrawIfNeeded(uid, dateKey, quota, meta){
  const ref = drawDocRef(uid, dateKey);
  await setDoc(ref, {
    quota,
    used: 0,
    history: [], // { cardId, name, image, ts }
    computed_from: meta, // { totalPlans, completedCount, source }
    updatedAt: serverTimestamp()
  }, { merge: true });
}
async function tryConsumeDraw(uid, dateKey){
  const ref = drawDocRef(uid, dateKey);
  await runTransaction(db, async (tx)=>{
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("今日抽卡資料不存在");
    const data = snap.data();
    const { quota=1, used=0 } = data;
    if (used >= quota) throw new Error("抽卡次數已用完");
    tx.update(ref, { used: increment(1), updatedAt: serverTimestamp() });
  });
}
async function appendHistory(uid, dateKey, record){
  const ref = drawDocRef(uid, dateKey);
  await runTransaction(db, async (tx)=>{
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("今日抽卡資料不存在");
    const data = snap.data();
    const history = Array.isArray(data.history) ? data.history : [];
    history.push(record);
    tx.update(ref, { history, updatedAt: serverTimestamp() });
  });
}

// ========== 主流程 ==========
async function main(){
  try{
    showError("");
    $drawBtn.disabled = true;

    // 1) LIFF
    if (!liff.isInClient()) {
      // 仍可用 LIFF（web）登入
    }
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    const prof = await liff.getProfile();
    const uid  = prof.userId;
    const dateKey = todayKey();

    logDebug({ uid, dateKey }, "LIFF");

    // 2) 抓當日完成度 → 算 quota
    let status = await getTodayStatusFromCheckins(uid, dateKey);
    if (!status){
      // fallback：若你還沒做 checkins 匯總，可先用 reminders 推估
      status = await getTodayStatusFromReminders(uid, dateKey);
    }
    // 若兩個來源都沒有，就當成「今日無設定計畫」：保底 1
    const totalPlans = status ? status.totalPlans : 0;
    const completed  = status ? status.completedCount : 0;
    const quota = computeQuota({ totalPlans, completedCount: completed });

    // 3) 初始化/讀取今日抽卡檔
    const existing = await readDailyDraw(uid, dateKey);
    if (!existing){
      await initDailyDrawIfNeeded(uid, dateKey, quota, {
        totalPlans, completedCount: completed, source: status?.source || "none"
      });
    }else{
      // 若 quota 算法更新、或完成度改變，可選擇同步（避免使用者「晚簽到」時 quota 沒更新）
      const shouldSyncQuota = typeof existing.quota !== 'number' || existing.quota !== quota;
      if (shouldSyncQuota){
        await updateDoc(drawDocRef(uid, dateKey), {
          quota, computed_from: { totalPlans, completedCount: completed, source: status?.source || "none" },
          updatedAt: serverTimestamp()
        });
      }
    }

    // 4) 顯示 UI
    const nowDoc = await readDailyDraw(uid, dateKey);
    const used = Number(nowDoc?.used || 0);
    $quota.textContent = String(nowDoc?.quota ?? quota);
    $used.textContent  = String(used);
    $drawBtn.disabled  = used >= (nowDoc?.quota ?? quota);

    // 5) 綁定抽卡
    const cards = await fetchCards();
    $drawBtn.onclick = async ()=>{
      try{
        showError("");
        // 5-1) 交易扣次（防重入）
        await tryConsumeDraw(uid, dateKey);

        // 5-2) 隨機抽卡
        const item = randomPickByWeight(cards);
        // 5-3) 存歷史
        const record = {
          cardId: item.id || item.name || Math.random().toString(36).slice(2),
          name: item.name || "卡片",
          image: item.image,
          rarity: item.rarity || "common",
          ts: Date.now()
        };
        await appendHistory(uid, dateKey, record);

        // 5-4) 更新 UI
        $cardName.textContent = record.name;
        $cardImg.src = record.image;
        $result.classList.remove("hidden");

        // 5-5) 重新讀 used/quota
        const after = await readDailyDraw(uid, dateKey);
        $quota.textContent = String(after?.quota ?? quota);
        $used.textContent  = String(after?.used ?? (used+1));
        $drawBtn.disabled  = (after?.used ?? (used+1)) >= (after?.quota ?? quota);

        logDebug({ picked: record, after }, "抽卡成功");
      }catch(err){
        console.error(err);
        showError(err.message || "抽卡失敗，請稍後再試");
        logDebug({ error: String(err) }, "抽卡失敗");
      }
    };

    logDebug({ status, quotaShown: $quota.textContent, usedShown: $used.textContent }, "初始化完成");
  }catch(err){
    console.error(err);
    showError("初始化失敗，請重新整理或稍後再試");
    logDebug({ error: String(err) }, "初始化錯誤");
  }
}

// 等 LIFF SDK 可用再啟動
document.addEventListener("DOMContentLoaded", () => {
  // 若你的 LIFF 需 init，請在這裡補上 liff.init({ liffId: '...' })
  // 你的其他頁面應該已做過；若本頁獨立，請取消下行註解並填入：
  // liff.init({ liffId: '你的LIFF ID' }).then(main);
  // 如果專案已全域 init，直接跑 main：
  main();
});
