// my-tasks.js
// 功能重點：
// 1) 導航優先（避免誤觸上傳）
// 2) 目的地雙保險：lat,lng → city+district+road / hospital
// 3) 上傳回報：單筆上傳 & 快速上傳（★ 上傳成功 → 標記完成 + 關閉聊天室）
// 4) 列表即時：監聽 requests，依 volunteerId 過濾
// 5) 取消配對（選擇原因→確認→回退 pending、清 volunteerId、紀錄取消資訊 → ★ 關閉聊天室）

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, updateDoc, collection, query, where, onSnapshot, orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";

// ===== 初始化 =====
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const st  = getStorage(app);
const LIFF_ID = "2007877199-Y5R2LenL";

// ★ Functions：closeMatch（臨時聊天室關閉）
const functions = getFunctions(app);
const closeMatch = httpsCallable(functions, "closeMatch");

// ===== 小工具與 DOM =====
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const container = document.getElementById("myTaskContainer");
const emptyHint = document.getElementById("emptyStateHint");

// 取消配對 modal 元件
const cancelModal = document.getElementById("cancelModal");
const cancelReasonSel = document.getElementById("cancelReason");
const cancelNoteEl = document.getElementById("cancelNote");
const cancelBackBtn = document.getElementById("cancelCancelBtn");
const cancelConfirmBtn = document.getElementById("confirmCancelBtn");
let pendingCancelTaskId = null;

function openCancelModal(taskId){
  pendingCancelTaskId = taskId;
  cancelReasonSel.value = "";
  cancelNoteEl.value = "";
  cancelModal.classList.add("show");
}
function closeCancelModal(){
  pendingCancelTaskId = null;
  cancelModal.classList.remove("show");
}
cancelBackBtn?.addEventListener("click", closeCancelModal);
cancelModal?.addEventListener("click", (e)=>{ if(e.target===cancelModal) closeCancelModal(); });

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
  return (String(d.status||'').toLowerCase()==='completed') ? 'done' : 'active';
}

