// register-profile.js — 使用 LINE (LIFF) + Firebase Custom Token 完成註冊（患者/志工）
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  getAuth, signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";
import { cityDistricts } from "./district-data.js";

/* ========= 依你的專案調整 ========= */
const LIFF_ID = "2007877199-Y5R2LenL";                 // 你的 LIFF ID
const CUSTOM_TOKEN_URL = "https://<你的函式域名>/getFirebaseCustomToken"; // ★★★ 必改 ★★★

/* ========= Firebase ========= */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// 用預設 bucket（不要手動寫 gs://...firebasestorage.app）
const storage = getStorage(app);
const auth = getAuth(app);

/* ========= DOM ========= */
const $ = (id) => document.getElementById(id);
const patientBtn      = $("patientBtn");
const volunteerBtn    = $("volunteerBtn");
const roleHidden      = $("role");
const saveBtn         = $("saveBtn");
const saveTip         = $("saveTip");
const authWarn        = $("authWarn");

// 共用欄位
const nameEl          = $("name");
const phoneEl         = $("phone");
const enameEl         = $("emergencyName");
const ephoneEl        = $("emergencyPhone");

// 患者欄位
const disabilityEl    = $("disability");
const cityEl          = $("city");
const districtEl      = $("district");
const roadEl          = $("road");
const chronicOtherEl  = $("chronicOther");

// 志工欄位
const idCardEl        = $("idCard");
const hasCertEl       = $("hasCert");
const certFileEl      = $("certFile");
const policeEl        = $("police");
const policeFileEl    = $("policeFile");
const licenseFileEl   = $("licenseFile");
const volCityEl       = $("volCity");
const volDistrictEl   = $("volDistrict");

// 區塊
const patientFields   = $("patientFields");
const volunteerFields = $("volunteerFields");
const certUploadSec   = $("certUploadSection");

/* ========= UI：分段切換 ========= */
function toPatient(){
  roleHidden.value = "患者";
  patientBtn.classList.add("active");
  volunteerBtn.classList.remove("active");
  patientFields.classList.remove("hidden");
  volunteerFields.classList.add("hidden");
}
function toVolunteer(){
  roleHidden.value = "志工";
  volunteerBtn.classList.add("active");
  patientBtn.classList.remove("active");
  patientFields.classList.add("hidden");
  volunteerFields.classList.remove("hidden");
}
patientBtn?.addEventListener("click", toPatient);
volunteerBtn?.addEventListener("click", toVolunteer);

// 志工：是否有專業執照 → 切換上傳區
hasCertEl?.addEventListener("change", () => {
  if (hasCertEl.value === "有") certUploadSec.classList.remove("hidden");
  else certUploadSec.classList.add("hidden");
});

/* ========= 行政區：依縣市填入 ========= */
function populateDistricts(citySelect, districtSelect, placeholder = "請選擇行政區", selected = "") {
  const city = citySelect?.value || "";
  districtSelect.innerHTML = "";
  if (!city || !cityDistricts[city]) {
    districtSelect.disabled = true;
    districtSelect.appendChild(new Option(placeholder, "", true, true));
    return;
  }
  districtSelect.disabled = false;
  districtSelect.appendChild(new Option(placeholder, "", true, false));
  cityDistricts[city].forEach(d => {
    districtSelect.appendChild(new Option(d, d, false, d === selected));
  });
}

// 患者
cityEl?.addEventListener("change", () => {
  populateDistricts(cityEl, districtEl, "請選擇行政區");
});
// 志工
volCityEl?.addEventListener("change", () => {
  populateDistricts(volCityEl, volDistrictEl, "志工服務行政區");
});
// 首次載入也先填入 placeholder
populateDistricts(cityEl, districtEl, "請選擇行政區");
populateDistricts(volCityEl, volDistrictEl, "志工服務行政區");

/* ========= LIFF & Firebase Auth（Custom Token） ========= */
function waitForLiff(maxMs = 10000) {
  if (window.liff) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (window.liff) { clearInterval(timer); resolve(); }
      else if (Date.now() - t0 > maxMs) { clearInterval(timer); reject(new Error("LIFF SDK 未載入")); }
    }, 30);
  });
}
async function ensureLIFF(){
  await waitForLiff();
  if (!window.__MW_LIFF_READY__) {
    await liff.init({ liffId: LIFF_ID });
    window.__MW_LIFF_READY__ = true;
  }
}
async function ensureFirebaseAuthViaLINE(){
  await ensureLIFF();
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: location.href });
    throw new Error("redirecting");
  }
  if (auth.currentUser) return auth.currentUser;

  const idToken = liff.getIDToken();
  if (!idToken) {
    authWarn?.classList.remove("hidden");
    throw new Error("no-line-idtoken");
  }
  const resp = await fetch(CUSTOM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ idToken })
  });
  const data = await resp.json();
  if (!resp.ok || !data.token) throw new Error(data.error || "custom-token-failed");
  const cred = await signInWithCustomToken(auth, data.token);
  return cred.user;
}

