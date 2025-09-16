// my-tasks.js — 任務列表 + 導航 + 回報照片上傳（task_reports/<taskId>/...）
// 依賴：firebase-config.js（同目錄）提供 firebaseConfig、以及 LIFF 環境

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, updateDoc,
  collection, query, where, onSnapshot, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// ✅ Functions（closeMatch）
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// === 你專案的 LIFF ID（沿用你之前提供的） ===
const LIFF_ID = "2007877199-Y5R2LenL";
const HISTORY_URL = "task-history.html";

// ✅ 只初始化一次（避免 default app already exists / 匿名登入失敗）
const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const st   = getStorage(app);
const auth = getAuth(app);

// ✅ 初始化 closeMatch callable（asia-east1）
const functions = getFunctions(app, "asia-east1");
const closeMatch = httpsCallable(functions, "closeMatch");

// DOM
const container = document.getElementById("myTaskContainer");
const emptyHint = document.getElementById("emptyStateHint");

// 狀態過濾
const fAll  = document.getElementById('filterAll');
const fAct  = document.getElementById('filterActive');
const fDone = document.getElementById('filterDone');
let currentFilter = 'all';

// 取消配對 Modal
const cancelModal  = document.getElementById('cancelModal');
const cancelInfoEl = document.getElementById('cancelTaskInfo');
const cancelOther  = document.getElementById('cancelOther');
const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');
const cancelCancelBtn  = document.getElementById('cancelCancelBtn');
let   pendingCancelTaskId = null;
let   pendingCancelMatchId = null;   // ✅ 新增：快取 matchId
let   currentVolunteerUid = null;

// 工具
const safe = (v)=> (v==null ? "" : String(v));
function getTs(t){
  try{
    if(!t) return NaN;
    if(typeof t==='number') return t;
    if(typeof t==='string'){ const ms = Date.parse(t); return isNaN(ms)?NaN:ms; }
    if (t?.seconds!=null) return t.seconds*1000 + Math.floor((t.nanoseconds||0)/1e6);
    if (typeof t?.toDate==='function')  return t.toDate().getTime();
    return NaN;
  }catch{ return NaN; }
}
const fmtTime = (t)=>{ const ms=getTs(t); return isNaN(ms)?'—':new Date(ms).toLocaleString(); };
const composeAddress = (d)=> `${safe(d.city)}${safe(d.district)}${safe(d.road)}`.trim();
const computeStatus = (d)=> (String(d.status||'').toLowerCase()==='completed') ? 'done' : 'active';