// ===== 導航 =====
function tryOpenMapsFrom(btn){
  const lat = parseFloat(btn.dataset.lat);
  const lng = parseFloat(btn.dataset.lng);
  const q   = (btn.dataset.q || "").trim();

  if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    if (window.liff && liff.isInClient()) liff.openWindow({ url, external: true });
    else window.open(url, "_blank", "noopener");
    return true;
  }
  if (q) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}&travelmode=driving`;
    if (window.liff && liff.isInClient()) liff.openWindow({ url, external: true });
    else window.open(url, "_blank", "noopener");
    return true;
  }
  alert("這筆任務缺少可導航的資訊（經緯度或地址/醫院）。");
  return false;
}

// 🚫 防止導航被其他 click 處理器攔截（使用捕獲階段）
container.addEventListener('click', (e) => {
  const navBtn = e.target.closest('button.nav-meet, button.nav-hospital');
  if (!navBtn) return;
  e.preventDefault();
  e.stopPropagation();
  if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
  tryOpenMapsFrom(navBtn);
}, true);

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
      <div class="flex items-center gap-2 flex-wrap">
        <button type="button" class="choose-photo bg-gray-100 px-3 py-1 rounded border" data-id="${taskId}">選擇照片</button>
        <button type="button" class="upload-btn bg-green-600 text-white px-3 py-1 rounded" data-id="${taskId}">上傳回報照片</button>

        ${uiStatus==='active' ? `
          <button type="button" class="cancel-match px-3 py-1 rounded-full border font-bold"
                  style="background:#fff;color:#b42318;border:1px solid #f3c2bf;"
                  data-id="${taskId}">
            取消配對
          </button>` : ``}
      </div>
    </div>

    ${data.photoURL ? `
      <div class="mt-2">
        <img src="${data.photoURL}" class="w-40 h-auto rounded object-contain border" style="max-height: 220px;" />
        <button type="button" class="delete-photo text-red-500 text-sm mt-2 underline" data-url="${data.photoURL}" data-id="${taskId}">刪除圖片</button>
      </div>
    ` : ""}

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
  const ok = await ensureLIFF();
  if (!ok) return;
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

  // 監聽我的任務
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
  return new Promise((resolve, reject) => {
    try{
      const key = `[${taskId}]`;
      const prog = container.querySelector(`progress[data-id="${taskId}"]`);
      const input = container.querySelector(`input[type="file"][data-id="${taskId}"]`);
      const ref = storageRef(st, reportPath(taskId, file));
      const task = uploadBytesResumable(ref, file);
      if (prog) { prog.classList.remove("hidden"); prog.value = 0; }

      task.on("state_changed",
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          if (prog) prog.value = pct;
        },
        (err) => {
          console.error(key, err);
          if (prog) prog.classList.add("hidden");
          reject(err);
        },
        async () => {
          if (prog) { prog.value = 100; setTimeout(()=>prog.classList.add("hidden"), 400); }
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
          if (input) input.value = "";
        }
      );
    }catch(e){
      reject(e);
    }
  });
}

async function attachPhotoURL(taskId, url){
  const docRef = doc(db, "requests", taskId);
  await updateDoc(docRef, {
    photoURL: url,
    status: "completed",
    updatedAt: serverTimestamp()
  });

  // ★ 閉臨時聊天室（理由：report_uploaded）
  try {
    await closeMatch({ taskId, reason: "report_uploaded", by: "volunteer" });
    console.log("[closeMatch] done after upload:", taskId);
  } catch (e) {
    console.warn("[closeMatch] failed after upload:", e);
  }
}

async function deletePhoto(taskId, url){
  try{
    const ref = storageRef(st, url);
    await deleteObject(ref).catch(()=>{});
    const docRef = doc(db, "requests", taskId);
    await updateDoc(docRef, { photoURL: "", updatedAt: serverTimestamp() });
  }catch(e){
    console.error("[deletePhoto] error:", e);
    alert("刪除失敗，請稍後重試");
  }
}

// ===== 事件代理（導航、上傳、取消） =====
container.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  // 導航：優先 & 阻止冒泡（冗餘保險，與捕獲監聽一起守護）
  if (btn.classList.contains("nav-meet") || btn.classList.contains("nav-hospital")) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    tryOpenMapsFrom(btn);
    return;
  }

  // 選擇照片
  if (btn.classList.contains("choose-photo")) {
    const taskId = btn.dataset.id || btn.getAttribute("data-id");
    const input = container.querySelector(`input[type="file"][data-id="${taskId}"]`);
    if (input) input.click();
    return;
  }

  // 上傳回報照片 → attachPhotoURL 內會：標記完成 + closeMatch
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
      input.value = "";
      alert("上傳完成並已關閉聊天室！");
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
    try{
      await deletePhoto(taskId, url);
      alert("已刪除");
    }catch{}
    return;
  }

  // 取消配對（先開 modal 填原因）
  if (btn.classList.contains("cancel-match")) {
    const taskId = btn.dataset.id || btn.getAttribute("data-id");
    if (!taskId) return;
    openCancelModal(taskId);
    return;
  }
});

// 確認取消配對 → 回退 pending + closeMatch
cancelConfirmBtn?.addEventListener("click", async () => {
  if (!pendingCancelTaskId) return;
  const reason = (cancelReasonSel?.value || "").trim();
  const note   = (cancelNoteEl?.value || "").trim();

  if (!reason) { alert("請先選擇取消原因"); return; }
  if (!confirm("確認要取消這筆配對嗎？")) return;

  try{
    // 將任務回退到待接任務
    const tRef = doc(db, "requests", pendingCancelTaskId);
    await updateDoc(tRef, {
      status: "pending",
      volunteerId: "",
      canceledBy: currentUID,
      canceledByRole: "volunteer",
      cancelReason: reason,
      cancelNote: note,
      canceledAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // ★ 關閉臨時聊天室（理由：volunteer_cancel）
    try {
      await closeMatch({ taskId: pendingCancelTaskId, reason: "volunteer_cancel", by: "volunteer" });
      console.log("[closeMatch] done after cancel:", pendingCancelTaskId);
    } catch (e) {
      console.warn("[closeMatch] failed after cancel:", e);
    }

    closeCancelModal();
    alert("已取消配對，任務已回到待接列表。");
  }catch(e){
    console.error("[cancel] error:", e);
    alert("取消失敗，請稍後重試");
  }
});

// ===== 快速上傳（多檔 → 單筆任務） =====
export const quickReport = async (taskId, files) => {
  if (!taskId || !files?.length) { alert("請選擇任務與檔案"); return; }
  const first = files[0];
  const url = await uploadSingle(taskId, first);
  await attachPhotoURL(taskId, url); // 內含：標記完成 + closeMatch
  alert("回報已上傳並關閉聊天室！");
};

// ===== 啟動 =====
(async () => {
  try { await guardAndLoad(); }
  catch (e) {
    console.error("[my-tasks] fatal:", e);
    alert("讀取任務失敗，請重新開啟頁面");
  }
})();
