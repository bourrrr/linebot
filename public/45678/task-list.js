// task-list.js  — 任務待接區
// 規格：requests 集合 / 僅顯示未過期 + 待接 / 隱藏自己發的任務 / 顯示圖片
// ★ 新增：如果「發布者（患者）」為身心障礙（非「無」），或任務 requiresCert === true，僅顯示給「有志工證照」的志工；接單也再檢查一次。

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, onSnapshot, query, where, updateDoc, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { cityDistricts } from "./district-data.js";

// ---------- 初始化 ----------
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const LIFF_ID = "2007877199-Y5R2LenL";

// ---------- DOM ----------
const taskContainer = document.getElementById("taskContainer");
const emptyState    = document.getElementById("emptyState");
const citySelect    = document.getElementById("citySelect");
const chipsWrap     = document.getElementById("districtChips");
const resetBtn      = document.getElementById("resetFilters");
const toggleAllBtn  = document.getElementById("toggleAllDistricts");

// ---------- 狀態 ----------
let currentUid = "";                  // 以 line:${userId}
let myHasCertificate = false;         // 當前志工是否有證照
let selectedDistricts = new Set();    // 篩選 chips
let allTasks = [];                    // 原始任務（onSnapshot 撈回）
const usersCache = new Map();         // 快取 users 文件

// ---------- 小工具 ----------
const $ = (sel, root=document) => root.querySelector(sel);
const escapeHtml = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function roleKey(s){
  const m = String(s||"").trim().toLowerCase();
  if (m === "患者" || m === "patient") return "patient";
  if (m === "志工" || m === "volunteer") return "volunteer";
  return "";
}
function getUserRoles(data){
  const raw = (data && (data.roles ?? data.role)) ?? [];
  const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const set = new Set(arr.map(roleKey).filter(Boolean));
  return { isPatient: set.has("patient"), isVolunteer: set.has("volunteer") };
}

async function ensureLIFF(){
  try{ await liff.init({ liffId: LIFF_ID }); return true; }
  catch(e){ console.error(e); alert("LIFF 初始化失敗"); return false; }
}
async function getLineUid(){
  if (!(await ensureLIFF()) || !liff.isLoggedIn()) {
    location.href = "login.html"; return "";
  }
  const p = await liff.getProfile();
  return `line:${p.userId}`;
}

async function getUser(uid){
  if (!uid) return null;
  if (usersCache.has(uid)) return usersCache.get(uid);
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? snap.data() : null;
  usersCache.set(uid, data);
  return data;
}

// 判斷「我是否有志工證照」：相容多命名
function computeHasCertificate(u){
  if (!u) return false;
  const truthy = new Set(["yes","有","true","1",1,true]);
  if (truthy.has(String(u.hasVolunteerCert).toLowerCase())) return true;
  if (truthy.has(String(u.volunteerCert).toLowerCase())) return true;
  if (truthy.has(String(u.hasCertificate).toLowerCase())) return true;
  if (u.volunteerCertFile || u.volCertFile || u.vol_cert_file) return true; // 有上傳紀錄
  return u.hasVolunteerCert === true || u.volunteerCert === true;
}

// 判斷「此任務是否需要有證照」：來自任務本身或患者身障
async function taskRequiresCertificate(task){
  // 任務標記（若你的建立流程有寫 requiresCert，就會直接生效）
  if (task?.requiresCert === true) return true;

  // 若任務沒有 userId（患者 id），則無法判斷患者狀態 → 視為不強制
  const pid = task?.userId;
  if (!pid) return false;

  const patient = await getUser(pid);
  const disability = String(patient?.disability || "").trim();
  return (disability && disability !== "無");
}

// 是否過期（若任務含 expiresAt / deadline / requestTime 等欄位，可自行擴充）
function isExpired(task){
  const ex = task?.expiresAt || task?.deadline;
  if (!ex) return false;
  // ex 可能是 Timestamp 或日期字串
  const t = (ex?.toDate && typeof ex.toDate==="function") ? ex.toDate().getTime() : Date.parse(ex);
  return Number.isFinite(t) ? (Date.now() > t) : false;
}

// ---------- 篩選 UI ----------
function fillCities(){
  citySelect.innerHTML = '<option value="">全部縣市</option>';
  Object.keys(cityDistricts).forEach(c => citySelect.appendChild(new Option(c, c)));
}
function renderDistrictChips(city){
  chipsWrap.innerHTML = "";
  selectedDistricts.clear();
  if (!city) return;
  (cityDistricts[city] || []).forEach(d => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip border rounded-full px-3 py-1";
    btn.dataset.val = d;
    btn.textContent = d;
    chipsWrap.appendChild(btn);
  });
}
citySelect?.addEventListener("change", ()=>{
  renderDistrictChips(citySelect.value);
  draw(); // 重新套用篩選
});
chipsWrap?.addEventListener("click", (e)=>{
  const b = e.target.closest("button[data-val]");
  if (!b) return;
  const v = b.dataset.val;
  if (selectedDistricts.has(v)) { selectedDistricts.delete(v); b.classList.remove("bg-[#eef4ee]"); }
  else { selectedDistricts.add(v); b.classList.add("bg-[#eef4ee]"); }
  draw();
});
toggleAllBtn?.addEventListener("click", ()=>{
  if (!citySelect.value) return;
  const all = cityDistricts[citySelect.value] || [];
  const allSelected = all.every(d => selectedDistricts.has(d));
  selectedDistricts = new Set(allSelected ? [] : all);
  // 視覺同步
  [...chipsWrap.querySelectorAll("button[data-val]")].forEach(b=>{
    const v = b.dataset.val;
    b.classList.toggle("bg-[#eef4ee]", selectedDistricts.has(v));
  });
  draw();
});
resetBtn?.addEventListener("click", ()=>{
  citySelect.value = "";
  selectedDistricts.clear();
  chipsWrap.innerHTML = "";
  draw();
});

