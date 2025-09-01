// my-tasks.js
// 功能重點：
// 1) 導航優先：點「導航」不會再誤觸上傳（stopPropagation / stopImmediatePropagation）
// 2) 目的地雙保險：優先 lat,lng；否則使用 city+district+road 或 hospital
// 3) 上傳回報：卡片內單筆上傳 &「快速上傳回報」都可用，完成後寫回 Firestore
// 4) 列表即時：監聽 requests，依 volunteerId 過濾，前端分流進行中/已完成
// 5) 欄位兼容：roles 陣列/字串/物件皆可；status 以 'completed' 判定已完成

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, updateDoc, collection, query, where, onSnapshot, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

// ===== 初始化 =====
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const st  = getStorage(app);
const LIFF_ID = "2007877199-Y5R2LenL";

// ===== 小工具 =====
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const container = document.getElementById("myTaskContainer");
const emptyHint = document.getElementById("emptyStateHint");

const safe = (v)=> (v==null ? "" : String(v));
function getTs(t){
  try{
    if(!t) return NaN;
    if(typeof t==='number') return t;
    if(typeof t==='string'){
      const ms = Date.parse(t); return isNaN(ms)?NaN:ms;
    }
    if (t.seconds) return t.seconds*1000 + Math.floor((t.nanoseconds||0)/1e6);
    if (t.toDate)  return t.toDate().getTime();
    return NaN;
  }catch{ return NaN; }
}
const fmtTime = (t)=>{ const ms=getTs(t); return isNaN(ms)?'—':new Date(ms).toLocaleString(); };

function composeAddress(d){
  const a = `${safe(d.city)}${safe(d.district)}${safe(d.road)}`.trim();
  return a || '';
}
function computeStatus(d){
  // UI 顯示用途：completed → 'done'，其餘視為 'active'
  return (String(d.status||'').toLowerCase()==='completed') ? 'done' : 'active';
}