/* ========= 小工具 ========= */
const notEmpty = (v) => String(v || "").trim().length > 0;
const getCheckedValues = (name) => Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(i => i.value);
function uiBusy(b){
  saveBtn.disabled = !!b;
  saveBtn.textContent = b ? "處理中…" : "儲存並完成註冊";
}
async function uploadIfSelected(pathPrefix, fileInput){
  const f = fileInput?.files?.[0];
  if (!f) return null;
  const ts = Date.now();
  const safeName = f.name.replace(/\s+/g, "_");
  const fullPath = `${pathPrefix}/${ts}_${safeName}`;
  const snap = await uploadBytes(ref(storage, fullPath), f);
  const url  = await getDownloadURL(snap.ref);
  return { path: fullPath, url, name: f.name, uploadedAt: new Date().toISOString() };
}

/* ========= 進頁：若已登入 LINE，帶入暱稱當 placeholder ========= */
(async () => {
  try {
    await ensureLIFF();
    if (liff.isLoggedIn()) {
      const p = await liff.getProfile().catch(()=>null);
      if (p && nameEl && !nameEl.value) nameEl.placeholder = `姓名（LINE：${p.displayName || ""}）`;
    }
  } catch { /* ignore */ }
})();

/* ========= 送出註冊 ========= */
saveBtn?.addEventListener("click", async () => {
  try{
    uiBusy(true);
    saveTip.textContent = "準備登入…";
    const user = await ensureFirebaseAuthViaLINE(); // 先登入 Firebase Auth（通過 Storage 規則）
    if (!user) return;
    const uid = user.uid;  // e.g. liff:Uxxxxxxxx
    const provider = "line";

    // 角色
    const role = roleHidden.value === "志工" ? "志工" : "患者";

    // 基本資料
    const base = {
      uid, provider, role,
      name: nameEl.value.trim(),
      phone: phoneEl.value.trim(),
      emergencyName: enameEl.value.trim(),
      emergencyPhone: ephoneEl.value.trim(),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    };

    let extra = {};

    if (role === "患者") {
      // 慢性病史
      const chronic = getCheckedValues("chronic");
      const otherChecked = document.querySelector('input[name="chronic"][value="其他"]')?.checked;
      if (otherChecked && notEmpty(chronicOtherEl.value)) chronic.push(chronicOtherEl.value.trim());

      // 地址必填
      if (!notEmpty(cityEl.value) || !notEmpty(districtEl.value) || !notEmpty(roadEl.value)) {
        alert("請完整填寫居住地址（縣市、行政區、詳細地址）。");
        uiBusy(false); return;
      }
      extra = {
        disability: disabilityEl.value || "",
        chronic,
        city: cityEl.value || "",
        district: districtEl.value || "",
        road: (roadEl.value || "").trim()
      };
    } else {
      // 志工必填檢查
      if (!notEmpty(policeEl.value)) { alert("請輸入良民證編號"); uiBusy(false); return; }
      if (!policeFileEl.files?.length) { alert("請上傳良民證照片"); uiBusy(false); return; }
      if (!licenseFileEl.files?.length) { alert("請上傳駕照照片"); uiBusy(false); return; }
      if (!notEmpty(volCityEl.value) || !notEmpty(volDistrictEl.value)) { alert("請選擇志工服務地區（縣市/行政區）"); uiBusy(false); return; }

      // 附件上傳
      saveTip.textContent = "上傳志工附件…";
      const policeCert  = await uploadIfSelected(`police_certificates/${uid}`,  policeFileEl);
      const licenseFile = await uploadIfSelected(`licenses/${uid}`,             licenseFileEl);
      const volCert     = (hasCertEl.value === "有") ? await uploadIfSelected(`volunteer_certificates/${uid}`, certFileEl) : null;

      extra = {
        idCard: idCardEl.value.trim(),
        hasCertificate: hasCertEl.value || "",
        police: policeEl.value.trim(),
        city: volCityEl.value || "",
        district: volDistrictEl.value || "",
        policeCert, licenseFile,
        volunteerCertificate: volCert
      };
    }

    // 寫入 Firestore
    saveTip.textContent = "寫入基本資料…";
    await setDoc(doc(db, "users", uid), { ...base, ...extra }, { merge: true });

    alert("✅ 註冊完成！現在可以回登入頁使用帳號了。");
    location.href = "login.html";
  } catch (err) {
    if (String(err?.message || "").includes("redirecting")) return; // liff.login() 已重導
    console.error("註冊失敗：", err);
    alert("❌ 儲存失敗：可能是 Storage 權限或網路問題。若尚未部署 Custom Token，請先暫時放寬 Storage 規則或完成 Functions 設定。");
  } finally {
    uiBusy(false);
  }
});
