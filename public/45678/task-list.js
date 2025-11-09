// task-list.js — 任務待接區（顯示任務圖示 💊 / 🏥 / 🤝）

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, updateDoc, doc, query, where, getDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";
import { cityDistricts } from "./district-data.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const functions = getFunctions(app, "asia-east1");
const createMatch = httpsCallable(functions, "createMatch");

const LIFF_ID = "2007877199-Y5R2LenL";

const taskContainer = document.getElementById("taskContainer");
const emptyState = document.getElementById("emptyState");
const citySelect = document.getElementById("citySelect");
const resetBtn = document.getElementById("resetFilters");
const chipsWrap = document.getElementById("districtChips");
const toggleAllBtn = document.getElementById("toggleAllDistricts");
const tpl = document.getElementById("taskCardTemplate");

const matchModal = document.getElementById("matchModal");
const closeModalBtn = document.getElementById("closeModal");
const matchChatLink = document.getElementById("matchChatLink");

let currentUid = "";
let tasks = [];
let selectedDistricts = new Set();
let myHasCertificate = false;

const userCache = new Map();
const pureLineId = (uid) => String(uid || "").replace(/^line:/, "");

/* ---------- 工具 ---------- */
async function getUser(uid) {
  if (!uid) return null;
  if (userCache.has(uid)) return userCache.get(uid);
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? snap.data() : null;
  userCache.set(uid, data);
  return data;
}

function getTs(t) {
  if (!t) return NaN;
  if (typeof t === "number") return t;
  if (typeof t === "string") {
    const ms = Date.parse(t);
    return isNaN(ms) ? NaN : ms;
  }
  if (typeof t.seconds === "number")
    return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
  if (typeof t.toDate === "function") return t.toDate().getTime();
  return NaN;
}
function timeToString(t) {
  const ms = getTs(t);
  return isNaN(ms) ? "未提供" : new Date(ms).toLocaleString("zh-TW");
}
function isOpenStatus(s) {
  const st = String(s || "").toLowerCase();
  return !["accepted", "rejected", "completed", "canceled", "expired", "closed"].includes(st);
}
function getTaskIcon(type) {
  if (!type) return "🤝";
  if (type.includes("領藥")) return "💊";
  if (type.includes("陪診")) return "🏥";
  return "🤝";
}

/* ---------- 初始化篩選 ---------- */
(function fillCities() {
  Object.keys(cityDistricts).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    citySelect.appendChild(opt);
  });
})();

function loadDistrictChips(city) {
  chipsWrap.innerHTML = "";
  selectedDistricts.clear();
  const districts = cityDistricts[city] || [];
  districts.forEach((d) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = d;
    btn.dataset.value = d;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      if (selectedDistricts.has(d)) {
        selectedDistricts.delete(d);
        btn.setAttribute("aria-pressed", "false");
      } else {
        selectedDistricts.add(d);
        btn.setAttribute("aria-pressed", "true");
      }
      render();
    });
    chipsWrap.appendChild(btn);
  });
}

citySelect.addEventListener("change", () => {
  loadDistrictChips(citySelect.value);
  render();
});
toggleAllBtn.addEventListener("click", () => {
  const city = citySelect.value;
  const list = cityDistricts[city] || [];
  const allSelected = list.every((d) => selectedDistricts.has(d));
  selectedDistricts = new Set(allSelected ? [] : list);
  chipsWrap.querySelectorAll("button.chip").forEach((b) => {
    b.setAttribute(
      "aria-pressed",
      selectedDistricts.has(b.dataset.value) ? "true" : "false"
    );
  });
  render();
});
resetBtn.addEventListener("click", () => {
  citySelect.value = "";
  selectedDistricts.clear();
  chipsWrap.innerHTML = "";
  render();
});

/* ---------- LIFF 登入 ---------- */
async function ensureLIFF() {
  try {
    await liff.init({ liffId: LIFF_ID });
    return true;
  } catch (e) {
    console.error("[TASK-LIST] LIFF init failed:", e);
    alert("LIFF 初始化失敗，請重新整理頁面");
    return false;
  }
}

