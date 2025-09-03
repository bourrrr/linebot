// my-tasks.js — 導航 & 上傳 修正版
// - 導航：document「捕獲階段」搶先處理 .nav-meet / .nav-hospital，避免被其他 click 代理吃掉
// - 上傳：uploadBytesResumable + 進度條 + 成功後寫 photoURL、設 status=completed、呼叫 closeMatch
// - 快速上傳橋接：window.handleQuickReportUpload(taskId, files)

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
const functions = getFunctions(app);
const LIFF_ID = "2007877199-Y5R2LenL";

// ===== DOM =====
const container  = document.getElementById("myTaskContainer");
const emptyHint  = document.getElementById("emptyStateHint");

// 取消配對 Modal（若頁面沒有也不影響）
const cancelModal      = document.getElementById("cancelModal");
const cancelReasonSel  = document.getElementById("cancelReason");
const cancelNoteEl     = document.getElementById("cancelNote");
const cancelBackBtn    = document.getElementById("cancelCancelBtn");
const cancelConfirmBtn = document.getElementById("confirmCancelBtn");
let pendingCancelTaskId = null;

// Functions：臨時聊天室關閉
const closeMatch = httpsCallable(functions, "closeMatch");

// ===== Utils =====
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

// 多來源地址 fallback
function composeMeetAddress(d){
  const a1 = `${safe(d.city)}${safe(d.district)}${safe(d.road)}`.trim();
  if (a1) return a1;
  const a2 = `${safe(d.meetCity)}${safe(d.meetDistrict)}${safe(d.meetRoad)}`.trim();
  if (a2) return a2;
  const m = d.meet || {};
  const a3 = `${safe(m.city)}${safe(m.district)}${safe(m.road)}`.trim();
  if (a3) return a3;
  return safe(d.address || d.meetAddress || d.meetingAddress || "");
}

// ===== 導航（捕獲階段 -> 保證優先）=====
function openMaps(lat, lng, q){
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    if (window.liff && liff.isInClient()) liff.openWindow({ url, external:true });
    else window.open(url, "_blank", "noopener");
    return;
  }
  if (q && q.trim()){
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q.trim())}&travelmode=driving`;
    if (window.liff && liff.isInClient()) liff.openWindow({ url, external:true });
    else window.open(url, "_blank", "noopener");
    return;
  }
  alert("這筆任務缺少可導航的資訊（經緯度或地址）。");
}

// ★ 捕獲階段：搶先攔截導航按鈕
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button.nav-meet, button.nav-hospital');
  if (!btn) return;
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
  const lat = parseFloat(btn.dataset.lat);
  const lng = parseFloat(btn.dataset.lng);
  const q   = (btn.dataset.q||"").trim();
  openMaps(lat, lng, q);
}, true);

// ===== 卡片渲染 =====
const NAV_BTN_CLASS = "px-3 py-1.5 rounded-full border font-bold";
const NAV_BTN_STYLE = "background:#588157;color:#fff;border:1px solid #588157;";

function navLatLng(d){
  const lat = (typeof d.lat==='number') ? d.lat
            : (typeof d.meetLat==='number') ? d.meetLat
            : (d.meet && typeof d.meet.lat==='number') ? d.meet.lat : NaN;
  const lng = (typeof d.lng==='number') ? d.lng
            : (typeof d.meetLng==='number') ? d.meetLng
            : (d.meet && typeof d.meet.lng==='number') ? d.meet.lng : NaN;
  return { lat, lng };
}

function renderTaskCard(docSnap){
  const d  = docSnap.data();
  const id = docSnap.id;

  const meetAddress = composeMeetAddress(d);
  const { lat, lng } = navLatLng(d);
  const hospitalQ = [safe(d.hospital || d.pharmacy || d.hospitalName), safe(d.city || d.meetCity)]
                    .filter(Boolean).join(" ").trim();

  const card = document.createElement("div");
  card.className = "task-card bg-white p-4 rounded-xl shadow space-y-2";
  card.dataset.taskId = id;

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
              style="${NAV_BTN_STYLE}"
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

// ===== LIFF 守門＆監聽 =====
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
  if (Array.isArray(roles)) isVolunteer = roles.includes('志工') || roles.includes('volunteer');
  else if (typeof roles === 'string') isVolunteer = (roles.trim()==='志工' || roles.trim()==='volunteer');
  else if (roles && typeof roles === 'object') isVolunteer = roles.志工 === true || roles.volunteer === true;
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
    emptyHint?.classList.toggle("hidden", count !== 0);
  }, (err)=> {
    console.error("[my-tasks] onSnapshot error:", err);
  });
}

// ===== 上傳 / 刪除 =====
function uniqueName(original){
  const ext = (original.split('.').pop() || 'jpg').toLowerCase();
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  return `${stamp}-${Math.random().toString(36).slice(2,8)}.${ext}`;
}
function reportPath(taskId, file){
  const name = uniqueName(file.name || "report.jpg");
  return `task_reports/${taskId}/${name}`;
}

async function uploadSingle(taskId, file){
  return new Promise((resolve, reject) => {
    try{
      const prog = container.querySelector(`progress[data-id="${taskId}"]`);
      const input = container.querySelector(`input[type="file"][data-id="${taskId}"]`);
      const ref = storageRef(st, reportPath(taskId, file));
      const task = uploadBytesResumable(ref, file, { contentType: file.type || "image/jpeg" });

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
  await updateDoc(doc(db, "requests", taskId), {
    photoURL: url,
    status: "completed",
    updatedAt: serverTimestamp()
  });
  try { await closeMatch({ taskId, reason: "report_uploaded", by: "volunteer" }); }
  catch(e){ /* ignore */ }
}

async function deletePhoto(taskId, url){
  try{
    await deleteObject(storageRef(st, url)).catch(()=>{});
    await updateDoc(doc(db, "requests", taskId), { photoURL: "", updatedAt: serverTimestamp() });
  }catch(e){
    console.error("[deletePhoto] error:", e);
    alert("刪除失敗，請稍後重試");
  }
}

// ===== 事件代理（上傳/刪除；導航已由 document 捕獲解決）=====
container.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

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
    cancelReasonSel && (cancelReasonSel.value = "");
    cancelNoteEl && (cancelNoteEl.value = "");
    cancelModal?.classList.add("show");
    return;
  }
});

// 取消配對（若頁面有 modal 才會觸發）
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
    try { await closeMatch({ taskId: pendingCancelTaskId, reason:"volunteer_cancel", by:"volunteer" }); } catch {}
    alert("已取消配對，任務已回到待接列表。");
  }catch(e){ console.error(e); alert("取消失敗，請稍後重試"); }
  finally{ cancelModal?.classList.remove("show"); pendingCancelTaskId=null; }
});

// ===== 快速上傳橋接（給你的彈窗用）=====
window.handleQuickReportUpload = async (taskId, files)=>{
  if (!taskId || !files?.length) return alert("請選擇任務與檔案");
  const url = await uploadSingle(taskId, files[0]);
  await attachPhotoURL(taskId, url);
  alert("回報已上傳並關閉聊天室！");
};

// ===== 啟動 =====
(async () => {
  try { await guardAndLoad(); }
  catch (e) { console.error("[my-tasks] fatal:", e); alert("讀取任務失敗，請重新開啟頁面"); }
})();
