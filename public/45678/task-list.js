// task-list.js — 任務待接區（顯示任務圖示 💊 / 🏥 / 🤝）

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, updateDoc, doc, query, where, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';
import { cityDistricts } from './district-data.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const LIFF_ID = "2007877199-Y5R2LenL";

const taskContainer = document.getElementById("taskContainer");
const emptyState = document.getElementById("emptyState");
const citySelect = document.getElementById("citySelect");
const resetBtn = document.getElementById("resetFilters");
const chipsWrap = document.getElementById("districtChips");
const toggleAllBtn = document.getElementById("toggleAllDistricts");
const tpl = document.getElementById("taskCardTemplate");

const functions = getFunctions(app, "asia-east1");

const createMatch = httpsCallable(functions, "createMatch");
const pureLineId = (uid) => String(uid || "").replace(/^line:/, "");

let currentUid = "";
let tasks = [];
let selectedDistricts = new Set();
let myHasCertificate = false;

const userCache = new Map();
async function getUser(uid){
  if (!uid) return null;
  if (userCache.has(uid)) return userCache.get(uid);
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? snap.data() : null;
  userCache.set(uid, data);
  return data;
}

/* 工具 */
function getTs(t){
  if(!t) return NaN;
  if(typeof t==='number') return t;
  if(typeof t==='string'){ const ms=Date.parse(t); return isNaN(ms)?NaN:ms; }
  if(typeof t.seconds==='number') return t.seconds*1000+Math.floor((t.nanoseconds||0)/1e6);
  if(typeof t.toDate==='function') return t.toDate().getTime();
  return NaN;
}
function timeToString(t){
  const ms=getTs(t);
  return isNaN(ms)?'未提供':new Date(ms).toLocaleString();
}
function isOpenStatus(s){
  const st=String(s||'').toLowerCase();
  return !['accepted','rejected','completed','canceled','expired','closed'].includes(st);
}
function getTaskIcon(type){
  if(!type) return "🤝";
  if(type.includes("領藥")) return "💊";
  if(type.includes("陪診")) return "🏥";
  return "🤝";
}

/* 初始化篩選選單 */
(function fillCities(){
  Object.keys(cityDistricts).forEach(c=>{
    const opt=document.createElement("option");
    opt.value=c; opt.textContent=c;
    citySelect.appendChild(opt);
  });
})();
function loadDistrictChips(city){
  chipsWrap.innerHTML=""; 
  selectedDistricts.clear();
  const districts = cityDistricts[city] || [];
  districts.forEach(d=>{
    const btn=document.createElement("button");
    btn.type="button"; btn.className="chip"; btn.textContent=d;
    btn.dataset.value=d; btn.setAttribute("aria-pressed","false");
    btn.addEventListener("click",()=>{
      if(selectedDistricts.has(d)){ selectedDistricts.delete(d); btn.setAttribute("aria-pressed","false"); }
      else{ selectedDistricts.add(d); btn.setAttribute("aria-pressed","true"); }
      render();
    });
    chipsWrap.appendChild(btn);
  });
}
citySelect.addEventListener("change", ()=>{ loadDistrictChips(citySelect.value); render(); });
toggleAllBtn.addEventListener("click", ()=>{
  const city=citySelect.value;
  const list=cityDistricts[city]||[];
  const allSelected=list.every(d=>selectedDistricts.has(d));
  selectedDistricts = new Set(allSelected ? [] : list);
  chipsWrap.querySelectorAll("button.chip").forEach(b=>{
    b.setAttribute("aria-pressed", selectedDistricts.has(b.dataset.value) ? "true":"false");
  });
  render();
});
resetBtn.addEventListener("click", ()=>{
  citySelect.value="";
  selectedDistricts.clear();
  chipsWrap.innerHTML="";
  render();
});

/* LIFF 登入 */
async function ensureLIFF(){ try{ await liff.init({ liffId: LIFF_ID }); return true; }catch{ return false; } }

