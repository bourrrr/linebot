// /newcard/js/knowledge-draw.js
// 需求：
// 1) 建議把 /newcard/cards-manifest.json 放在新卡系統目錄；若不在，程式會自動嘗試多個位置
// 2) /firebase-config.js 輸出 firebaseConfig、LIFF_ID
// 3) 頁面可用你的 LIFF 模擬器（免登入測試）

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, runTransaction, serverTimestamp,
  collection, query, where, getDocs, increment, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as storageRef, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig, LIFF_ID } from "../firebase-config.js";

// ================== 可調參數 ==================
const CHECKIN_COLLECTION_ROOT = "checkins";    // checkins/{uid}/days/{YYYY-MM-DD}
const REMINDER_COLLECTION     = "reminders";
const DRAWS_SUBCOL            = "daily_draws"; // users/{uid}/daily_draws/{YYYY-MM-DD}

// cards-manifest.json 會自動嘗試下列路徑（依序）
const CARDS_JSON_CANDIDATES = [
  "./cards-manifest.json",           // 相對於本檔（/newcard/js/）
  "../cards-manifest.json",          // 相對於 /newcard/
  "/newcard/cards-manifest.json",    // 明確 newcard 路徑
  "/cards-manifest.json"             // 網站根目錄
];

// Hosting 圖片候選前綴（依序嘗試）
const HOSTING_PREFIXES = [
  "/",                    // /knowledge/001.png 或 /images/knowledge/001.png
  "/newcard/",            // /newcard/knowledge/001.png
  "/images/",             // /images/knowledge/001.png（若 manifest 只有 knowledge/001.png，這條會組成 /images/knowledge/knowledge/001.png，被過濾掉）
  "/newcard/images/"      // /newcard/images/knowledge/001.png
];

// 如果 manifest 只有檔名（如 001.png），預設補的資料夾
const DEFAULT_IMAGE_DIR = "knowledge";

// ================== 初始化 ==================
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const storage = getStorage(app);

// ================== DOM ==================
const $quota    = document.getElementById("quota");
const $used     = document.getElementById("used");
const $drawBtn  = document.getElementById("drawBtn");
const $error    = document.getElementById("errorMsg");
const $result   = document.getElementById("result");
const $cardName = document.getElementById("cardName");
const $cardImg  = document.getElementById("cardImg");
const $debug    = document.getElementById("debug");

// ================== 工具 ==================
const TZ = "Asia/Taipei";
function todayKey() {
  const now = new Date();
  const y = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric" }).format(now);
  const m = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, month: "2-digit" }).format(now);
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, day: "2-digit" }).format(now);
  return `${y}-${m}-${d}`;
}
function weekdayTaipei() {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date());
  const map = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 };
  return map[s];
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function showError(msg) { if ($error) $error.textContent = msg || ""; }
function logDebug(obj, title = "DEBUG") {
  try {
    const now = new Date().toLocaleString("zh-TW", { timeZone: TZ });
    const prev = $debug?.textContent ? $debug.textContent + "\n\n" : "";
    if ($debug) $debug.textContent = `${prev}[${now}] ${title}:\n${JSON.stringify(obj, null, 2)}`;
    else console.log(`[${title}]`, obj);
  } catch {}
}

// ================== 抽數合併 ==================
const QUOTA_CAP = 3;
function drawDocRef(uid, dateKey) { return doc(db, "users", uid, DRAWS_SUBCOL, dateKey); }
async function mergeBaseQuota(uid, dateKey, baseQuota, meta) {
  const ref = drawDocRef(uid, dateKey);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      const init = {
        base_quota: clamp(baseQuota, 1, QUOTA_CAP),
        quota:      clamp(baseQuota, 1, QUOTA_CAP),
        used: 0,
        history: [],
        computed_from: meta,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      tx.set(ref, init, { merge: true });
      return init;
    }
    const data = snap.data() || {};
    const existedQuota = Number.isFinite(data.quota) ? data.quota : 1;
    const existedBase  = Number.isFinite(data.base_quota) ? data.base_quota : baseQuota;
    const bonus     = Math.max(0, existedQuota - existedBase);
    const newBase   = clamp(baseQuota, 1, QUOTA_CAP);
    const recompute = clamp(newBase + bonus, 1, QUOTA_CAP);
    const nextQuota = Math.max(existedQuota, recompute);
    if (nextQuota !== existedQuota || newBase !== existedBase) {
      tx.set(ref, {
        base_quota: newBase, quota: nextQuota,
        computed_from: meta, updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    return { ...data, base_quota: newBase, quota: nextQuota };
  });
}

// ================== 配額判定 & manifest 讀取 ==================
function computeQuota({ totalPlans, completedCount }) {
  let q = 1;
  const rate = (totalPlans > 0) ? (completedCount / totalPlans) : 0;
  if (rate >= 0.8) q += 1;
  if (totalPlans >= 3 && completedCount === totalPlans) q += 1;
  return clamp(q, 1, QUOTA_CAP);
}

async function fetchWithCandidates(candidates) {
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (resp.ok) return await resp.json();
    } catch {}
  }
  throw new Error("cards-manifest.json 無法讀取（檔案不在預設路徑）");
}

