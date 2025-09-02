// my-tasks.js  (2025-09-02 修正版)
// 1) 導航保證開地圖 + 多欄位地址 fallback
// 2) 回報照片可上傳（含快速上傳橋接 window.handleQuickReportUpload）
// 3) 超時自動歸類已完成（並寫回 Firestore，關閉臨時聊天室）

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

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const st  = getStorage(app);
const functions = getFunctions(app);

// ---- 參數（可調）----
const LIFF_ID = "2007877199-Y5R2LenL";
const AUTO_COMPLETE_MIN = 0;          // 逾時幾分鐘後自動完成（0=時間一過就完成）
const AUTO_CLOSE_MATCH  = true;       // 自動完成時是否關閉臨時聊天室

const container = document.getElementById("myTaskContainer");
const emptyHint = document.getElementById("emptyStateHint");

// -- 取消配對 modal DOM --
const cancelModal = document.getElementById("cancelModal");
const cancelReasonSel = document.getElementById("cancelReason");
const cancelNoteEl    = document.getElementById("cancelNote");
const cancelBackBtn   = document.getElementById("cancelCancelBtn");
const cancelConfirmBtn= document.getElementById("confirmCancelBtn");
let pendingCancelTaskId = null;

const closeMatch = httpsCallable(functions, "closeMatch");

const safe = (v)=> (v==null ? "" : String(v));
function getTs(t){
  try{
    if(!t) return NaN;
    if(typeof t==='number') return t;
    if(typeof t==='string'){ const ms=Date.parse(t); return isNaN(ms)?NaN:ms; }
    if (t.seconds!=null) return t.seconds*1000 + Math.floor((t.nanoseconds||0)/1e6);
    if (t.toDate) return t.toDate().getTime();
    return NaN;
  }catch{ return NaN; }
}
const fmtTime = (t)=>{ const ms=getTs(t); return isNaN(ms)?'—':new Date(ms).toLocaleString(); };

// ---- 地址 fallback：city/district/road → meetCity/meetDistrict/meetRoad → meet.{city,district,road} → address/meetAddress/meetingAddress ----
function composeMeetAddress(d){
  const a1 = `${safe(d.city)}${safe(d.district)}${safe(d.road)}`.trim();
  if (a1) return a1;
  const a2 = `${safe(d.meetCity)}${safe(d.meetDistrict)}${safe(d.meetRoad)}`.trim();
  if (a2) return a2;
  const meet = d.meet || {};
  const a3 = `${safe(meet.city)}${safe(meet.district)}${safe(meet.road)}`.trim();
  if (a3) return a3;
  return safe(d.address || d.meetAddress || d.meetingAddress || "");
}

// ---- 判斷 UI 狀態（含逾時）----
function isTimePassed(d){
  const t = getTs(d.time);
  if (isNaN(t)) return false;
  return Date.now() > (t + AUTO_COMPLETE_MIN*60000);
}
function computeUIStatus(d){
  const status = String(d.status||'').toLowerCase();
  if (status === 'completed') return 'done';
  if (d.photoURL) return 'done';
  if (isTimePassed(d)) return 'done';
  return 'active';
}