// ---------- 渲染 ----------
function renderCard(t){
  const photos = Array.isArray(t.photos) ? t.photos : (t.imageUrl ? [t.imageUrl] : []);
  const img = photos[0] ? `<img src="${escapeHtml(photos[0])}" alt="" class="w-full h-40 object-cover rounded-xl border">` : "";
  const city = escapeHtml(t.city || "");
  const district = escapeHtml(t.district || "");
  const road = escapeHtml(t.road || t.address || "");
  const type = escapeHtml(t.type || t.requestType || "社區服務");
  const note = escapeHtml(t.note || t.remark || "");

  return `
  <div class="card rounded-2xl p-4 border mb-4">
    <div class="flex gap-4">
      <div class="w-32 shrink-0">${img || `<div class="w-full h-40 rounded-xl border grid place-items-center text-sm text-slate-500">無照片</div>`}</div>
      <div class="flex-1">
        <div class="flex items-center justify-between">
          <h3 class="font-extrabold">${type}</h3>
          <div class="text-sm text-slate-500">${escapeHtml(t.createdAtText || "")}</div>
        </div>
        <div class="mt-1 text-sm">${city}${city && district ? " · " : ""}${district} ${road ? `· ${road}` : ""}</div>
        ${note ? `<p class="mt-2 text-sm">${note}</p>` : ""}
        <div class="mt-4 flex gap-2">
          <button class="accept px-4 py-2 rounded-full bg-[var(--primary)] text-white" data-id="${escapeHtml(t.id)}">接受</button>
          <button class="reject px-4 py-2 rounded-full border" data-id="${escapeHtml(t.id)}">拒絕</button>
        </div>
      </div>
    </div>
  </div>`;
}

async function draw(){
  // 依目前篩選過濾
  const city = citySelect?.value || "";
  const districts = selectedDistricts;

  // 逐筆檢查是否需證照（含患者身障）
  const out = [];
  for (const t of allTasks){
    if (t.userId === currentUid) continue;     // 不顯示自己發的
    if (isExpired(t)) continue;                // 過期不顯示

    if (city && t.city !== city) continue;
    if (districts.size && !districts.has(t.district)) continue;

    // ★ 如果此任務需要證照，且我沒有 → 不顯示
    //   （task.requiresCert 或 發布者是身障患者）
    const needsCert = await taskRequiresCertificate(t);
    if (needsCert && !myHasCertificate) continue;

    out.push(t);
  }

  if (!out.length){
    taskContainer.innerHTML = "";
    emptyState?.classList.remove("hidden");
    return;
  }

  emptyState?.classList.add("hidden");
  taskContainer.innerHTML = out.map(renderCard).join("");
}

// ---------- 接單 / 拒絕 ----------
taskContainer?.addEventListener("click", async (e)=>{
  const btn = e.target.closest("button");
  if (!btn) return;
  if (!btn.classList.contains("accept") && !btn.classList.contains("reject")) return;

  const taskId = btn.dataset.id;
  const status = btn.classList.contains("accept") ? "accepted" : "rejected";

  try{
    // 重新讀取任務與患者，避免被繞過
    const tRef  = doc(db, "requests", taskId);
    const tSnap = await getDoc(tRef);
    if (!tSnap.exists()) { alert("任務不存在或已被刪除"); return; }
    const t = { id: taskId, ...tSnap.data() };

    // ★ 再次資格檢查
    const needsCert = await taskRequiresCertificate(t);
    if (status === "accepted" && needsCert && !myHasCertificate){
      alert("此任務限『有志工證照』者接受");
      return;
    }

    // 標記接/拒
    await updateDoc(tRef, {
      status,
      volunteerId: currentUid,
      updatedAt: new Date()
    });
    alert(`任務已${status==='accepted'?'接受':'拒絕'}`);
  }catch(err){
    console.error(err);
    alert("操作失敗，請稍後再試");
  }
});

// ---------- 主流程 ----------
(async ()=>{
  // 1) 取登入者
  currentUid = await getLineUid();
  if (!currentUid) return;

  // 2) 讀取登入者 user 文件 → 算出是否有證照
  const me = await getUser(currentUid);
  const { isVolunteer } = getUserRoles(me || {});
  if (!isVolunteer){ location.href = "home.html"; return; }
  myHasCertificate = computeHasCertificate(me);

  // 3) 填選單
  fillCities();

  // 4) 監聽任務（僅待接 / 你可依專案調整狀態值）
  //    如你使用 'open' / 'pending' / 'published' 等，請改成適用的 where 條件
  //    （若不確定，先移除 where 直接監聽整個集合也可行，但成本較高）
  const qRef = query(
    collection(db, "requests"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );

  onSnapshot(qRef, (snap)=>{
    allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    draw(); // 套用目前篩選與資格條件
  }, (err)=> {
    console.error(err);
    allTasks = [];
    draw();
  });
})();