async function fetchCards() {
  const cards = await fetchWithCandidates(CARDS_JSON_CANDIDATES);
  logDebug({ candidates: CARDS_JSON_CANDIDATES, count: cards.length }, "cards.json loaded");
  return cards;
}

function randomPickByWeight(items) {
  const total = items.reduce((s, it) => s + (it.weight || 1), 0);
  let r = Math.random() * total;
  for (const it of items) { r -= (it.weight || 1); if (r <= 0) return it; }
  return items[items.length - 1];
}

// ================== 圖片 URL 解析 ==================
function normalizeImagePath(p) {
  let s = (p || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s) || s.startsWith("/")) return s; // 完整網址或絕對路徑
  if (!s.includes("/")) s = `${DEFAULT_IMAGE_DIR}/${s}`;       // 只有檔名 → 加資料夾
  return s.replace(/^\.?\//, "");                              // 去掉 "./"
}
function joinUrl(prefix, path) {
  const a = prefix.replace(/\/+$/, "");
  const b = path.replace(/^\/+/, "");
  return `${a}/${b}`;
}
async function tryHead(url) {
  try {
    const r = await fetch(url, { method: "HEAD", cache: "no-store" });
    return r.ok;
  } catch { return false; }
}
async function resolveImageUrl(imageField) {
  const raw = imageField || "";
  // 已是 http 或網站絕對路徑
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) {
    logDebug({ chosen: raw }, "resolveImageUrl: direct");
    return raw;
  }

  const p = normalizeImagePath(raw);

  // 生成 Hosting 候選（避免重複：像 /images/knowledge/ + knowledge/001.png）
  const hostingCandidates = [];
  for (const pre of HOSTING_PREFIXES) {
    if (pre.endsWith("/images/") && p.startsWith("images/")) continue;
    if (pre.endsWith("/newcard/images/") && p.startsWith("images/")) continue;
    hostingCandidates.push(joinUrl(pre, p));
  }

  // 一個一個 HEAD 檢查，命中就用
  for (const url of hostingCandidates) {
    if (await tryHead(url)) {
      logDebug({ chosen: url, tried: hostingCandidates }, "resolveImageUrl: hosting");
      return url;
    }
  }

  // Hosting 都找不到 → 改走 Storage（需注意規則）
  try {
    const ref = storageRef(storage, p); // 例如 knowledge/001.png 或 images/knowledge/001.png
    const url = await getDownloadURL(ref);
    logDebug({ chosen: url, storagePath: p }, "resolveImageUrl: storage");
    return url;
  } catch (e) {
    logDebug({ error: String(e), storagePath: p }, "resolveImageUrl: storage failed");
    throw new Error("圖片讀取失敗：請確認檔案實際路徑或 Storage 規則");
  }
}

// ================== 當日狀態來源 ==================
async function getTodayStatusFromCheckins(uid, dateKey) {
  const ref = doc(db, CHECKIN_COLLECTION_ROOT, uid, "days", dateKey);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const d = snap.data() || {};
  return { totalPlans: Number(d.total_plans || 0), completedCount: Number(d.completed_count || 0), source: "checkins" };
}
async function getTodayStatusFromReminders(uid, dateKey) {
  const qq = query(collection(db, REMINDER_COLLECTION), where("userId", "==", uid), where("active", "==", true));
  const cur = await getDocs(qq);
  let total = 0, done = 0;
  const wk = weekdayTaipei();
  cur.forEach((s) => {
    const r = s.data() || {};
    const days = r.scheduleDays || [];
    const planToday = days.includes(wk) || days.includes(String(wk));
    if (planToday) {
      total += 1;
      const logs = r.logs || {};
      if (logs[dateKey] === true) done += 1;
    }
  });
  if (total === 0) return null;
  return { totalPlans: total, completedCount: done, source: "reminders" };
}