// ---- 導航 ----
function openMapsBy(lat, lng, q){
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    if (window.liff && liff.isInClient()) liff.openWindow({ url, external:true }); else window.open(url, "_blank", "noopener");
    return true;
  }
  if (q) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}&travelmode=driving`;
    if (window.liff && liff.isInClient()) liff.openWindow({ url, external:true }); else window.open(url, "_blank", "noopener");
    return true;
  }
  alert("這筆任務缺少可導航的資訊（經緯度或地址）。");
  return false;
}

// 捕獲階段攔截：保證按鈕一點就開地圖，不被其他 click 邏輯吃掉
container.addEventListener('click', (e) => {
  const btn = e.target.closest('button.nav-meet, button.nav-hospital');
  if (!btn) return;
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();

  const lat = parseFloat(btn.dataset.lat);
  const lng = parseFloat(btn.dataset.lng);
  const q   = (btn.dataset.q||"").trim();
  openMapsBy(lat, lng, q);
}, true);

// ---- 卡片產生 ----
const NAV_BTN_CLASS = "px-3 py-1.5 rounded-full border font-bold";
const NAV_PRIMARY   = "background:#588157;color:#fff;border:1px solid #588157;";
function renderTaskCard(docSnap){
  const d = docSnap.data();
  const id = docSnap.id;

  // 多來源經緯度
  const lat = (typeof d.lat==='number') ? d.lat
            : (typeof d.meetLat==='number') ? d.meetLat
            : (d.meet && typeof d.meet.lat==='number') ? d.meet.lat : NaN;
  const lng = (typeof d.lng==='number') ? d.lng
            : (typeof d.meetLng==='number') ? d.meetLng
            : (d.meet && typeof d.meet.lng==='number') ? d.meet.lng : NaN;

  const meetAddress = composeMeetAddress(d);
  const hospitalQ   = [safe(d.hospital || d.pharmacy || d.hospitalName), safe(d.city || d.meetCity)].filter(Boolean).join(" ").trim();
  const uiStatus    = computeUIStatus(d);

  const card = document.createElement("div");
  card.className = "task-card bg-white p-4 rounded-xl shadow space-y-2";
  card.dataset.taskId = id;
  card.dataset.status = uiStatus;

  card.innerHTML = `
    <h2 class="task-title text-lg font-bold">📍 ${meetAddress || "未提供地址"}</h2>
    <div class="text-[15px]">🏥 醫院／藥局：${safe(d.hospital || d.pharmacy) || "未提供"}</div>
    ${d.accompany ? `<div class="text-[15px]">🙋‍♀️ 陪同進診間：${safe(d.accompany)}</div>` : ""}
    <div class="text-[15px]">類型：${safe(d.type) || "-"}</div>
    <div class="text-[15px]">🕒 時間：${fmtTime(d.time)}</div>
    <div class="text-[15px]">📝 備註：${safe(d.note) || "無"}</div>

    <div class="mt-2 flex flex-wrap gap-2">
      <button type="button"
              class="nav-meet ${NAV_BTN_CLASS}"
              style="${NAV_PRIMARY}"
              data-lat="${Number.isFinite(lat)?lat:''}"
              data-lng="${Number.isFinite(lng)?lng:''}"
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
      <input type="file" accept="image/*" class="hidden" data-id="${id}" />
      <progress max="100" value="0" class="hidden w-full h-2 bg-gray-200 rounded" data-id="${id}"></progress>
      <div class="flex items-center gap-2 flex-wrap">
        <button type="button" class="choose-photo bg-gray-100 px-3 py-1 rounded border" data-id="${id}">選擇照片</button>
        <button type="button" class="upload-btn bg-green-600 text-white px-3 py-1 rounded" data-id="${id}">上傳回報照片</button>

        ${uiStatus==='active' ? `
          <button type="button" class="cancel-match px-3 py-1 rounded-full border font-bold"
                  style="background:#fff;color:#b42318;border:1px solid #f3c2bf;"
                  data-id="${id}">
            取消配對
          </button>` : ``}
      </div>
    </div>

    ${d.photoURL ? `
      <div class="mt-2">
        <img src="${d.photoURL}" class="w-40 h-auto rounded object-contain border" style="max-height: 220px;" />
        <button type="button" class="delete-photo text-red-500 text-sm mt-2 underline" data-url="${d.photoURL}" data-id="${id}">刪除圖片</button>
      </div>
    ` : ""}

    <p class="text-xs text-gray-500 mt-1">更新時間：${d.updatedAt ? fmtTime(d.updatedAt) : "尚未更新"}</p>
  `;
  return card;
}

// ---- LIFF 守門 & 監聽任務 ----
let currentUID = null;
let unsub = null;
async function ensureLIFF(){
  await liff.init({ liffId: LIFF_ID });
  if (!liff.isLoggedIn()) { location.href = "login.html"; return false; }
  return true;
}

async function guardAndLoad(){
  if (!(await ensureLIFF())) return;
  const p = await liff.getProfile();
  const uid = `line:${p.userId}`;
  currentUID = uid;

  const me = await getDoc(doc(db, "users", uid));
  if (!me.exists()) { location.href = "register-profile.html"; return; }

  // 只允許志工
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

  // 監聽屬於我的任務
  if (unsub) unsub();
  const q1 = query(
    collection(db, "requests"),
    where("volunteerId", "==", uid),
    orderBy("time", "desc")
  );
  unsub = onSnapshot(q1, async (snap) => {
    container.innerHTML = "";
    let count = 0;
    const toAutoComplete = [];

    snap.forEach(docSnap => {
      const d = docSnap.data();
      // 若時間已過而且尚未 completed，列入自動完成清單
      if (!String(d.status||'').toLowerCase().includes('completed') && isTimePassed(d)) {
        toAutoComplete.push({ id: docSnap.id });
      }
      container.appendChild(renderTaskCard(docSnap));
      count++;
    });

    emptyHint.classList.toggle("hidden", count !== 0);

    // 逾時自動完成（寫回 DB 並可選擇關聊天室）
    for (const it of toAutoComplete) {
      try{
        await updateDoc(doc(db,'requests', it.id), {
          status: "completed",
          autoCompletedAt: serverTimestamp(),
          autoCompletedReason: "time_passed"
        });
        if (AUTO_CLOSE_MATCH) {
          try { await closeMatch({ taskId: it.id, reason: "time_passed", by: "system" }); }
          catch (e) { console.warn("[closeMatch after auto-complete] failed:", e); }
        }
      }catch(e){ console.warn("[auto-complete] update failed:", it.id, e); }
    }
  }, (err)=> {
    console.error("[my-tasks] onSnapshot error:", err);
  });
}

// ---- Storage 工具 ----
function uniqueName(original){
  const ext = (original.split('.').pop() || 'jpg').toLowerCase();
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  return `${stamp}-${Math.random().toString(36).slice(2,8)}.${ext}`;
}
function reportPath(taskId, file){
  const name = uniqueName(file.name || "report.jpg");
  return `task_reports/${taskId}/${name}`;
}

// ---- 上傳 / 刪除 ----
async function uploadSingle(taskId, file){
  return new Promise((resolve, reject) => {
    try{
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
          console.error("[upload]", err);
          if (prog) prog.classList.add("hidden");
          reject(err);
        },
        async () => {
          if (prog) { prog.value = 100; setTimeout(()=>prog.classList.add("hidden"), 400); }
          const url = await getDownloadURL(task.snapshot.ref);
          if (input) input.value = "";
          resolve(url);
        }
      );
    }catch(e){ reject(e); }
  });
}

async function attachPhotoURL(taskId, url){
  const ref = doc(db, "requests", taskId);
  await updateDoc(ref, {
    photoURL: url,
    status: "completed",
    updatedAt: serverTimestamp()
  });
  try{
    await closeMatch({ taskId, reason: "report_uploaded", by: "volunteer" });
  }catch(e){ console.warn("[closeMatch after upload] failed:", e); }
}

async function deletePhoto(taskId, url){
  try{
    const ref = storageRef(st, url);     // 支援 https:// or gs:// URL
    await deleteObject(ref).catch(()=>{});
    await updateDoc(doc(db, "requests", taskId), { photoURL: "", updatedAt: serverTimestamp() });
  }catch(e){
    console.error("[deletePhoto] error:", e);
    alert("刪除失敗，請稍後重試");
  }
}

// ---- 事件代理（導航/上傳/取消）----
container.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  if (btn.classList.contains("nav-meet") || btn.classList.contains("nav-hospital")) {
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
    const lat = parseFloat(btn.dataset.lat);
    const lng = parseFloat(btn.dataset.lng);
    const q   = (btn.dataset.q||"").trim();
    openMapsBy(lat, lng, q);
    return;
  }

  if (btn.classList.contains("choose-photo")) {
    const taskId = btn.dataset.id;
    const input = container.querySelector(`input[type="file"][data-id="${taskId}"]`);
    input?.click();
    return;
  }

  if (btn.classList.contains("upload-btn")) {
    const taskId = btn.dataset.id;
    const input  = container.querySelector(`input[type="file"][data-id="${taskId}"]`);
    if (!input || !input.files || !input.files.length) return alert("請先選擇要上傳的照片");
    try{
      const url = await uploadSingle(taskId, input.files[0]);
      await attachPhotoURL(taskId, url);
      alert("上傳完成並已關閉聊天室！");
    }catch(err){
      console.error("[upload-btn]", err);
      alert("上傳失敗，請稍後再試");
    }
    return;
  }

  if (btn.classList.contains("delete-photo")) {
    const taskId = btn.dataset.id;
    const url    = btn.dataset.url;
    if (!taskId || !url) return;
    if (!confirm("確定要刪除這張回報照片嗎？")) return;
    await deletePhoto(taskId, url).catch(()=>{});
    return;
  }

  if (btn.classList.contains("cancel-match")) {
    pendingCancelTaskId = btn.dataset.id;
    cancelReasonSel.value = ""; cancelNoteEl.value = "";
    cancelModal.classList.add("show");
    return;
  }
});

// 取消配對：回退 pending + 關聊天室
cancelBackBtn?.addEventListener("click", ()=> cancelModal.classList.remove("show"));
cancelModal?.addEventListener("click", (e)=>{ if(e.target===cancelModal) cancelModal.classList.remove("show"); });
cancelConfirmBtn?.addEventListener("click", async ()=>{
  if (!pendingCancelTaskId) return;
  const reason = (cancelReasonSel?.value||"").trim();
  const note   = (cancelNoteEl?.value||"").trim();
  if (!reason) return alert("請先選擇取消原因");
  if (!confirm("確認要取消這筆配對嗎？")) return;
  try{
    await updateDoc(doc(db,"requests",pendingCancelTaskId), {
      status:"pending", volunteerId:"",
      canceledBy: currentUID, canceledByRole:"volunteer",
      cancelReason: reason, cancelNote: note,
      canceledAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    try{ await closeMatch({ taskId: pendingCancelTaskId, reason:"volunteer_cancel", by:"volunteer" }); }catch(e){ console.warn(e); }
    alert("已取消配對，任務已回到待接列表。");
  }catch(e){ console.error(e); alert("取消失敗，請稍後重試"); }
  finally{ cancelModal.classList.remove("show"); pendingCancelTaskId=null; }
});

// ---- 快速上傳（多檔→單筆任務，只取第一張）----
async function quickReport(taskId, files){
  if (!taskId || !files?.length) { alert("請選擇任務與檔案"); return; }
  const url = await uploadSingle(taskId, files[0]);
  await attachPhotoURL(taskId, url);
  alert("回報已上傳並關閉聊天室！");
}
// 提供給 my-tasks.html 內嵌的對話框呼叫
window.handleQuickReportUpload = (taskId, files)=> quickReport(taskId, files);

// ---- 啟動 ----
(async () => {
  try { await guardAndLoad(); }
  catch (e) {
    console.error("[my-tasks] fatal:", e);
    alert("讀取任務失敗，請重新開啟頁面");
  }
})();
