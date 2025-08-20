// register-profile.js
// 依角色儲存資料到 Firestore，完成後自動導頁（志工→volunteer.html / 患者→home.html）

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// 你的專案設定
import { firebaseConfig } from "./firebase-config.js";
// 縣市/行政區資料
import { cityDistricts } from "./district-data.js";

// ===== Firebase =====
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// ===== LIFF =====
const LIFF_ID = "2007877199-Y5R2LenL";
let CURRENT_LIFF = { uid: "", name: "" };

// 確保 LIFF 已初始化
async function ensureLIFF() {
  if (!window.liff) {
    // 極端情況：HTML 忘記載入 SDK，就動態補
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  if (!window.MW_LIFF_READY) {
    await liff.init({ liffId: LIFF_ID });
    window.MW_LIFF_READY = true;
  }
}

async function requireLineIdentity() {
  try {
    await ensureLIFF();
    if (!liff.isLoggedIn()) {
      // 自動帶去登入，回跳到本頁
      await liff.login({ redirectUri: window.location.href });
      return false; // 會回跳本頁再執行一次
    }
    const p = await liff.getProfile();
    CURRENT_LIFF.uid = `liff:${p.userId}`;
    CURRENT_LIFF.name = p.displayName || "";

    document.getElementById("authWarn")?.classList.add("hidden");
    // 開放按鈕
    const btn = document.getElementById("saveBtn") || document.getElementById("saveProfileBtn");
    if (btn) btn.disabled = false;

    // 預填 placeholder
    const nameEl = document.getElementById("name");
    if (nameEl && !nameEl.value) nameEl.placeholder = `姓名（LINE：${CURRENT_LIFF.name}）`;
    return true;
  } catch (e) {
    console.error("LIFF 初始化失敗：", e);
    document.getElementById("authWarn")?.classList.remove("hidden");
    const btn = document.getElementById("saveBtn") || document.getElementById("saveProfileBtn");
    if (btn) btn.disabled = false; // 仍允許你點擊，save 時會再擋
    return false;
  }
}

// ===== 角色 UI =====
function setActiveRole(role) {
  const patientBtn = document.getElementById("patientBtn");
  const volunteerBtn = document.getElementById("volunteerBtn");
  const roleInput = document.getElementById("role");
  const patientFields = document.getElementById("patientFields");
  const volunteerFields = document.getElementById("volunteerFields");

  if (role === "志工") {
    volunteerBtn?.classList.add("active");
    patientBtn?.classList.remove("active");
    roleInput.value = "志工";
    patientFields?.classList.add("hidden");
    volunteerFields?.classList.remove("hidden");
  } else {
    patientBtn?.classList.add("active");
    volunteerBtn?.classList.remove("active");
    roleInput.value = "患者";
    patientFields?.classList.remove("hidden");
    volunteerFields?.classList.add("hidden");
  }
}
document.getElementById("patientBtn")?.addEventListener("click", () => setActiveRole("患者"));
document.getElementById("volunteerBtn")?.addEventListener("click", () => setActiveRole("志工"));
// 初始化一次
setActiveRole(document.getElementById("role")?.value === "志工" ? "志工" : "患者");

// ===== 縣市/行政區連動（患者 + 志工服務區） =====
(function initCityDistrict() {
  const citySel = document.getElementById("city");
  const distSel = document.getElementById("district");
  const volCitySel = document.getElementById("volCity");
  const volDistSel = document.getElementById("volDistrict");

  function fillCities(sel) {
    if (!sel) return;
    sel.innerHTML = '<option value="">請選擇縣市</option>';
    Object.keys(cityDistricts).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      sel.appendChild(opt);
    });
  }
  function onCityChange(fromSel, toSel) {
    const city = fromSel.value;
    toSel.innerHTML = '<option value="">請選擇行政區</option>';
    if (city && cityDistricts[city]) {
      cityDistricts[city].forEach(d => {
        const opt = document.createElement("option");
        opt.value = d; opt.textContent = d;
        toSel.appendChild(opt);
      });
      toSel.disabled = false;
    } else {
      toSel.disabled = true;
    }
  }

  fillCities(citySel);
  fillCities(volCitySel);

  citySel?.addEventListener("change", () => onCityChange(citySel, distSel));
  volCitySel?.addEventListener("change", () => onCityChange(volCitySel, volDistSel));
})();

