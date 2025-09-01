// task-list.js  — 任務待接區（requests 集合 / 僅顯示未過期 + 待接 / 隱藏自己發的任務 / 顯示圖片）
// + 新增：如果「發布者（患者）」為身心障礙者，只有 hasCertificate === "有" 的志工能看到並接受該任務。

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, updateDoc, doc, query, where, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';
import { cityDistricts } from './district-data.js';

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const LIFF_ID = "2007877199-Y5R2LenL";

const taskContainer = document.getElementById("taskContainer");
const emptyState = document.getElementById("emptyState");
const citySelect = document.getElementById("citySelect");
const resetBtn = document.getElementById("resetFilters");
const chipsWrap = document.getElementById("districtChips");
const toggleAllBtn = document.getElementById("toggleAllDistricts");

let currentUid = "";                 // 以 line:${userId} 儲存（用於排除自己發的單）
let tasks = [];                      // 全部 pending 任務（前端再過濾）
let selectedDistricts = new Set();   // chips 複選狀態

// === 新增：快取 user 文件，避免重複查詢 ===
const userCache = new Map(); // key = uid, val = userDocData 或 null（查不到）
async function getUser(uid){
  if (!uid) return null;
  if (userCache.has(uid)) return userCache.get(uid);
  try{
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.exists() ? (snap.data() || null) : null;
    userCache.set(uid, data);
    return data;
  }catch{
    userCache.set(uid, null);
    return null;
  }
}

/* ===== 工具 ===== */
const DURATION_MINUTES = 90;
const GRACE_MINUTES    = 30;

function getTs(t){
  try{
    if(!t) return NaN;
    if(typeof t==='number') return t;
    if(typeof t==='string'){ const ms=Date.parse(t); return isNaN(ms)?NaN:ms; }
    if(typeof t.seconds==='number') return t.seconds*1000+Math.floor((t.nanoseconds||0)/1e6);
    if(typeof t.toDate==='function') return t.toDate().getTime();
    return NaN;
  }catch{ return NaN; }
}
function timeToString(t){
  const ms=getTs(t);
  return isNaN(ms)?'未提供':new Date(ms).toLocaleString();
}
function isExpired(req){
  const startMs=getTs(req.time||req.appointmentAt);
  if(isNaN(startMs)) return false;
  const endMs=getTs(req.endAt);
  const assumedEnd=isNaN(endMs)?(startMs+DURATION_MINUTES*60*1000):endMs;
  const cutoff=assumedEnd+GRACE_MINUTES*60*1000;
  return Date.now()>=cutoff;
}
function isOpenStatus(s){
  const st=String(s||'').toLowerCase();
  return !['accepted','rejected','completed','canceled','expired','closed'].includes(st);
}

/* ===== 初始化：縣市/區 chips ===== */
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

  const districts = city && cityDistricts[city] ? cityDistricts[city] : null;
  if(!districts || districts.length===0){
    const hint=document.createElement("span");
    hint.textContent="請先選擇縣市";
    hint.className="text-sm";
    chipsWrap.appendChild(hint);
    toggleAllBtn.disabled=true;
    return;
  }
  toggleAllBtn.disabled=false;

  districts.forEach(d=>{
    const btn=document.createElement("button");
    btn.type="button"; btn.className="chip"; btn.textContent=d;
    btn.dataset.value=d; btn.setAttribute("aria-pressed","false");
    btn.addEventListener("click",()=>{
      if(selectedDistricts.has(d)){
        selectedDistricts.delete(d);
        btn.setAttribute("aria-pressed","false");
      }else{
        selectedDistricts.add(d);
        btn.setAttribute("aria-pressed","true");
      }
      render(); // 非同步可不 await
    });
    chipsWrap.appendChild(btn);
  });
}

citySelect.addEventListener("change", ()=>{ loadDistrictChips(citySelect.value); render(); });

toggleAllBtn.addEventListener("click", ()=>{
  const city=citySelect.value;
  const list=(city && cityDistricts[city])?cityDistricts[city]:[];
  if(list.length===0) return;

  const allSelected=list.every(d=>selectedDistricts.has(d));

  selectedDistricts.clear();

  const btns=chipsWrap.querySelectorAll("button.chip");
  if(allSelected){
    btns.forEach(b=>b.setAttribute("aria-pressed","false"));
  }else{
    list.forEach(d=>selectedDistricts.add(d));
    btns.forEach(b=>b.setAttribute("aria-pressed","true"));
  }
  render();
});

resetBtn.addEventListener("click", ()=>{
  citySelect.value="";
  selectedDistricts.clear();
  loadDistrictChips("");
  render();
});

/* ===== LIFF 守門（僅志工）＋ 監聽待接任務 ===== */
async function ensureLIFF(){ try{ await liff.init({ liffId: LIFF_ID }); return true; }catch(e){ console.error(e); alert('LIFF 初始化失敗'); return false; } }

// === 目前登入志工的「是否有證照」會先取一次，後續 render 直接使用 ===
let myHasCertificate = false;

