import { cityDistricts } from './district-data.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  Timestamp,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 城市與區域下拉選單
const city = document.getElementById("city");
const district = document.getElementById("district");

city.addEventListener('change', () => {
  const val = city.value;
  district.innerHTML = '<option value="">請選擇行政區</option>';
  if (cityDistricts[val]) {
    cityDistricts[val].forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      district.appendChild(opt);
    });
    district.disabled = false;
  } else {
    district.disabled = true;
  }
});

// 類型切換欄位顯示
const typeSelect = document.getElementById("type");
const medFields = document.getElementById("medFields");
const visitFields = document.getElementById("visitFields");

typeSelect.addEventListener("change", () => {
  if (typeSelect.value === "領藥") {
    medFields.classList.remove("hidden");
    visitFields.classList.add("hidden");
  } else if (typeSelect.value === "陪診") {
    visitFields.classList.remove("hidden");
    medFields.classList.add("hidden");
  } else {
    medFields.classList.add("hidden");
    visitFields.classList.add("hidden");
  }
});

// 表單送出
document.getElementById("publishForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const type = document.getElementById("type").value;
  const city = document.getElementById("city").value;
  const district = document.getElementById("district").value;
  const road = document.getElementById("road").value;
  const time = document.getElementById("time").value;
  const hospital = document.getElementById("hospital").value;
  const note = document.getElementById("note")?.value || "";
  const accompany = document.getElementById("accompany")?.value || "";
  const prescription = document.getElementById("prescription")?.value || "";

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      alert("⚠️ 請先登入再發布請求！");
      window.location.href = 'login.html';
      return;
    }

    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      const userName = userDocSnap.exists() ? userDocSnap.data().name || "匿名" : "匿名";

      const docData = {
        userId: user.uid,
        userName,
        type,
        city,
        district,
        road,
        time,
        hospital,
        note,
        accompany: type === "陪診" ? accompany : "",
        prescription: type === "領藥" ? prescription : "",
        status: "pending",
        createdAt: Timestamp.now()
      };

      await addDoc(collection(db, "requests"), docData);
      await addDoc(collection(db, "users", user.uid, "records"), docData);

      alert("✅ 發布成功！");
      window.location.href = "home.html";
    } catch (err) {
      console.error("❌ 發布失敗", err);
      alert("❌ 發布失敗，請稍後再試。");
    }
  });
});