// ===== 導航（優先，防冒泡） =====
function tryOpenMapsFrom(btn){
  const lat = parseFloat(btn.dataset.lat);
  const lng = parseFloat(btn.dataset.lng);
  const q   = (btn.dataset.q || "").trim();

  // 1) 優先經緯度
  if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    console.log('[NAV] open by latlng:', { lat, lng, url });
    if (window.liff && liff.isInClient()) liff.openWindow({ url, external: true });
    else window.open(url, "_blank", "noopener");
    return true;
  }
  // 2) 再用文字地址 / 醫院關鍵字
  if (q) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}&travelmode=driving`;
    console.log('[NAV] open by query:', { q, url });
    if (window.liff && liff.isInClient()) liff.openWindow({ url, external: true });
    else window.open(url, "_blank", "noopener");
    return true;
  }
  // 3) 都沒有 → 提醒
  console.warn('[NAV] no destination found on button:', btn);
  alert("這筆任務缺少可導航的資訊（經緯度或地址/醫院）。請確認任務的 city/district/road 或 hospital 欄位。");
  return false;
}

// ===== 產生卡片 =====
const NAV_BTN_CLASS = "px-3 py-1.5 rounded-full border font-bold";
const NAV_BTN_STYLE = "background:#588157;color:#fff;border:1px solid #588157;";

function renderTaskCard(docSnap){
  const data = docSnap.data();
  const taskId = docSnap.id;

  const card = document.createElement("div");
  card.className = "task-card bg-white p-4 rounded-xl shadow space-y-2";
  card.dataset.taskId = taskId;

  const uiStatus = computeStatus(data);
  card.dataset.status = uiStatus;

  // 經緯度欄位候選：請依你的實際欄位補充
  const lat = typeof data.lat==='number' ? data.lat
            : typeof data.meetLat==='number' ? data.meetLat
            : (data.meet && typeof data.meet.lat==='number' ? data.meet.lat : null);
  const lng = typeof data.lng==='number' ? data.lng
            : typeof data.meetLng==='number' ? data.meetLng
            : (data.meet && typeof data.meet.lng==='number' ? data.meet.lng : null);

  const meetAddress = composeAddress(data);
  const hospitalQ   = [safe(data.hospital), safe(data.city)].filter(Boolean).join(" ").trim();

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
    </div>

    <div class="mt-2 space-y-2">
      <input type="file" accept="image/*" class="hidden" data-id="${taskId}" />
      <progress max="100" value="0" class="hidden w-full h-2 bg-gray-200 rounded" data-id="${taskId}"></progress>
      <div class="flex items-center gap-2">
        <button type="button" class="choose-photo bg-gray-100 px-3 py-1 rounded border" data-id="${taskId}">選擇照片</button>
        <button type="button" class="upload-btn bg-green-600 text-white px-3 py-1 rounded" data-id="${taskId}">上傳回報照片</button>
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

// ===== 讀取 & 監聽我的任務 =====
let currentUID = null;
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
  currentUID = uid;

  const me = await getDoc(doc(db, "users", uid));
  if (!me.exists()) { location.href = "register-profile.html"; return; }

  // roles 兼容
  const roles = me.data()?.roles;
  let isVolunteer = false;
  if (Array.isArray(roles)) {
    isVolunteer = roles.includes('志工') || roles.includes('volunteer');
  } else if (typeof roles === 'string') {
    const r = roles.trim();
    isVolunteer = (r === '志工' || r === 'volunteer');
  } else if (roles && typeof roles === 'object') {
    isVolunteer = roles.志工 === true || roles.volunteer === true;
  }
  if (!isVolunteer) { location.href = "home.html"; return; }

  // 監聽我的任務（以 volunteerId 過濾，排序時間）
  if (unsub) unsub();
  const q1 = query(
    collection(db, "requests"),
    where("volunteerId", "==", uid),
    orderBy("time", "desc")
  );
  unsub = onSnapshot(q1, (snap) => {
    container.innerHTML = "";
    let count = 0;
    snap.forEach(docSnap => {
      container.appendChild(renderTaskCard(docSnap));
      count++;
    });
    emptyHint.classList.toggle("hidden", count !== 0);
  }, (err)=> {
    console.error("[my-tasks] onSnapshot error:", err);
  });
}

// ===== 檔名與 Storage path 工具 =====
function uniqueName(original){
  const ext = (original.split('.').pop() || 'jpg').toLowerCase();
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  return `${stamp}-${Math.random().toString(36).slice(2,8)}.${ext}`;
}
function reportPath(taskId, file){
  const name = uniqueName(file.name || "report.jpg");
  return `task_reports/${taskId}/${name}`;
}

// ===== 單卡上傳 & 刪除 =====
async function uploadSingle(taskId, file){
  const path = reportPath(taskId, file);
  const ref  = storageRef(st, path);
  const task = uploadBytesResumable(ref, file, { contentType: file.type || "image/jpeg" });

  const progressEl = container.querySelector(`progress[data-id="${taskId}"]`);
  if (progressEl) {
    progressEl.classList.remove("hidden");
    progressEl.value = 0;
  }

  return new Promise((resolve, reject) => {
    task.on('state_changed',
      (snap) => {
        if (progressEl) {
          const pct = Math.round(100 * snap.bytesTransferred / snap.totalBytes);
          progressEl.value = pct;
        }
      },
      (err) => {
        if (progressEl) progressEl.classList.add("hidden");
        reject(err);
      },
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
  const ref = doc(db, "requests", taskId);
  // 這裡簡單策略：存最後一次上傳為 photoURL；若你想存陣列，可改成 arrayUnion
  await updateDoc(ref, {
    photoURL: url,
    updatedAt: Date.now()
  });
}

async function deletePhoto(taskId, url){
  try{
    // 刪 Storage
    const ref = storageRef(st, url);
    // 若 url 是 gs:// 或 http(s) 完整網址，deleteObject 也可以處理
    await deleteObject(ref).catch(()=>{}); // 有些第三方網址無法刪，忽略錯誤

    // 清 Firestore 欄位
    const docRef = doc(db, "requests", taskId);
    await updateDoc(docRef, { photoURL: "", updatedAt: Date.now() });
  }catch(e){
    console.error("[deletePhoto] error:", e);
    alert("刪除失敗，請稍後重試");
  }
}

// ===== 事件代理（導航優先） =====
container.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  // ✅ 導航優先，並阻止事件往下（避免觸發上傳等）
  if (btn.classList.contains("nav-meet") || btn.classList.contains("nav-hospital")) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    tryOpenMapsFrom(btn);
    return;
  }

  // 選擇照片（打開 file input）
  if (btn.classList.contains("choose-photo")) {
    const taskId = btn.dataset.id || btn.getAttribute("data-id");
    const input = container.querySelector(`input[type="file"][data-id="${taskId}"]`);
    if (input) input.click();
    return;
  }

  // 上傳回報照片（用剛剛選的檔案）
  if (btn.classList.contains("upload-btn")) {
    const taskId = btn.dataset.id || btn.getAttribute("data-id");
    const input  = container.querySelector(`input[type="file"][data-id="${taskId}"]`);
    if (!input || !input.files || !input.files.length) {
      alert("請先選擇要上傳的照片");
      return;
    }
    try{
      const file = input.files[0];
      const url  = await uploadSingle(taskId, file);
      await attachPhotoURL(taskId, url);
      input.value = ""; // 清空
      alert("上傳完成！");
    }catch(e){
      console.error("[upload-btn] error:", e);
      alert("上傳失敗，請稍後再試");
    }
    return;
  }

  // 刪除圖片
  if (btn.classList.contains("delete-photo")) {
    const taskId = btn.dataset.id || btn.getAttribute("data-id");
    const url    = btn.dataset.url || btn.getAttribute("data-url");
    if (!taskId || !url) return;
    if (!confirm("確定要刪除這張回報照片嗎？")) return;
    await deletePhoto(taskId, url);
    return;
  }
});

// ===== 快速上傳回報（由 my-tasks.html 的小腳本呼叫） =====
window.handleQuickReportUpload = async (taskId, files) => {
  if (!taskId || !files || !files.length) throw new Error("缺少任務或檔案");
  // 這裡示範：以第一張為主（若要多張可改成依序上傳並存陣列）
  const first = files[0];
  const url = await uploadSingle(taskId, first);
  await attachPhotoURL(taskId, url);
  alert("回報已上傳！");
};

// ===== 啟動 =====
(async () => {
  try { await guardAndLoad(); }
  catch (e) {
    console.error("[my-tasks] fatal:", e);
    alert("讀取任務失敗，請重新開啟頁面");
  }
})();