(async () => {
  const ok = await ensureLIFF();
  if (!ok) return;
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: location.href });
    return;
  }

  try {
    const p = await liff.getProfile();
    currentUid = `line:${p.userId}`;
    console.log("[TASK-LIST] 登入成功 UID:", currentUid);

    const meSnap = await getDoc(doc(db, "users", currentUid));
    if (!meSnap.exists()) {
      console.warn("[TASK-LIST] 找不到使用者資料，導向註冊頁");
      location.href = "register-profile.html";
      return;
    }
    const me = meSnap.data() || {};
    myHasCertificate = me.hasCertificate === "有";

    const qPending = query(collection(db, "requests"), where("status", "==", "pending"));
    onSnapshot(qPending, (snapshot) => {
      tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      console.log(`[TASK-LIST] 取得 ${tasks.length} 筆任務`);
      render();
    }, (err) => {
      console.error("[TASK-LIST] Firestore 監聽錯誤:", err);
    });
  } catch (err) {
    console.error("[TASK-LIST] LIFF 或 Firestore 流程錯誤:", err);
    alert("讀取任務資料時發生錯誤，請重新整理頁面");
  }
})();

/* ---------- 渲染卡片 ---------- */
async function render() {
  taskContainer.innerHTML = "";
  const selCity = citySelect.value;
  const selDistricts = Array.from(selectedDistricts);
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const result = [];

  for (const t of tasks) {
    if (!isOpenStatus(t.status)) continue;
    if (selCity && t.city !== selCity) continue;
    if (selDistricts.length && !selDistricts.includes(t.district)) continue;
    if (currentUid && t.userId === currentUid) continue;

    const taskTime = getTs(t.time);
    if (!isNaN(taskTime)) {
      if (taskTime < now) {
        const taskDate = new Date(taskTime).toDateString();
        const nowDate = new Date(now).toDateString();
        const diffMs = now - taskTime;
        if (taskDate !== nowDate) continue;
        if (diffMs > oneHour) continue;
      }
    }

    const patient = await getUser(t.userId);
    if (patient?.disability && patient.disability !== "無" && !myHasCertificate) continue;

    result.push(t);
  }

  if (!result.length) {
    emptyState.classList.remove("hidden");
    emptyState.textContent = "目前沒有符合條件的任務。";
    return;
  }
  emptyState.classList.add("hidden");

  result.forEach((t) => {
    const card = tpl.content.cloneNode(true);
    card.querySelector(".icon").textContent = getTaskIcon(t.type || "");
    card.querySelector(".task-type").textContent = t.type || "未提供";
    card.querySelector(".task-time").textContent = timeToString(t.time);
    const fullAddr = `${t.city || ""}${t.district || ""}${t.road || ""}`;
    const hosp = t.hospital || "未提供醫院/診所";
    card.querySelector(".task-addr").textContent = `${hosp}｜${fullAddr || "未提供地址"}`;
    card.querySelector(".task-note").textContent = (t.note && String(t.note).trim()) ? t.note : "無";
    card.querySelector(".accept").dataset.id = t.id;
    card.querySelector(".reject").dataset.id = t.id;
    taskContainer.appendChild(card);
  });
}

/* ---------- 接受 / 拒絕任務 ---------- */
taskContainer.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (!btn.classList.contains("accept") && !btn.classList.contains("reject")) return;

  const taskId = btn.dataset.id;
  const status = btn.classList.contains("accept") ? "accepted" : "rejected";
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return alert("找不到任務資料");

  try {
    await updateDoc(doc(db, "requests", taskId), {
      status,
      volunteerId: currentUid,
      updatedAt: new Date(),
    });

    if (status === "accepted" && t) {
      await createMatchForTask(t, currentUid);
      matchModal.classList.remove("hidden");
    } else {
      alert("任務已拒絕");
    }
  } catch (err) {
    console.error("更新任務狀態失敗：", err);
    alert("處理任務時發生錯誤，請重試。");
  }
});

/* ---------- createMatch ---------- */
async function createMatchForTask(task, volunteerUid) {
  const patient = await getUser(task.userId);
  const volunteer = await getUser(volunteerUid);

  await createMatch({
    taskId: task.id,
    patientUserId: pureLineId(task.userId),
    volunteerUserId: pureLineId(volunteerUid),
    patientAuthUid: task.userId,
    volunteerAuthUid: volunteerUid,
    patientName: task.username || task.userName || patient?.username || "未命名患者",
    volunteerName: volunteer?.username || volunteer?.userName || volunteer?.displayName || "志工",
    taskTitle: task.type || "任務",
    hospital: task.hospital || "",
  });
}

/* ---------- 彈窗關閉 ---------- */
function hideMatchModal() {
  matchModal.classList.add("hidden");
}
closeModalBtn?.addEventListener("click", hideMatchModal);
matchModal?.addEventListener("click", (e) => {
  if (e.target === matchModal) hideMatchModal();
});
