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
  addDoc
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

// 🔧 明確指定 bucket（依你後台截圖）
const storage = getStorage(app, "gs://medwell-test1.firebasestorage.app");

const container = document.getElementById("myTaskContainer");

// 小工具：安全轉字串
const safe = (v) => (v === undefined || v === null ? "" : String(v));
// 小工具：支援 Firestore Timestamp / 毫秒 / ISO
const fmtTime = (t) => {
  try {
    if (!t) return "-";
    if (t.seconds) return new Date(t.seconds * 1000).toLocaleString();
    const d = typeof t === "number" ? new Date(t) : new Date(String(t));
    return isNaN(d.getTime()) ? "-" : d.toLocaleString();
  } catch { return "-"; }
};

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
      return;
    }

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const card = document.createElement("div");
      card.className = "bg-white p-4 rounded-xl shadow space-y-2";

      card.innerHTML = `
        <h2 class="text-lg font-bold">📍 ${safe(data.city)}${safe(data.district)}${safe(data.road)}</h2>
        <p>🏥 醫院名稱：${safe(data.hospital) || "未提供"}</p>
        <p>🙋‍♂️ 是否陪同進診間：${safe(data.accompany) || "未提供"}</p>
        <p>類型：${safe(data.type) || "-"}</p>
        <p>時間：${fmtTime(data.time)}</p>
        <p>備註：${safe(data.note) || "無"}</p>

        <input type="file" accept="image/*" data-id="${docSnap.id}" />
        <progress max="100" value="0" class="hidden w-full h-2 bg-gray-200 rounded" data-id="${docSnap.id}"></progress>
        <button class="upload-btn bg-green-500 text-white px-4 py-1 rounded" data-id="${docSnap.id}">上傳回報照片</button>

        ${data.photoURL ? `
          <div class="mt-2">
            <img src="${data.photoURL}" class="w-32 h-auto rounded object-contain" style="max-height: 200px;" />
            <button class="delete-photo text-red-500 text-sm mt-1" data-url="${data.photoURL}" data-id="${docSnap.id}">刪除圖片</button>
          </div>` : ""}

        <p class="text-sm text-gray-500 mt-1">更新時間：${data.updatedAt ? fmtTime(data.updatedAt) : "尚未更新"}</p>
      `;

      container.appendChild(card);
    });

    // 事件委派：上傳 / 刪除
    container.addEventListener("click", async (e) => {
      // 上傳
      const uploadBtn = e.target.closest(".upload-btn");
      if (uploadBtn) {
        const taskId = uploadBtn.dataset.id;
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

              // 更新 requests
              await updateDoc(doc(db, "requests", taskId), {
                photoURL,
                status: "completed",
                updatedAt: Timestamp.now()
              });

              // 新增 my_task 紀錄（避免爆量，你之後可改為 setDoc 覆蓋）
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

      // 刪除
      const delBtn = e.target.closest(".delete-photo");
      if (delBtn) {
        const url = delBtn.dataset.url;
        const taskId = delBtn.dataset.id;
        try {
          // 下載 URL 也能用 ref(storage, url) 取得參考
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
  } catch (err) {
    console.error("頁面初始化錯誤：", err);
    alert("載入任務失敗，請開 F12 → Console 給我錯誤訊息。");
  }
});
