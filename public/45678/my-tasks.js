import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  Timestamp,
  addDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 指定 bucket（沿用你的設定）
const storage = getStorage(app, "gs://medwell-test1.firebasestorage.app");

const container = document.getElementById("myTaskContainer");
const emptyHint = document.getElementById("emptyStateHint");

/* ========================
   自動完成：參數 & 工具
======================== */
const DURATION_MINUTES = 90;
const GRACE_MINUTES = 30;
const ENABLE_DB_WRITEBACK = true;

function getTs(t){
  try{
    if (!t) return NaN;
    if (typeof t === "number") return t;
    if (typeof t === "string") {
      const ms = Date.parse(t);
      return isNaN(ms) ? NaN : ms;
    }
    if (typeof t.seconds === "number") return t.seconds * 1000 + Math.floor((t.nanoseconds||0)/1e6);
    if (typeof t.toDate === "function") return t.toDate().getTime();
    return NaN;
  }catch{ return NaN; }
}

function computeStatus(taskData){
  const startMs = getTs(taskData.time || taskData.appointmentAt);
  if (isNaN(startMs)) {
    return (taskData.status || "").toLowerCase() === "completed" ? "done" : "active";
  }
  const endMs = getTs(taskData.endAt);
  const assumedEnd = isNaN(endMs) ? (startMs + DURATION_MINUTES * 60 * 1000) : endMs;
  const cutoff = assumedEnd + GRACE_MINUTES * 60 * 1000;
  if ((taskData.status || "").toLowerCase() === "completed") return "done";
  return (Date.now() >= cutoff) ? "done" : "active";
}

const safe = (v) => (v === undefined || v === null ? "" : String(v));
const fmtTime = (t) => {
  const ms = getTs(t);
  return isNaN(ms) ? "-" : new Date(ms).toLocaleString();
};
const composeAddress = (d) => `${safe(d.city)}${safe(d.district)}${safe(d.road)}`.trim();

