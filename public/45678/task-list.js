import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, updateDoc, doc, query, where, getDoc, onSnapshot
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
const resetBtn = document.getElementById("resetFilters");
const chipsWrap = document.getElementById("districtChips");
const toggleAllBtn = document.getElementById("toggleAllDistricts");

let currentUser = null;
let tasks = []; // 全部 pending 任務（由前端做過濾）
let selectedDistricts = new Set(); // chips 複選狀態

/* =======================
   逾期判斷參數與工具（保留）
======================= */
const DURATION_MINUTES = 90;
const GRACE_MINUTES    = 30;

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
function isExpired(req){
  const startMs = getTs(req.time || req.appointmentAt);
  if (isNaN(startMs)) return false;
  const endMs = getTs(req.endAt);
  const assumedEnd = isNaN(endMs) ? (startMs + DURATION_MINUTES*60*1000) : endMs;
  const cutoff = assumedEnd + GRACE_MINUTES*60*1000;
  return Date.now() >= cutoff;
}
function isOpenStatus(s){
  const st = String(s || '').toLowerCase();
  return !['accepted','rejected','completed','canceled','expired','closed'].includes(st);
}
function timeToString(t){
  const ms = getTs(t);
  if (isNaN(ms)) return '未提供';
  return new Date(ms).toLocaleString();
}

/* =======================
   初始化：縣市/區 chips
======================= */
(function fillCities() {
  Object.keys(cityDistricts).forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    citySelect.appendChild(opt);
  });
})();

function loadDistrictChips(city) {
  chipsWrap.innerHTML = "";
  selectedDistricts.clear();

  if (city && cityDistricts[city]) {
    cityDistricts[city].forEach(d => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = d;
      btn.dataset.value = d;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => {
        const v = btn.dataset.value;
        if (selectedDistricts.has(v)) {
          selectedDistricts.delete(v);
          btn.setAttribute("aria-pressed", "false");
        } else {
          selectedDistricts.add(v);
          btn.setAttribute("aria-pressed", "true");
        }
        render();
      });
      chipsWrap.appendChild(btn);
    });
    toggleAllBtn.disabled = false;
  } else {
    const hint = document.createElement("span");
    hint.textContent = "請先選擇縣市";
    hint.className = "text-sm";
    chipsWrap.appendChild(hint);
    toggleAllBtn.disabled = true;
  }
}
citySelect.addEventListener("change", () => { loadDistrictChips(citySelect.value); render(); });
toggleAllBtn.addEventListener("click", () => {
  const city = citySelect.value;
  if (!city || !cityDistricts[city]) return;
  const list = cityDistricts[city];
  const isAllSelected = list.every(d => selectedDistricts.has(d));
  selectedDistricts = new Set(isAllSelected ? [] : list);
  chipsWrap.querySelectorAll("button.chip").forEach(btn => {
    const v = btn.dataset.value;
    btn.setAttribute("aria-pressed", selectedDistricts.has(v) ? "true" : "false");
  });
  render();
});
resetBtn.addEventListener("click", () => { citySelect.value = ""; loadDistrictChips(""); render(); });

/* =======================
   登入 + 即時監聽
======================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) { alert("請先登入"); location.href = "login.html"; return; }
  currentUser = user;

  // 初始城市/行政區
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      const defaultCity = data.city || "";
      const defaultDistrict = data.district || "";
      if (defaultCity) {
        citySelect.value = defaultCity;
        loadDistrictChips(defaultCity);
        if (defaultDistrict) {
          selectedDistricts.add(defaultDistrict);
          chipsWrap.querySelectorAll("button.chip").forEach(btn => {
            if (btn.dataset.value === defaultDistrict) btn.setAttribute("aria-pressed","true");
          });
        }
      } else {
        loadDistrictChips("");
      }
    } else {
      loadDistrictChips("");
    }
  } catch(e){ console.warn("讀取使用者初始城市失敗：", e); loadDistrictChips(""); }

  // ✅ 改為 onSnapshot 即時監聽，發布後立刻出現
  const qPending = query(collection(db, "requests"), where("status", "==", "pending"));
  onSnapshot(qPending, (snapshot) => {
    tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
});

/* =======================
   渲染（含過期 & 地區過濾）
======================= */
function render() {
  taskContainer.innerHTML = "";
  const selCity = citySelect.value;
  const selDistricts = Array.from(selectedDistricts);

  const filtered = tasks.filter(t =>
    isOpenStatus(t.status) &&
    !isExpired(t) &&
    (!selCity || t.city === selCity) &&
    (selDistricts.length === 0 || selDistricts.includes(t.district))
  );

  if (filtered.length === 0) { emptyState.classList.remove("hidden"); return; }
  emptyState.classList.add("hidden");

  filtered.forEach(t => {
    const card = document.createElement("div");
    card.className = "task-card bg-white p-4 rounded-xl shadow";
    card.__data = t;
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
    // 交由即時監聽自動刷新，不需手動移除
  }
});
