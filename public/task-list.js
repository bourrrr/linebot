import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const taskContainer = document.getElementById("taskContainer");

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("請先登入");
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  // 取得志工所在城市（不比較區域）
  const userQuery = query(collection(db, "users"), where("uid", "==", user.uid));
  const userSnapshot = await getDocs(userQuery);
  if (userSnapshot.empty) {
    alert("找不到使用者資料");
    return;
  }

  const volunteerData = userSnapshot.docs[0].data();
  const volunteerCity = volunteerData.city;

  // 撈所有 status 為 pending 的任務
  const q = query(collection(db, "requests"), where("status", "==", "pending"));
  const snapshot = await getDocs(q);

  snapshot.forEach(docSnap => {
    const data = docSnap.data();

    // ✅ 只比對同城市（縣市）的任務
    if (data.city === volunteerCity) {
      const card = document.createElement("div");
      card.className = "bg-white p-4 rounded-xl shadow";

      card.innerHTML = `
        <h2 class="text-lg font-bold">📍 ${data.city}${data.district}${data.road}</h2>
        <p>醫院：${data.hospital || '未提供'}</p>
        <p>類型：${data.type}</p>
        <p>時間：${new Date(data.time).toLocaleString()}</p>
        <p>備註：${data.note || '無'}</p>
        <div class="mt-3 flex gap-2">
          <button class="accept bg-green-500 text-white px-4 py-1 rounded" data-id="${docSnap.id}">接受</button>
          <button class="reject bg-red-500 text-white px-4 py-1 rounded" data-id="${docSnap.id}">拒絕</button>
        </div>
      `;

      taskContainer.appendChild(card);
    }
  });
});

taskContainer.addEventListener("click", async (e) => {
  if (e.target.classList.contains("accept") || e.target.classList.contains("reject")) {
    const taskId = e.target.dataset.id;
    const status = e.target.classList.contains("accept") ? "accepted" : "rejected";
    const taskRef = doc(db, "requests", taskId);

    await updateDoc(taskRef, {
      status,
      volunteerId: currentUser.uid,
      updatedAt: new Date()
    });

    alert(`任務已${status === "accepted" ? "接受" : "拒絕"}`);
    location.reload();
  }
});