/* ========================
   地圖導航：通用開啟
======================== */
function makeMapsUrl({ lat, lng, query, travelMode = "driving" }){
  let dest = "";
  if (typeof lat === "number" && typeof lng === "number" && !Number.isNaN(lat) && !Number.isNaN(lng)){
    dest = `${lat},${lng}`;
  } else if (query) {
    dest = encodeURIComponent(query);
  } else {
    return "";
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${encodeURIComponent(travelMode)}`;
}

function getMeetingNavUrl(data){
  const lat = (typeof data.meetingLat === "number") ? data.meetingLat : undefined;
  const lng = (typeof data.meetingLng === "number") ? data.meetingLng : undefined;
  const address = composeAddress(data) || null;
  return makeMapsUrl({ lat, lng, query: address });
}

// 加強醫院定位：優先經緯度；否則用「醫院名稱 + 城市」；再不行退回任務地址
function getHospitalNavUrl(data){
  const lat = (typeof data.hospitalLat === "number") ? data.hospitalLat : undefined;
  const lng = (typeof data.hospitalLng === "number") ? data.hospitalLng : undefined;

  // 以醫院/診所/藥局名稱為主
  const hospitalName = safe(data.hospital).trim();
  // 加上城市提升命中率（例如「高雄榮民總醫院 高雄」）
  const cityHint = safe(data.city).trim();
  const nameWithCity = hospitalName && cityHint ? `${hospitalName} ${cityHint}` : hospitalName;

  // 如果前兩者都沒有，再退回任務地址
  const fallbackAddr = composeAddress(data) || null;

  const query = nameWithCity || fallbackAddr || null;
  return makeMapsUrl({ lat, lng, query });
}

/* ========================
   導航按鈕樣式（溫暖、低飽和）
======================== */
const NAV_BTN_CLASS =
  "text-white/95 px-3 py-1.5 rounded-xl border border-[var(--border)] shadow-sm transition-colors disabled:opacity-60 hover:brightness-95";
const NAV_BTN_STYLE = "background: var(--primary-weak);"; // 柔和主色（在頁面 :root 已定義）

/* ========================
   渲染卡片
======================== */
function renderTaskCard(docSnap){
  const data = docSnap.data();
  const taskId = docSnap.id;

  const card = document.createElement("div");
  card.className = "task-card bg-white p-4 rounded-xl shadow space-y-2";
  card.dataset.taskId = taskId;

  const uiStatus = computeStatus(data);
  card.dataset.status = uiStatus;

  card.__data = { ...data, id: taskId };
  card.__autoWriteInFlight = false;
  card.__autoCompletedPersisted = (data.status || "").toLowerCase() === "completed";

  const meetUrl = getMeetingNavUrl(data);
  const hospUrl = getHospitalNavUrl(data);
  const disableHosp = !hospUrl;
  const disableMeet = !meetUrl;

  card.innerHTML = `
    <h2 class="task-title text-lg font-bold">📍 ${composeAddress(data) || "未提供地址"}</h2>
    <p>🏥 醫院名稱：${safe(data.hospital) || "未提供"}</p>
    <p>🙋‍♂️ 是否陪同進診間：${safe(data.accompany) || "未提供"}</p>
    <p>類型：${safe(data.type) || "-"}</p>
    <p>時間：${fmtTime(data.time)}</p>
    <p>備註：${safe(data.note) || "無"}</p>

    <!-- 導航按鈕列（溫暖配色 + 正確 data-url） -->
    <div class="mt-2 flex flex-wrap gap-2">
      <button class="nav-meet ${NAV_BTN_CLASS}" style="${NAV_BTN_STYLE}" data-url="${meetUrl || ""}" ${disableMeet ? "disabled" : ""}>🧭 導航到會合地點</button>
      <button class="nav-hospital ${NAV_BTN_CLASS}" style="background: var(--chip); color: var(--primary);" data-url="${hospUrl || ""}" ${disableHosp ? "disabled" : ""}>🏥 導航到醫院</button>
    </div>

    <!-- 上傳回報 -->
    <div class="mt-2 space-y-2">
      <input type="file" accept="image/*" data-id="${taskId}" />
      <progress max="100" value="0" class="hidden w-full h-2 bg-gray-200 rounded" data-id="${taskId}"></progress>
      <button class="upload-btn bg-green-600 text-white px-4 py-1 rounded" data-id="${taskId}">上傳回報照片</button>
    </div>

    ${data.photoURL ? `
      <div class="mt-2">
        <img src="${data.photoURL}" class="w-32 h-auto rounded object-contain" style="max-height: 200px;" />
        <button class="delete-photo text-red-500 text-sm mt-1" data-url="${data.photoURL}" data-id="${taskId}">刪除圖片</button>
      </div>` : ""}

    <p class="text-sm text-gray-500 mt-1">更新時間：${data.updatedAt ? fmtTime(data.updatedAt) : "尚未更新"}</p>
  `;

  return card;
}

/* ========================
   自動結案：寫回 Firestore
======================== */
async function persistAutoCompleteIfNeeded(card){
  if (!ENABLE_DB_WRITEBACK) return;
  if (card.__autoWriteInFlight || card.__autoCompletedPersisted) return;

  const data = card.__data;
  const next = computeStatus(data);

  if (next === "done" && (data.status || "").toLowerCase() !== "completed") {
    try{
      card.__autoWriteInFlight = true;
      await updateDoc(doc(db, "requests", data.id), {
        status: "completed",
        updatedAt: Timestamp.now(),
        autoCompleteReason: "time_passed"
      });
      data.status = "completed";
      card.__autoCompletedPersisted = true;
    }catch(err){
      console.error("自動結案寫回失敗", err);
    }finally{
      card.__autoWriteInFlight = false;
    }
  }
}

/* ========================
   每分鐘重算狀態（純前端）
======================== */
function startStatusRecomputeTimer(){
  setInterval(() => {
    const cards = Array.from(container.querySelectorAll(".task-card"));
    cards.forEach((card) => {
      const data = card.__data;
      if (!data) return;

      const next = computeStatus(data);
      if (card.dataset.status !== next) {
        card.dataset.status = next;
      }
      persistAutoCompleteIfNeeded(card);
    });
    window.dispatchEvent(new Event("tasksStatusRecomputed"));
  }, 60_000);
}

/* ========================
   主流程：載入任務並渲染
======================== */
onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      alert("請先登入");
      location.href = "login.html";
      return;
    }

    const q = query(
      collection(db, "requests"),
      where("status", "==", "accepted"),
      where("volunteerId", "==", user.uid)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      container.innerHTML = "<p class='text-center text-gray-500'>目前尚無已接受的任務。</p>";
      emptyHint && emptyHint.classList.remove("hidden");
      return;
    } else {
      emptyHint && emptyHint.classList.add("hidden");
    }

    snapshot.forEach(docSnap => {
      const card = renderTaskCard(docSnap);
      container.appendChild(card);
    });

    Array.from(container.querySelectorAll(".task-card")).forEach(persistAutoCompleteIfNeeded);
    startStatusRecomputeTimer();

    /* === 事件委派：導航 / 上傳 / 刪除 === */
    container.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      // 導航
      if (btn.classList.contains("nav-meet") || btn.classList.contains("nav-hospital")) {
        const url = btn.dataset.url;
        if (!url) { alert("找不到此地點資訊，請確認任務地址或醫院名稱。"); return; }
        window.open(url, "_blank", "noopener");
        return;
      }

      // 上傳
      if (btn.classList.contains("upload-btn")) {
        const taskId = btn.dataset.id;
        const input = container.querySelector(`input[data-id="${taskId}"]`);
        const file = input && input.files && input.files[0];
        const progress = container.querySelector(`progress[data-id="${taskId}"]`);
        if (!file) return alert("請選擇要上傳的照片");

        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        const fileName = `${taskId}_${Date.now()}.${ext}`;
        const filePath = `my_task/${taskId}/${fileName}`;
        const storageRef = ref(storage, filePath);
        progress.classList.remove("hidden");

        try {
          const uploadTask = uploadBytesResumable(storageRef, file);
          uploadTask.on(
            "state_changed",
            (snap) => {
              const percent = Math.floor((snap.bytesTransferred / snap.totalBytes) * 100);
              progress.value = percent;
            },
            (err) => {
              console.error("❌ 上傳失敗：", err);
              alert(`❌ 上傳失敗：${err.code || ""} ${err.message || ""}\n請檢查 Storage 規則或 bucket 設定。`);
              progress.classList.add("hidden");
            },
            async () => {
              const photoURL = await getDownloadURL(uploadTask.snapshot.ref);

              await updateDoc(doc(db, "requests", taskId), {
                photoURL,
                status: "completed",
                updatedAt: Timestamp.now()
              });

              await addDoc(collection(db, "my_task"), {
                taskId,
                volunteerId: user.uid,
                photoURL,
                status: "completed",
                updatedAt: Timestamp.now()
              });

              alert("✅ 上傳成功！");
              location.reload();
            }
          );
        } catch (err) {
          console.error("初始化失敗", err);
          alert("❌ 初始化 Storage 失敗：" + err.message);
          progress.classList.add("hidden");
        }
        return;
      }

      // 刪除回報照片
      if (btn.classList.contains("delete-photo")) {
        const url = btn.dataset.url;
        const taskId = btn.dataset.id;
        try {
          const fileRef = ref(storage, url);
          await deleteObject(fileRef);

          await updateDoc(doc(db, "requests", taskId), {
            photoURL: "",
            updatedAt: Timestamp.now()
          });

          alert("🗑️ 已刪除圖片");
          location.reload();
        } catch (err) {
          console.error("刪除失敗", err);
          alert(`❌ 刪除失敗：${err.code || ""} ${err.message || ""}`);
        }
      }
    });

    // 快速上傳回報（配合 my-tasks.html）
    window.handleQuickReportUpload = async (taskId, files) => {
      if (!files || !files.length) throw new Error("沒有選擇檔案");
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        const fileName = `${taskId}_${Date.now()}_${i}.${ext}`;
        const storageRef = ref(storage, `my_task/${taskId}/${fileName}`);
        await uploadBytesResumable(storageRef, file);
        const url = await getDownloadURL(storageRef);

        if (i === 0) {
          await updateDoc(doc(db, "requests", taskId), {
            photoURL: url,
            status: "completed",
            updatedAt: Timestamp.now()
          });
        }
        await addDoc(collection(db, "my_task"), {
          taskId,
          volunteerId: auth.currentUser?.uid || "",
          photoURL: url,
          status: "completed",
          updatedAt: Timestamp.now()
        });
      }
      location.reload();
    };

  } catch (err) {
    console.error("頁面初始化錯誤：", err);
    alert("載入任務失敗，請開 F12 → Console 給我錯誤訊息。");
  }
});
