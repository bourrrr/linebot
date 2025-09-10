// /newcard/js/knowledge-draw.js
// 需求：
// 1) /newcard/cards-manifest.json（或改 fetch 路徑）
// 2) /firebase-config.js 輸出 firebaseConfig、LIFF_ID
// 3) HTML 先載入 <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp,
  collection, query, where, getDocs, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as storageRef, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig, LIFF_ID } from "../firebase-config.js";

// ========== ⚙️ 路徑設定（依你的部署調整） ==========
const CHECKIN_COLLECTION_ROOT = "checkins";   // checkins/{uid}/days/{YYYY-MM-DD}
const REMINDER_COLLECTION     = "reminders";  // 可選：若你用 reminders 推算
const DRAWS_SUBCOL            = "daily_draws";// users/{uid}/daily_draws/{YYYY-MM-DD}
const CARDS_JSON_URL          = "./cards-manifest.json"; // 若放根目錄，改成 "../cards-manifest.json"

// ========== 基礎初始化 ==========
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const storage = getStorage(app);

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
const TZ = "Asia/Taipei";
function todayKey() {
  const now = new Date();
  const y = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric" }).format(now);
  const m = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, month: "2-digit" }).format(now);
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, day: "2-digit" }).format(now);
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}
function weekdayTaipei() {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" })
              .format(new Date());
  const map = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 };
  return map[s];
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function logDebug(obj, title = "DEBUG") {
  try {
    const now = new Date().toLocaleString("zh-TW", { timeZone: TZ });
    const prev = $debug?.textContent ? $debug.textContent + "\n\n" : "";
    if ($debug) $debug.textContent = `${prev}[${now}] ${title}:\n${JSON.stringify(obj, null, 2)}`;
  } catch {}
}
function showError(msg) { if ($error) $error.textContent = msg || ""; }

// ========== 抽卡邏輯 ==========
async function fetchCards() {
  const resp = await fetch(CARDS_JSON_URL, { cache: "no-store" });
  if (!resp.ok) throw new Error(`讀取 cards.json 失敗：${resp.status}`);
  return resp.json(); // 期待格式：[{id,name,image,rarity,weight}, ...]
}
function randomPickByWeight(items) {
  const total = items.reduce((s, it) => s + (it.weight || 1), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= (it.weight || 1);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
function computeQuota({ totalPlans, completedCount }) {
  // 保底 1 + 完成度≥80% +（當日計畫≥3 且 100% 再 +1），上限 3
  const base = 1;
  const rate = totalPlans > 0 ? (completedCount / totalPlans) : 0;
  let q = base;
  if (rate >= 0.8) q += 1;
  if (totalPlans >= 3 && completedCount === totalPlans) q += 1;
  return clamp(q, 1, 3);
}

// ========== 解析卡圖路徑 → Storage 下載網址 ==========
async function resolveImageUrl(imageField) {
  if (!imageField) return "";
  const looksHttp = s => /^https?:\/\//i.test(s || "");
  const looksAbs  = s => /^\//.test(s || "");

  // 已是完整網址或網站絕對路徑，直接用
  if (looksHttp(imageField) || looksAbs(imageField)) return imageField;

  // 支援 "001.png" / "knowledge/001.png" / "images/knowledge/001.png"
  let path = (imageField || "").trim();
  if (!path.includes("/")) path = `knowledge/${path}`;        // "001.png" → "knowledge/001.png"
  if (!path.startsWith("images/")) path = `images/${path}`;   // → "images/knowledge/001.png"

  const ref = storageRef(storage, path);
  return await getDownloadURL(ref);
}

// ========== 方案A：從 checkins/{uid}/days/{YYYY-MM-DD} 讀取 ==========
async function getTodayStatusFromCheckins(uid, dateKey) {
  const ref = doc(db, CHECKIN_COLLECTION_ROOT, uid, "days", dateKey);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    totalPlans: Number(data.total_plans || 0),
    completedCount: Number(data.completed_count || 0),
    source: "checkins",
  };
}

// ========== 方案B：從 reminders 推算（可刪） ==========
async function getTodayStatusFromReminders(uid, dateKey) {
  const qq = query(
    collection(db, REMINDER_COLLECTION),
    where("userId", "==", uid),
    where("active", "==", true)
  );
  const cursor = await getDocs(qq);
  let total = 0, done = 0;
  const wk = weekdayTaipei();
  cursor.forEach((docSnap) => {
    const r = docSnap.data() || {};
    const days = r.scheduleDays || [];
    const isTodayPlanned = days.includes(wk) || days.includes(String(wk));
    if (isTodayPlanned) {
      total += 1;
      const logs = r.logs || {};
      if (logs[dateKey] === true) done += 1;
    }
  });
  if (total === 0) return null;
  return { totalPlans: total, completedCount: done, source: "reminders" };
}

// ========== 讀/寫當日抽卡計數 ==========
function drawDocRef(uid, dateKey) {
  return doc(db, "users", uid, DRAWS_SUBCOL, dateKey);
}
async function readDailyDraw(uid, dateKey) {
  const snap = await getDoc(drawDocRef(uid, dateKey));
  return snap.exists() ? snap.data() : null;
}
async function initDailyDrawIfNeeded(uid, dateKey, quota, meta) {
  await setDoc(drawDocRef(uid, dateKey), {
    quota,
    used: 0,
    history: [], // { cardId, name, image, rarity, ts }
    computed_from: meta,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
async function tryConsumeDraw(uid, dateKey) {
  const ref = drawDocRef(uid, dateKey);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("今日抽卡資料不存在");
    const data = snap.data();
    const { quota = 1, used = 0 } = data;
    if (used >= quota) throw new Error("抽卡次數已用完");
    tx.update(ref, { used: increment(1), updatedAt: serverTimestamp() });
  });
}
async function appendHistory(uid, dateKey, record) {
  const ref = drawDocRef(uid, dateKey);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("今日抽卡資料不存在");
    const data = snap.data();
    const history = Array.isArray(data.history) ? data.history : [];
    history.push(record);
    tx.update(ref, { history, updatedAt: serverTimestamp() });
  });
}