// ================== 抽卡文件讀寫 ==================
async function readDailyDraw(uid, dateKey) {
  const snap = await getDoc(drawDocRef(uid, dateKey));
  return snap.exists() ? snap.data() : null;
}
async function tryConsumeDraw(uid, dateKey) {
  const ref = drawDocRef(uid, dateKey);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("今日抽卡資料不存在");
    const d = snap.data() || {};
    const { quota = 1, used = 0 } = d;
    if (used >= quota) throw new Error("抽卡次數已用完");
    tx.update(ref, { used: increment(1), updatedAt: serverTimestamp() });
  });
}
async function appendHistory(uid, dateKey, record) {
  const ref = drawDocRef(uid, dateKey);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("今日抽卡資料不存在");
    const d = snap.data() || {};
    const history = Array.isArray(d.history) ? d.history : [];
    history.push(record);
    tx.update(ref, { history, updatedAt: serverTimestamp() });
  });
}

// ================== 主流程 ==================
async function main() {
  try {
    showError(""); if ($drawBtn) $drawBtn.disabled = true;

    // 可用 LIFF 模擬或真 LIFF，兩者皆可
    if (typeof liff?.init === "function") {
      try { await liff.init({ liffId: LIFF_ID }); } catch {}
      if (typeof liff.isLoggedIn === "function" && !liff.isLoggedIn()) {
        if (typeof liff.login === "function") { liff.login(); return; }
      }
    }
    const prof = await (liff?.getProfile?.() ?? Promise.resolve({ userId: "DEV_FALLBACK" }));
    const uid = prof.userId || "DEV_FALLBACK";
    const dateKey = todayKey();

    // 1) 計算基礎抽數
    let status = await getTodayStatusFromCheckins(uid, dateKey);
    if (!status) status = await getTodayStatusFromReminders(uid, dateKey);
    const totalPlans = status?.totalPlans || 0;
    const completed  = status?.completedCount || 0;
    const baseQuota  = computeQuota({ totalPlans, completedCount: completed });

    // 2) 合併/建立抽卡文件
    const merged = await mergeBaseQuota(uid, dateKey, baseQuota, { totalPlans, completedCount: completed, source: status?.source || "none" });
    const nowDoc = await readDailyDraw(uid, dateKey);
    const used = Number(nowDoc?.used || 0);
    if ($quota) $quota.textContent = String(nowDoc?.quota ?? merged.quota ?? baseQuota);
    if ($used)  $used.textContent  = String(used);
    if ($drawBtn) $drawBtn.disabled = used >= (nowDoc?.quota ?? merged.quota ?? baseQuota);

    onSnapshot(drawDocRef(uid, dateKey), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data() || {};
      const q = Number(d.quota ?? 1), u = Number(d.used ?? 0);
      if ($quota) $quota.textContent = String(q);
      if ($used)  $used.textContent  = String(u);
      if ($drawBtn) $drawBtn.disabled = u >= q;
    });

    // 3) 綁定抽卡
    const cards = await fetchCards();
    if ($drawBtn) {
      $drawBtn.onclick = async () => {
        try {
          showError("");
          await tryConsumeDraw(uid, dateKey);
          const item = randomPickByWeight(cards);
          const record = {
            cardId: item.id || item.name || Math.random().toString(36).slice(2),
            name: item.name || "卡片",
            image: item.image,
            rarity: item.rarity || "common",
            ts: Date.now(),
          };
          await appendHistory(uid, dateKey, record);

          const imgUrl = await resolveImageUrl(record.image);
          $cardName.textContent = record.name;
          $cardImg.src = imgUrl;
          $cardImg.alt = record.name || "知識圖片";
          $result.classList.remove("hidden");
        } catch (err) {
          console.error(err);
          showError(err.message || "抽卡失敗，請稍後再試");
        }
      };
    }

    logDebug({ uid, dateKey, totalPlans, completed, baseQuota }, "init done");
  } catch (err) {
    console.error(err);
    showError("初始化失敗，請重新整理或稍後再試");
    logDebug({ error: String(err) }, "init error");
  }
}

// ================== 啟動 ==================
document.addEventListener("DOMContentLoaded", async () => {
  try { await main(); }
  catch (e) {
    console.error("[init error]", e);
    // 簡易 fallback：給一個 DEV 假用戶
    window.liff = window.liff || {};
    liff.getProfile = async () => {
      let id = localStorage.getItem("dev_mock_uid");
      if (!id) { id = "DEV_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("dev_mock_uid", id); }
      return { userId: id, displayName: "DEV", pictureUrl: "" };
    };
    await main();
  }
});