(async () => {
  if (!(await ensureLIFF()) || !liff.isLoggedIn()) { location.href = "login.html"; return; }
  const p = await liff.getProfile();
  currentUid = `line:${p.userId}`;

  const meSnap = await getDoc(doc(db, "users", currentUid));
  if (!meSnap.exists()) { location.href = "register-profile.html"; return; }
  const me = meSnap.data() || {};
  const rawRoles = Array.isArray(me.roles) ? me.roles : (me.role ? [me.role] : []);
  const roles = rawRoles.map(r => String(r).trim().toLowerCase());
  const isVolunteer = roles.includes('志工') || roles.includes('volunteer');
  if (!isVolunteer) { location.href = "home.html"; return; }

  // ★ 讀取自己的志工證照狀態（register-profile.js 會把 hasCertificate 存成 "有"/"無"）
  myHasCertificate = (me.hasCertificate === "有");

  // 預設篩選：帶入我的城市/行政區（若有）
  const myCity = me.city || "";
  const myDistrict = me.district || "";
  if (myCity) {
    citySelect.value = myCity;
    loadDistrictChips(myCity);
    if (myDistrict) {
      selectedDistricts.add(myDistrict);
      chipsWrap.querySelectorAll("button.chip").forEach(btn => {
        if (btn.dataset.value === myDistrict) btn.setAttribute("aria-pressed","true");
      });
    }
  } else {
    loadDistrictChips("");
  }

  // 監聽所有 pending（前端再過濾）
  const qPending = query(collection(db, "requests"), where("status", "==", "pending"));
  onSnapshot(qPending, (snapshot) => {
    tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
})();

/* ===== 渲染（含過期 & 地區過濾 & 不看自己 & 身障→需證照） ===== */
async function render(){
  taskContainer.innerHTML="";
  const selCity = citySelect.value;
  const selDistricts = Array.from(selectedDistricts);

  const result = [];

  // 先收集需要查的 發布者 uid，批次讀（以快取避免重複打）
  const publisherUids = new Set();
  for (const t of tasks) {
    // 基本條件先過一輪
    if (!isOpenStatus(t.status)) continue;
    if (isExpired(t)) continue;
    if (selCity && t.city !== selCity) continue;
    if (selDistricts.length > 0 && !selDistricts.includes(t.district)) continue;
    if (currentUid && t.userId === currentUid) continue; // 不看自己發的
    publisherUids.add(t.userId);
  }

  // 預載入所有相關 user 文件
  await Promise.all(Array.from(publisherUids).map(uid => getUser(uid)));

  for (const t of tasks) {
    if (!isOpenStatus(t.status)) continue;
    if (isExpired(t)) continue;
    if (selCity && t.city !== selCity) continue;
    if (selDistricts.length > 0 && !selDistricts.includes(t.district)) continue;
    if (currentUid && t.userId === currentUid) continue;

    // 取得發布者（患者）資料
    const patient = await getUser(t.userId);
    const disability = patient?.disability || ""; // 可能是 "無" 或 "輕度/中度/重度" 等

    // ★關鍵：若發布者為身心障礙者（非「無」），則本志工必須具備專業證照
    if (disability && disability !== "無") {
      if (!myHasCertificate) {
        continue; // 我沒有證照 → 不顯示這張任務
      }
    }

    result.push(t);
  }

  if (result.length === 0){ 
    emptyState.classList.remove("hidden"); 
    return; 
  }
  emptyState.classList.add("hidden");

  // 依開始時間排序（近→遠）
  result.sort((a,b)=> (getTs(a.time) - getTs(b.time)));

  // 產生卡片（加入圖片顯示）
  result.forEach(t=>{
    const addr = `${t.city||''}${t.district||''}${t.road||''}`;
    const timeStr = timeToString(t.time);

    // 允許多種欄位名稱（取第一張）
    const img =
      t.imageUrl ||
      t.photoUrl ||
      (Array.isArray(t.images) ? t.images[0] : null) ||
      t.picture || "";

    const imageHtml = img
      ? `<img src="${img}" alt="任務圖片" class="w-full h-44 object-cover rounded-lg border" loading="lazy" />`
      : "";

    const card=document.createElement("div");
    card.className="task-card bg-white p-4 rounded-xl shadow";
    card.__data=t;

    card.innerHTML = `
      ${imageHtml}
      <h2 class="text-lg font-bold mt-2">📍 ${addr || '未提供地址'}</h2>
      <p>醫院／藥局：${t.hospital || '未提供'}</p>
      <p>類型：${t.type || '未提供'}</p>
      <p>時間：${timeStr}</p>
      <p>備註：${(t.note && String(t.note).trim()) ? t.note : '無'}</p>
      <div class="mt-3 flex gap-2">
        <button class="accept bg-green-500 text-white px-4 py-1 rounded" data-id="${t.id}">接受</button>
        <button class="reject bg-red-500 text-white px-4 py-1 rounded" data-id="${t.id}">拒絕</button>
      </div>`;
    taskContainer.appendChild(card);
  });
}

/* ===== 接受 / 拒絕（寫入 volunteerId = 當前 LIFF uid） ===== */
taskContainer.addEventListener("click", async (e)=>{
  const btn = e.target.closest("button");
  if (!btn) return;
  if (!btn.classList.contains("accept") && !btn.classList.contains("reject")) return;

  const taskId = btn.dataset.id;
  const status = btn.classList.contains("accept") ? "accepted" : "rejected";
  await updateDoc(doc(db, "requests", taskId), {
    status,
    volunteerId: currentUid,
    updatedAt: new Date()
  });
  alert(`任務已${status==='accepted'?'接受':'拒絕'}`);
});