// ========== 主流程 ==========
async function main() {
  try {
    showError("");
    $drawBtn.disabled = true;

    // LIFF 已初始化
    const prof = await liff.getProfile();
    const uid = prof.userId;
    const dateKey = todayKey();
    logDebug({ uid, dateKey }, "LIFF OK");

    // 1) 抓當日完成度 → 算 quota
    let status = await getTodayStatusFromCheckins(uid, dateKey);
    if (!status) status = await getTodayStatusFromReminders(uid, dateKey);
    const totalPlans = status ? status.totalPlans : 0;
    const completed  = status ? status.completedCount : 0;
    const quota = computeQuota({ totalPlans, completedCount: completed });

    // 2) 初始化/讀取今日抽卡檔
    const existing = await readDailyDraw(uid, dateKey);
    if (!existing) {
      await initDailyDrawIfNeeded(uid, dateKey, quota, {
        totalPlans, completedCount: completed, source: status?.source || "none",
      });
    } else {
      const shouldSync = typeof existing.quota !== "number" || existing.quota !== quota;
      if (shouldSync) {
        await updateDoc(drawDocRef(uid, dateKey), {
          quota,
          computed_from: { totalPlans, completedCount: completed, source: status?.source || "none" },
          updatedAt: serverTimestamp(),
        });
      }
    }

    // 3) 顯示 UI
    const nowDoc = await readDailyDraw(uid, dateKey);
    const used = Number(nowDoc?.used || 0);
    $quota.textContent = String(nowDoc?.quota ?? quota);
    $used.textContent  = String(used);
    $drawBtn.disabled  = used >= (nowDoc?.quota ?? quota);

    // 4) 綁定抽卡
    const cards = await fetchCards();
    $drawBtn.onclick = async () => {
      try {
        showError("");
        await tryConsumeDraw(uid, dateKey); // 扣次

        const item = randomPickByWeight(cards); // 隨機抽
        const record = {
          cardId: item.id || item.name || Math.random().toString(36).slice(2),
          name: item.name || "卡片",
          image: item.image,                 // 原始路徑（可能是 "001.png"）
          rarity: item.rarity || "common",
          ts: Date.now(),
        };
        await appendHistory(uid, dateKey, record);

        // 轉成 Storage URL 再顯示
        const imgUrl = await resolveImageUrl(record.image);
        $cardName.textContent = record.name;
        $cardImg.src = imgUrl;
        $result.classList.remove("hidden");

        const after = await readDailyDraw(uid, dateKey);
        $quota.textContent = String(after?.quota ?? quota);
        $used.textContent  = String(after?.used ?? (used + 1));
        $drawBtn.disabled  = (after?.used ?? (used + 1)) >= (after?.quota ?? quota);

        logDebug({ picked: record, imgUrl, after }, "抽卡成功");
      } catch (err) {
        console.error(err);
        showError(err.message || "抽卡失敗，請稍後再試");
        logDebug({ error: String(err) }, "抽卡失敗");
      }
    };

    logDebug({ status, quotaShown: $quota.textContent, usedShown: $used.textContent }, "初始化完成");
  } catch (err) {
    console.error(err);
    showError("初始化失敗，請重新整理或稍後再試");
    logDebug({ error: String(err) }, "初始化錯誤");
  }
}

// ========== 啟動（含 LIFF 初始化與 fallback） ==========
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) { liff.login(); return; }
    await main();
  } catch (e) {
    console.error("[LIFF init error]", e);
    // 開發 fallback：沒有 LIFF 也能測
    window.liff = window.liff || {};
    liff.getProfile = async () => {
      let id = localStorage.getItem("dev_mock_uid");
      if (!id) {
        id = "DEV_" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem("dev_mock_uid", id);
      }
      return { userId: id, displayName: "DEV", pictureUrl: "" };
    };
    await main();
  }
});