// ===== 儲存 =====
async function saveProfile() {
  if (!CURRENT_LIFF.uid) {
    alert("請先用 LINE 登入再進行註冊。");
    return;
  }
  const uid = CURRENT_LIFF.uid;

  const role = document.getElementById("role").value;
  const name = (document.getElementById("name").value || "").trim() || CURRENT_LIFF.name || "";
  const phone = (document.getElementById("phone").value || "").trim();
  const emergencyName = (document.getElementById("emergencyName").value || "").trim();
  const emergencyPhone = (document.getElementById("emergencyPhone").value || "").trim();

  if (!name) { alert("請輸入姓名"); return; }

  const baseData = {
    uid, role, name, phone, emergencyName, emergencyPhone,
    provider: "line",
    liffUid: uid.replace(/^liff:/, ""),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  try {
    if (role === "患者") {
      const chronic = Array.from(document.querySelectorAll("input[name='chronic']:checked")).map(el => el.value);
      const chronicOther = (document.getElementById("chronicOther").value || "").trim();
      const city = (document.getElementById("city").value || "");
      const district = (document.getElementById("district").value || "");
      const road = (document.getElementById("road").value || "").trim();
      const disability = (document.getElementById("disability").value || "");

      Object.assign(baseData, { chronic, chronicOther, city, district, road, disability });
    } else {
      // 志工欄位
      const idCard = (document.getElementById("idCard").value || "").trim();
      const hasCert = (document.getElementById("hasCert").value || "無");
      const police = (document.getElementById("police").value || "").trim();
      const vCity = (document.getElementById("volCity").value || "");
      const vDistrict = (document.getElementById("volDistrict").value || "");
      Object.assign(baseData, { idCard, hasCert, police, city: vCity, district: vDistrict });

      // 檔案上傳（路徑與你現有規則一致）
      const policeFile = document.getElementById("policeFile")?.files?.[0];
      const licenseFile = document.getElementById("licenseFile")?.files?.[0];
      const certFile = document.getElementById("certFile")?.files?.[0];

      if (!policeFile) { alert("請上傳良民證照片"); return; }
      if (!licenseFile) { alert("請上傳駕照照片"); return; }

      // 良民證
      {
        const pRef = ref(storage, `police_certificates/${uid}/police_${Date.now()}_${policeFile.name}`);
        const snap = await uploadBytes(pRef, policeFile);
        baseData.policeUrl = await getDownloadURL(snap.ref);
      }
      // 駕照
      {
        const lRef = ref(storage, `licenses/${uid}/license_${Date.now()}_${licenseFile.name}`);
        const snap = await uploadBytes(lRef, licenseFile);
        baseData.licenseUrl = await getDownloadURL(snap.ref);
      }
      // 志工證明（選填）
      if (hasCert === "有" && certFile) {
        const cRef = ref(storage, `volunteer_certificates/${uid}/cert_${Date.now()}_${certFile.name}`);
        const snap = await uploadBytes(cRef, certFile);
        baseData.certUrl = await getDownloadURL(snap.ref);
      }
    }

    // ✅ 寫到 users/{uid}
    await setDoc(doc(db, "users", uid), baseData, { merge: true });

    // ✅ 依角色導頁
    if (role === "志工") {
      alert("✅ 註冊完成，將導向志工首頁。");
      window.location.href = "volunteer.html";
    } else {
      alert("✅ 註冊完成，將導向患者首頁。");
      window.location.href = "home.html";
    }
  } catch (err) {
    console.error(err);
    alert("❌ 儲存失敗：" + (err?.message || err));
  }
}

// 綁定按鈕（相容兩種 id）
(function bindSaveButton() {
  const btn = document.getElementById("saveBtn") || document.getElementById("saveProfileBtn");
  if (btn) {
    btn.disabled = true; // 預設先鎖，等 LIFF 讀到身分再開
    btn.addEventListener("click", saveProfile);
  }
})();

// 初始化：檢查 LINE 身分
requireLineIdentity();
