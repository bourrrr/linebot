import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';
import { cityDistricts } from './district-data.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const taskContainer = document.getElementById("taskContainer");
const emptyState = document.getElementById("emptyState");
const citySelect = document.getElementById("citySelect");
const districtSelect = document.getElementById("districtSelect");
const resetBtn = document.getElementById("resetFilters");

let currentUser = null;
let tasks = []; // 從 DB 撈到的所有 pending 任務（前端做篩選/隱藏）

/* =======================
   逾期判斷參數與工具
======================= */
const DURATION_MINUTES = 90; // 若沒有 endAt，預估任務時長（可自行調整）
const GRACE_MINUTES    = 30; // 緩衝時間（看診延誤、交通，避免誤判）

// 將 Firestore Timestamp / ISO / 毫秒 / toDate() 轉成 ms
function getTs(t){
  try{
    if (!t) return NaN;
    if (typeof t === 'number') return t;
    if (typeof t === 'string') { const ms = Date.parse(t); return isNaN(ms) ? NaN : ms; }
    if (typeof t.seconds === 'number') return t.seconds * 1000 + Math.floor((t.nanoseconds||0)/1e6);
    if (typeof t.toDate === 'function') return t.toDate().getTime();
    return NaN;
  }catch{ return NaN; }
}

// 任務是否已逾期（仍為開放狀態但時間已到）
function isExpired(req){
  // 優先用 endAt；沒有就用 time + DURATION
  const startMs = getTs(req.time || req.appointmentAt);
  if (isNaN(startMs)) return false; // 沒時間就不判定，避免誤殺
  const endMs = getTs(req.endAt);
  const assumedEnd = isNaN(endMs) ? (startMs + DURATION_MINUTES*60*1000) : endMs;
  const cutoff = assumedEnd + GRACE_MINUTES*60*1000;
  return Date.now() >= cutoff;
}

// 是否為開放可接狀態（保險起見，雖然查詢已過濾 pending）
function isOpenStatus(s){
  const st = String(s || '').toLowerCase();
  return !['accepted','rejected','completed','canceled','expired','closed'].includes(st);
}

// 友善時間字串
function timeToString(t){
  const ms = getTs(t);
  if (isNaN(ms)) return '未提供';
  return new Date(ms).toLocaleString();
}

/* =======================
   初始化：縣市/區列表
======================= */
// 1) 灌入縣市清單
(function fillCities() {
  const cities = Object.keys(cityDistricts);
  cities.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    citySelect.appendChild(opt);
  });
})();

// 動態載入行政區
function loadDistricts(city) {
  districtSelect.innerHTML = '<option value="">全部行政區</option>';
  if (city && cityDistricts[city]) {
    cityDistricts[city].forEach(d => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      districtSelect.appendChild(opt);
    });
    districtSelect.disabled = false;
  } else {
    districtSelect.disabled = true;
  }
}

// 2) 監聽縣市切換 → 動態載入區域 + 重繪
citySelect.addEventListener("change", () => {
  loadDistricts(citySelect.value);
  render(); // 立即根據新條件重繪
});

// 3) 監聽行政區切換 → 重繪
districtSelect.addEventListener("change", render);

// 4) 重設
resetBtn.addEventListener("click", () => {
  citySelect.value = "";
  loadDistricts("");
  render();
});

/* =======================
   登入 + 初始載入
======================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("請先登入");
    window.location.href = "login.html";
    return;
  }
  currentUser = user;

  // 先帶入使用者 city/district 當初始值（僅初始，不會鎖定）
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      const defaultCity = data.city || "";
      const defaultDistrict = data.district || "";
      if (defaultCity) {
        citySelect.value = defaultCity;
        loadDistricts(defaultCity);
        if (defaultDistrict) districtSelect.value = defaultDistrict;
      }
    }
  } catch (e) {
    console.warn("讀取使用者初始城市失敗：", e);
  }

  // 撈所有 status = pending 的任務
  const qPending = query(collection(db, "requests"), where("status", "==", "pending"));
  const snapshot = await getDocs(qPending);
  tasks = snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  render();

  // 每分鐘重算一次（剛過期的會自動從畫面消失）
  setInterval(() => {
    render();
  }, 60_000);
});

/* =======================
   渲染（含過期 & 地區過濾）
======================= */
function render() {
  taskContainer.innerHTML = "";
  const selCity = citySelect.value;
  const selDistrict = districtSelect.value;

  // 先依「開放狀態」與「未過期」過濾，再套地區條件
  const filtered = tasks.filter(t =>
    isOpenStatus(t.status) &&
    !isExpired(t) &&
    (!selCity || t.city === selCity) &&
    (!selDistrict || t.district === selDistrict)
  );

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  filtered.forEach(t => {
    const card = document.createElement("div");
    card.className = "task-card bg-white p-4 rounded-xl shadow";
    card.__data = t; // 給可能的後續用途（例如別處需要）

    card.innerHTML = `
      <h2 class="text-lg font-bold">📍 ${t.city || ''}${t.district || ''}${t.road || ''}</h2>
      <p>醫院／藥局：${t.hospital || '未提供'}</p>
      <p>類型：${t.type || '未提供'}</p>
      <p>時間：${timeToString(t.time)}</p>
      <p>備註：${t.note || '無'}</p>
      <div class="mt-3 flex gap-2">
        <button class="accept bg-green-500 text-white px-4 py-1 rounded" data-id="${t.id}">接受</button>
        <button class="reject bg-red-500 text-white px-4 py-1 rounded" data-id="${t.id}">拒絕</button>
      </div>
    `;
    taskContainer.appendChild(card);
  });
}

/* =======================
   接受 / 拒絕
======================= */
taskContainer.addEventListener("click", async (e) => {
  const target = e.target;
  if (target.classList.contains("accept") || target.classList.contains("reject")) {
    const taskId = target.dataset.id;
    const status = target.classList.contains("accept") ? "accepted" : "rejected";
    const taskRef = doc(db, "requests", taskId);

    await updateDoc(taskRef, {
      status,
      volunteerId: currentUser.uid,
      updatedAt: new Date()
    });

    alert(`任務已${status === "accepted" ? "接受" : "拒絕"}`);
    // 從本地 tasks 移除該筆並重繪
    tasks = tasks.filter(t => t.id !== taskId);
    render();
  }
});