(async () => {
  if (!(await ensureLIFF()) || !liff.isLoggedIn()) { location.href = "login.html"; return; }
  const p = await liff.getProfile();
  currentUid = `line:${p.userId}`;

  const meSnap = await getDoc(doc(db, "users", currentUid));
  if (!meSnap.exists()) { location.href = "register-profile.html"; return; }
  const me = meSnap.data() || {};
  myHasCertificate = (me.hasCertificate === "有");

  const qPending = query(collection(db, "requests"), where("status", "==", "pending"));
  onSnapshot(qPending, (snapshot) => {
    tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
})();

/* 渲染卡片 */
async function render(){
  taskContainer.innerHTML="";
  const selCity = citySelect.value;
  const selDistricts = Array.from(selectedDistricts);
  const result = [];

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  for (const t of tasks) {
    if (!isOpenStatus(t.status)) continue;
    if (selCity && t.city !== selCity) continue;
    if (selDistricts.length && !selDistricts.includes(t.district)) continue;
    if (currentUid && t.userId === currentUid) continue;

    // ✅ 過期任務過濾：允許「未來任務」或「今天內且未超過 1 小時的過去任務」
    const taskTime = getTs(t.time);
    if (!isNaN(taskTime)) {
      if (taskTime < now) {
        const taskDate = new Date(taskTime).toDateString();
        const nowDate  = new Date(now).toDateString();
        const diffMs   = now - taskTime;

        if (taskDate !== nowDate) continue;   // 不是今天 → 排除
        if (diffMs > oneHour) continue;       // 超過 1 小時 → 排除
      }
    }

    const patient = await getUser(t.userId);
    if (patient?.disability && patient.disability !== "無" && !myHasCertificate) continue;

    result.push(t);
  }

  if (!result.length){ 
    emptyState.classList.remove("hidden"); 
    return; 
  }
  emptyState.classList.add("hidden");

  result.forEach(t=>{
    const card = tpl.content.cloneNode(true);
    card.querySelector(".icon").textContent = getTaskIcon(t.type||"");
    card.querySelector(".task-type").textContent = t.type || "未提供";
    card.querySelector(".task-time").textContent = timeToString(t.time);
    card.querySelector(".task-addr").textContent = `${t.city||''}${t.district||''}${t.road||''}` || "未提供地址";
    card.querySelector(".task-note").textContent = (t.note && String(t.note).trim()) ? t.note : "無";
    card.querySelector(".accept").dataset.id = t.id;
    card.querySelector(".reject").dataset.id = t.id;
    taskContainer.appendChild(card);
  });
}

async function createMatchForTask(task, volunteerUid) {
  const fn = httpsCallable(functions, "createMatch");

  // 撈患者資料（確保有名字）
  const patient = await getUser(task.userId);

  await fn({
    taskId: task.id,
    patientUserId: pureLineId(task.userId),
    volunteerUserId: pureLineId(volunteerUid),
    patientAuthUid: task.userId,
    volunteerAuthUid: volunteerUid,
     patientName: task.username || task.userName || task.patientName || '未命名患者',
    taskTitle: (task.type || "任務"),
    taskAddr: `${task.city||''}${task.district||''}${task.road||''}`,
  });
}




taskContainer.addEventListener("click", async (e)=>{
  const btn = e.target.closest("button");
  if (!btn) return;
  if (!btn.classList.contains("accept") && !btn.classList.contains("reject")) return;

  const taskId = btn.dataset.id;
  const status = btn.classList.contains("accept") ? "accepted" : "rejected";
  const t = tasks.find(x => x.id === taskId);

  await updateDoc(doc(db, "requests", taskId), {
    status,
    volunteerId: currentUid,
    updatedAt: new Date()
  });

  if (status === "accepted" && t) {
    await createMatchForTask(t, currentUid);
    alert("已接受任務並建立聊天室，請到 LINE 開始對話！");
  } else {
    alert("任務已拒絕");
  }
});