// 導航（捕獲階段先攔，避免被其他 click 代理吃掉）
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-meet, .nav-hospital");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

  const norm = (v)=> (v==null ? "" : String(v).trim());
  const toNum = (s)=>{
    if (s === undefined || s === null) return NaN;
    const t = String(s).trim().toLowerCase();
    if (t === "" || t === "null" || t === "undefined") return NaN;
    return parseFloat(t);
  };
  const safeOpen = (url)=>{
    try{
      if (window.liff && typeof liff.isInClient === "function" && liff.isInClient()){
        liff.openWindow({ url, external: true });
      }else{
        const w = window.open(url, "_blank", "noopener");
        if (!w) location.href = url;
      }
      return true;
    }catch(_){
      location.href = url;
      return true;
    }
  };

  const lat = toNum(btn.dataset.lat);
  const lng = toNum(btn.dataset.lng);
  const q   = norm(btn.dataset.q);

  if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    safeOpen(url);
    return;
  }
  if (q) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}&travelmode=driving`;
    safeOpen(url);
    return;
  }
  alert("這筆任務缺少可導航的資訊（經緯度或地址/醫院）。");
}, { capture: true });

// 產生任務卡
const NAV_BTN_CLASS = "px-3 py-1.5 rounded-full border font-bold";
const NAV_BTN_STYLE = "background:#588157;color:#fff;border:1px solid #588157;";

function renderTaskCard(docSnap){
  const data = docSnap.data();
  const taskId = docSnap.id;

  const card = document.createElement("div");
  card.className = "task-card bg-white p-4 rounded-xl shadow space-y-2";
  card.dataset.taskId = taskId;
  card.dataset.matchId = data.matchId || "";   // ✅ 確保卡片帶有 matchId

  const uiStatus = computeStatus(data);
  card.dataset.status = uiStatus; // ★ 過濾依據

  const lat = typeof data.lat==='number' ? data.lat
            : typeof data.meetLat==='number' ? data.meetLat
            : (data.meet && typeof data.meet.lat==='number' ? data.meet.lat : null);
  const lng = typeof data.lng==='number' ? data.lng
            : typeof data.meetLng==='number' ? data.meetLng
            : (data.meet && typeof data.meet.lng==='number' ? data.meet.lng : null);

  const meetAddress = composeAddress(data);
  const hospitalQ = (safe(data.hospital) || '').trim()
    || `${composeAddress(data)} ${safe(data.city)}`.trim();

  card.innerHTML = `
    <h2 class="task-title text-lg font-bold">📍 ${meetAddress || "未提供地址"}</h2>
    <div class="text-[15px]">🏥 醫院／藥局：${safe(data.hospital) || "未提供"}</div>
    ${data.accompany ? `<div class="text-[15px]">🙋‍♀️ 陪同進診間：${safe(data.accompany)}</div>` : ""}
    <div class="text-[15px]">類型：${safe(data.type) || "-"}</div>
    <div class="text-[15px]">🕒 時間：${fmtTime(data.time)}</div>
    <div class="text-[15px]">📝 備註：${safe(data.note) || "無"}</div>

    <div class="mt-2 flex flex-wrap gap-2">
      <button type="button"
              class="nav-meet ${NAV_BTN_CLASS}"
              style="${NAV_BTN_STYLE}"
              data-lat="${lat ?? ''}"
              data-lng="${lng ?? ''}"
              data-q="${meetAddress}">
        🧭 導航到會合地點
      </button>

      <button type="button"
              class="nav-hospital ${NAV_BTN_CLASS}"
              style="background:#f4f3ef;color:#588157;border:1px solid #e7e5dc;"
              data-q="${hospitalQ}">
        🏥 導航到醫院
      </button>

      <button type="button"
              class="cancel-match ${NAV_BTN_CLASS}"
              style="background:#fff;color:#c2410c;border:1px solid #f4b197;"
              data-id="${taskId}">
        ❌ 取消配對
      </button>
    </div>

    <div class="mt-2 space-y-2">
      <input type="file" accept="image/*" class="hidden" data-id="${taskId}" />
      <progress max="100" value="0" class="hidden w-full h-2 bg-gray-200 rounded" data-id="${taskId}"></progress>

      <div class="text-xs text-gray-500" data-role="file-hint" data-id="${taskId}">
        尚未選擇檔案
      </div>

      <div class="mt-1 hidden" data-role="preview" data-id="${taskId}">
        <img class="h-28 w-auto rounded border object-contain" />
      </div>

      <div class="flex items-center gap-2">
        <button type="button" class="choose-photo bg-gray-100 px-3 py-1 rounded border" data-id="${taskId}">
          選擇照片
        </button>
        <button type="button" class="upload-btn bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50"
                data-id="${taskId}" disabled>
          上傳回報照片
        </button>
      </div>
    </div>

    ${data.photoURL ? `
      <div class="mt-2">
        <img src="${data.photoURL}" class="w-40 h-auto rounded object-contain border" style="max-height: 220px;" />
        <button type="button" class="delete-photo text-red-500 text-sm mt-1" data-url="${data.photoURL}" data-id="${taskId}">刪除圖片</button>
      </div>` : ""}

    <p class="text-xs text-gray-500 mt-1">更新時間：${data.updatedAt ? fmtTime(data.updatedAt) : "尚未更新"}</p>
  `;
  return card;
}

// 讀取 & 監聽我的任務
let unsub = null;

async function ensureLIFF(){
  await liff.init({ liffId: LIFF_ID });
  if (!liff.isLoggedIn()) { location.href = "login.html"; return false; }
  return true;
}

async function guardAndLoad(){
  if (!await ensureLIFF()) return;
  const p = await liff.getProfile();
  const uid = `line:${p.userId}`;
  currentVolunteerUid = uid;

  const me = await getDoc(doc(db, "users", uid));
  if (!me.exists()) { location.href = "register-profile.html"; return; }

  const roles = me.data()?.roles;
  let isVolunteer = false;
  if (Array.isArray(roles)) {
    isVolunteer = roles.includes('志工') || roles.includes('volunteer');
  } else if (typeof roles === 'string') {
    const r = roles.trim(); isVolunteer = (r === '志工' || r === 'volunteer');
  } else if (roles && typeof roles === 'object') {
    isVolunteer = roles.志工 === true || roles.volunteer === true;
  }
  if (!isVolunteer) { location.href = "home.html"; return; }

  if (unsub) unsub();
  const q1 = query(
    collection(db, "requests"),
    where("volunteerId", "==", uid),
    orderBy("time", "desc")
  );
  unsub = onSnapshot(q1, (snap) => {
    container.innerHTML = "";
    let count = 0;
    snap.forEach(docSnap => { container.appendChild(renderTaskCard(docSnap)); count++; });
    emptyHint.classList.toggle("hidden", count !== 0);
    applyFilter(); // 渲染後依目前篩選狀態過濾
  }, (err)=> console.error("[my-tasks] onSnapshot error:", err));
}

// Storage 路徑
function uniqueName(original){
  const ext = (original.split('.').pop() || 'jpg').toLowerCase();
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  return `${stamp}-${Math.random().toString(36).slice(2,8)}.${ext}`;
}
function reportPath(taskId, file){
  const name = uniqueName(file.name || "report.jpg");
  return `task_reports/${taskId}/${name}`;
}

// 上傳 & 刪除
async function uploadSingle(taskId, file){
  const path = reportPath(taskId, file);
  const ref  = storageRef(st, path);
  const task = uploadBytesResumable(ref, file, { contentType: file.type || "image/jpeg" });

  const progressEl = container.querySelector(`progress[data-id="${taskId}"]`);
  if (progressEl) { progressEl.classList.remove("hidden"); progressEl.value = 0; }

  return new Promise((resolve, reject) => {
    task.on('state_changed',
      (snap) => {
        if (progressEl) {
          const pct = Math.round(100 * snap.bytesTransferred / snap.totalBytes);
          progressEl.value = pct;
        }
      },
      (err) => { if (progressEl) progressEl.classList.add("hidden"); reject(err); },
      async () => {
        try{
          const url = await getDownloadURL(task.snapshot.ref);
          if (progressEl) progressEl.classList.add("hidden");
          resolve(url);
        }catch(e){ reject(e); }
      }
    );
  });
}

async function attachPhotoURL(taskId, url){
  await updateDoc(doc(db, "requests", taskId), {
    photoURL: url,
    status: "completed",     // 上傳即完成
    completedAt: Date.now(),
    updatedAt: Date.now()
  });
}

// 解析 downloadURL → Storage 參考（刪除較穩）
function refFromDownloadURL(url){
  const m = String(url).match(/\/o\/([^?]+)/);
  if (!m) return null;
  const path = decodeURIComponent(m[1]); // e.g. task_reports/<taskId>/<file>
  return storageRef(st, path);
}

async function deletePhoto(taskId, url){
  try{
    const ref = refFromDownloadURL(url) || storageRef(st, url);
    await deleteObject(ref).catch(()=>{});
    await updateDoc(doc(db, "requests", taskId), { photoURL: "", updatedAt: Date.now() });
  }catch(e){
    console.error("[deletePhoto] error:", e);
    alert("刪除失敗，請稍後重試");
  }
}

// 事件代理（上傳/刪除／取消配對）
container.addEventListener("click", async (e) => {
  if (e.target.closest(".nav-meet, .nav-hospital")) return;

  const btn = e.target.closest("button");
  if (!btn) return;

  if (btn.classList.contains("cancel-match")) {
    pendingCancelTaskId = btn.dataset.id || btn.getAttribute("data-id");
    const card = btn.closest('.task-card');
    pendingCancelMatchId = card?.dataset.matchId || "";   // ✅ 新增：先快取 matchId

    const title = card?.querySelector('.task-title')?.textContent || `任務 ${pendingCancelTaskId}`;
    cancelInfoEl.textContent = title;
    cancelModal.querySelectorAll('.cr').forEach(c => c.checked = false);
    cancelOther.value = '';
    cancelModal.classList.add('show');
    return;
  }

  if (btn.classList.contains("choose-photo")) {
    const taskId = btn.dataset.id || btn.getAttribute("data-id");
    const input = container.querySelector(`input[type="file"][data-id="${taskId}"]`);
    if (input) input.click();
    return;
  }

  if (btn.classList.contains("upload-btn")) {
    const taskId = btn.dataset.id || btn.getAttribute("data-id");
    const input  = container.querySelector(`input[type="file"][data-id="${taskId}"]`);
    const hint   = container.querySelector(`[data-role="file-hint"][data-id="${taskId}"]`);

    if (!input || !input.files || !input.files.length) {
      alert("請先選擇要上傳的照片");
      return;
    }
    try{
      btn.disabled = true;
      const oldLabel = btn.textContent;
      btn.textContent = "上傳中…";

      const file = input.files[0];
      const url  = await uploadSingle(taskId, file);
      await attachPhotoURL(taskId, url);

      // ✅ 上傳完成 → 立即關閉聊天室
      try {
        const card = btn.closest('.task-card');
        const matchId = card?.dataset.matchId || taskId;
        await closeMatch({ matchId, reason: "已完成並回報照片" });
      } catch (e) {
        console.warn("closeMatch 呼叫失敗（上傳後）", e);
      }

      input.value = "";
      btn.textContent = oldLabel;
      btn.disabled = true;
      if (hint) hint.textContent = "已上傳：回報照片完成";
      const previewWrap = container.querySelector(`[data-role="preview"][data-id="${taskId}"]`);
      if (previewWrap) previewWrap.classList.add("hidden");

      alert("上傳完成！即將前往任務歷史。");
      location.href = HISTORY_URL; // 導向歷史頁
    }catch(e){
      console.error("[upload-btn] error:", e);
      alert(`上傳失敗：${e.code || e.message || e}`);
      btn.textContent = "上傳回報照片";
      btn.disabled = false;
    }
    return;
  }

  if (btn.classList.contains("delete-photo")) {
    const taskId = btn.dataset.id || btn.getAttribute("data-id");
    const url    = btn.dataset.url || btn.getAttribute("data-url");
    if (!taskId || !url) return;
    if (!confirm("確定要刪除這張回報照片嗎？")) return;
    await deletePhoto(taskId, url);
    return;
  }
});

// 選檔預覽／啟用上傳鈕
container.addEventListener("change", (e) => {
  const input = e.target.closest('input[type="file"]');
  if (!input) return;

  const taskId = input.dataset.id;
  const hint = container.querySelector(`[data-role="file-hint"][data-id="${taskId}"]`);
  const previewWrap = container.querySelector(`[data-role="preview"][data-id="${taskId}"]`);
  const previewImg = previewWrap?.querySelector('img');
  const uploadBtn = container.querySelector(`.upload-btn[data-id="${taskId}"]`);

  if (!input.files || !input.files.length) {
    hint && (hint.textContent = "尚未選擇檔案");
    previewWrap && previewWrap.classList.add("hidden");
    if (uploadBtn) uploadBtn.disabled = true;
    return;
  }

  const f = input.files[0];
  const MAX_MB = 5;
  if (f.size > MAX_MB * 1024 * 1024) {
    alert(`檔案過大（${(f.size/1024/1024).toFixed(2)} MB），請小於 ${MAX_MB} MB。`);
    input.value = "";
    if (uploadBtn) uploadBtn.disabled = true;
    hint && (hint.textContent = "尚未選擇檔案");
    previewWrap && previewWrap.classList.add("hidden");
    return;
  }
  if (!f.type.startsWith("image/")) {
    alert("請選擇圖片檔。");
    input.value = "";
    if (uploadBtn) uploadBtn.disabled = true;
    hint && (hint.textContent = "尚未選擇檔案");
    previewWrap && previewWrap.classList.add("hidden");
    return;
  }

  const mb = (f.size / (1024 * 1024)).toFixed(2);
  hint && (hint.textContent = `${f.name} · ${mb} MB`);

  if (previewWrap && previewImg) {
    const reader = new FileReader();
    reader.onload = () => {
      previewImg.src = reader.result;
      previewWrap.classList.remove("hidden");
    };
    reader.readAsDataURL(f);
  }
  if (uploadBtn) uploadBtn.disabled = false;
});

// 取消配對 Modal 控制
cancelCancelBtn?.addEventListener('click', ()=> {
  cancelModal.classList.remove('show');
  pendingCancelTaskId = null;
  pendingCancelMatchId = null;   // ✅ 新增：清快取
});
cancelModal?.addEventListener('click', (e)=> {
  if (e.target === cancelModal) {
    cancelModal.classList.remove('show');
    pendingCancelTaskId = null;
    pendingCancelMatchId = null; // ✅ 新增：清快取
  }
});
cancelConfirmBtn?.addEventListener('click', async ()=> {
  if (!pendingCancelTaskId || !currentVolunteerUid) return;

  const checks = Array.from(cancelModal.querySelectorAll('.cr')).filter(c => c.checked).map(c => c.value);
  const other  = (cancelOther.value || '').trim();
  const reasons = [...checks];
  if (other) reasons.push(`其他:${other}`);
  if (reasons.length === 0) {
    alert('請至少勾選或填寫一項取消原因');
    return;
  }

  try{
    await updateDoc(doc(db, "requests", pendingCancelTaskId), {
      status: "pending",
      volunteerId: "",
      cancelReason: reasons.join('；'),
      canceledBy: currentVolunteerUid,
      canceledAt: Date.now(),
      updatedAt: Date.now()
    });

    // ✅ 取消任務 → 立即關閉聊天室（優先 DOM，其次快取，最後退回 taskId）
    try {
      const cardEl  = document.querySelector(`.task-card[data-task-id="${pendingCancelTaskId}"]`);
      const matchId = (cardEl?.dataset.matchId) || pendingCancelMatchId || pendingCancelTaskId;
      await closeMatch({ matchId, reason: "志工/患者取消任務" });
    } catch (e) {
      console.warn("closeMatch 呼叫失敗（取消任務）", e);
    }

    alert('已取消配對，任務已回到待接清單。');
  }catch(e){
    console.error('[cancel-match] error:', e);
    alert('取消配對失敗，請稍後再試');
  }finally{
    cancelModal.classList.remove('show');
    pendingCancelTaskId = null;
    pendingCancelMatchId = null;   // ✅ 新增：清快取
  }
});

// 狀態過濾
function applyFilter(){
  const cards = container.querySelectorAll('.task-card');
  let visible = 0;
  cards.forEach(card => {
    const st = card.dataset.status; // 'active' | 'done'
    const ok = (currentFilter==='all') ||
               (currentFilter==='active' && st==='active') ||
               (currentFilter==='done'   && st==='done');
    card.style.display = ok ? '' : 'none';
    if (ok) visible++;
  });
  emptyHint.classList.toggle('hidden', visible !== 0);
}
function setFilter(key){
  currentFilter = key;
  fAll.classList.toggle('active', key==='all');
  fAct.classList.toggle('active', key==='active');
  fDone.classList.toggle('active', key==='done');
  applyFilter();
}
fAll?.addEventListener('click', ()=> setFilter('all'));
fAct?.addEventListener('click', ()=> setFilter('active'));
fDone?.addEventListener('click', ()=> setFilter('done'));

// 啟動：先匿名登入（滿足 Storage 規則）→ 載入列表 → 初始套用篩選
(async () => {
  try {
    try { await signInAnonymously(auth); } catch(_) {}
    await guardAndLoad();
    setFilter('all');
  } catch (e) {
    console.error("[my-tasks] fatal:", e);
    alert("讀取任務失敗，請重新開啟頁面");
  }
})();
