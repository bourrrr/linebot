// register-profile.js — 使用 LINE (LIFF) + Firebase Custom Token 完成註冊（患者/志工）
// ★ 本版：患者/志工 皆為「一步一步引導」補齊必填；志工端順序固定如下：
//   姓名 → 手機 → 緊急聯絡人（姓名＋電話） → 身分證號 → 是否有執照 → 良民證編號 → 良民證照片 → 駕照照片 → 服務地區（縣市/行政區）→（若選「有執照」）志工證明上傳

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, serverTimestamp, getDoc
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
const LIFF_ID = "2007877199-Y5R2LenL"; // 你的 LIFF ID
const CUSTOM_TOKEN_URL = "https://asia-east1-medwell-test1.cloudfunctions.net/authApi/getFirebaseCustomToken"; // ★★★ 必改 ★★★

/* ========= Firebase ========= */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

/* ========= DOM ========= */
const $ = (id) => document.getElementById(id);
const patientBtn        = $("patientBtn");
const volunteerBtn      = $("volunteerBtn");
const roleHidden        = $("role");
const saveBtn           = $("saveBtn");
const saveTip           = $("saveTip");
const authWarn          = $("authWarn");

// 共用欄位
const nameEl            = $("name");
const phoneEl           = $("phone");
const enameEl           = $("emergencyName");
const ephoneEl          = $("emergencyPhone");

// 患者欄位
const disabilityEl      = $("disability");
const cityEl            = $("city");
const districtEl        = $("district");
const chronicOtherEl    = $("chronicOther");

// 志工欄位
const idCardEl          = $("idCard");
const hasCertEl         = $("hasCert");
const certFileEl        = $("certFile");
const policeEl          = $("police");
const policeFileEl      = $("policeFile");
const licenseFileEl     = $("licenseFile");
const volCityEl         = $("volCity");
const volDistrictEl     = $("volDistrict");

// 區塊
const patientFields     = $("patientFields");
const volunteerFields = $("volunteerFields");
const certUploadSec     = $("certUploadSection");

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
cityEl?.addEventListener("change", () => populateDistricts(cityEl, districtEl, "請選擇行政區"));
volCityEl?.addEventListener("change", () => populateDistricts(volCityEl, volDistrictEl, "志工服務行政區"));
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  if (!resp.ok) throw new Error("Custom Token API HTTP " + resp.status);

  const { customToken, error } = await resp.json();
  if (!customToken) throw new Error("Custom Token API 失敗：" + (error || "no customToken"));

  const cred = await signInWithCustomToken(auth, customToken);
  return cred.user;
}

/* ========= 小工具 ========= */
const notEmpty = (v) => String(v || "").trim().length > 0;
// 新增：台灣手機號碼格式驗證 (09 開頭，共 10 碼)
const isValidTaiwanPhone = (v) => {
  const phone = String(v || "").trim();
  return /^09[0-9]{8}$/.test(phone);
};
const getCheckedValues = (name) =>
  Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(i => i.value);

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

/* ========= 引導：通用錯誤顯示 / 清除 ========= */
function showInlineError(el, msg){
  if (!el) return;
  el.classList.add("border-red-400","ring","ring-red-300");
  el.setAttribute("aria-invalid","true");
  let m = el.nextElementSibling && el.nextElementSibling.classList?.contains("mw-err-msg")
    ? el.nextElementSibling
    : null;
  if (!m) {
    m = document.createElement("div");
    m.className = "mw-err-msg text-xs text-red-600 mt-1";
    el.insertAdjacentElement("afterend", m);
  }
  m.textContent = msg;
}
function clearInlineError(el){
  if (!el) return;
  el.classList.remove("border-red-400","ring","ring-red-300");
  el.removeAttribute("aria-invalid");
  if (el.nextElementSibling && el.nextElementSibling.classList?.contains("mw-err-msg")) {
    el.nextElementSibling.remove();
  }
}
function scrollFocus(el){
  if (!el) return;
  el.scrollIntoView({ behavior:"smooth", block:"center" });
  setTimeout(()=> el.focus?.(), 160);
}

/* ========= 引導提示條（教練條） ========= */
let coachBar = null;
function renderCoachBar(stepIndex, total, message){
  if (!coachBar){
    coachBar = document.createElement("div");
    coachBar.className = "fixed left-4 right-4 bottom-4 z-50 bg-white border border-[var(--border)] rounded-2xl shadow-2xl p-4 flex items-center justify-between";
    coachBar.innerHTML = `
      <div class="min-w-0">
        <div id="mwCoachTitle" class="font-extrabold text-[15px]" style="color:var(--primary)">尚有必填未完成</div>
        <div id="mwCoachMsg" class="text-xs mt-1" style="color:var(--muted)"></div>
      </div>
      <div class="shrink-0 flex items-center gap-2">
        <button id="mwCoachFocus" class="px-3 py-2 rounded-xl border text-sm" style="border-color:var(--border);color:var(--text)">前往欄位</button>
        <button id="mwCoachNext" class="px-3 py-2 rounded-xl text-sm font-bold" style="background:var(--primary);color:#fff;opacity:.4" disabled>下一步</button>
      </div>
    `;
    document.body.appendChild(coachBar);
  }
  const msgEl = coachBar.querySelector("#mwCoachMsg");
  msgEl.textContent = `第 ${stepIndex+1} / ${total} 步：${message}`;
}
function enableNextBtn(enabled){
  const btn = coachBar?.querySelector("#mwCoachNext");
  if (!btn) return;
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? "1" : ".4";
}
function removeCoachBar(){
  coachBar?.remove();
  coachBar = null;
}

/* ========= 患者：建立缺漏步驟清單 ========= */
function buildPatientMissingSteps(){
  const steps = [];

  // 共用
  if (!notEmpty(nameEl.value))   steps.push({ el: nameEl,  msg: "請輸入姓名", valid: ()=> notEmpty(nameEl.value) });
  
  // 📞 手機號碼檢查 (主要) - 已修改為格式檢查
  if (!isValidTaiwanPhone(phoneEl.value)) 
    steps.push({ el: phoneEl, msg: "請輸入正確的手機號碼（09開頭，共10碼）", valid: ()=> isValidTaiwanPhone(phoneEl.value) });
  
  if (!notEmpty(enameEl.value)) steps.push({ el: enameEl, msg: "請輸入緊急聯絡人姓名", valid: ()=> notEmpty(enameEl.value) });
  
  // 📞 緊急聯絡人電話檢查 (次要) - 已修改為格式檢查
  if (!isValidTaiwanPhone(ephoneEl.value))
    steps.push({ el: ephoneEl,msg: "請輸入正確的緊急聯絡人電話（09開頭，共10碼）", valid: ()=> isValidTaiwanPhone(ephoneEl.value) });

  // 患者專屬
  if (!disabilityEl.value)       steps.push({ el: disabilityEl, msg:"請選擇是否為身心障礙者", valid: ()=> !!disabilityEl.value });

  const needCity = !notEmpty(cityEl.value);
  const needDist = !notEmpty(districtEl.value);
  if (needCity || needDist){
    steps.push({
      el: needCity ? cityEl : districtEl,
      msg: "請完整填寫居住地址（縣市、行政區）",
      valid: ()=> notEmpty(cityEl.value) && notEmpty(districtEl.value)
    });
  }

  // 慢性病史（至少一個；若勾「其他」也要輸入內容）
  const chronicChecks = Array.from(document.querySelectorAll(`input[name="chronic"]`));
  const chosen = chronicChecks.filter(c=>c.checked).map(c=>c.value);
  const otherTxtOk = notEmpty(chronicOtherEl.value);

  if (chosen.length === 0){
    steps.push({
      el: chronicChecks[0] || chronicOtherEl,
      msg: "請至少勾選一個慢性病史（可勾選「其他」並填寫）",
      valid: ()=> Array.from(document.querySelectorAll(`input[name="chronic"]:checked`)).length > 0
    });
  } else if (chosen.includes("其他") && !otherTxtOk){
    steps.push({
      el: chronicOtherEl,
      msg: "已勾選「其他」，請輸入內容",
      valid: ()=> notEmpty(chronicOtherEl.value)
    });
  }
  return steps;
}

/* ========= 志工：建立缺漏步驟清單（順序嚴格依你指定） ========= */
function buildVolunteerMissingSteps(){
  const steps = [];

  // 1) 姓名
  if (!notEmpty(nameEl.value))
    steps.push({ el: nameEl, msg: "請輸入姓名", valid: ()=> notEmpty(nameEl.value) });

  // 2) 手機
  // 📞 手機號碼檢查 (主要) - 已修改為格式檢查
  if (!isValidTaiwanPhone(phoneEl.value))
    steps.push({ el: phoneEl, msg: "請輸入正確的手機號碼（09開頭，共10碼）", valid: ()=> isValidTaiwanPhone(phoneEl.value) });

  // 3) 緊急聯絡人（姓名＋電話）——同一步一起檢查
  // 📞 緊急聯絡人電話檢查 (次要) - 已修改為格式檢查
  if (!notEmpty(enameEl.value) || !isValidTaiwanPhone(ephoneEl.value)) {
    steps.push({
      el: enameEl,
      msg: "請輸入緊急聯絡人姓名與正確電話（09開頭，共10碼）",
      valid: ()=> notEmpty(enameEl.value) && isValidTaiwanPhone(ephoneEl.value)
    });
  }

  // ★ 從這裡開始，檢查志工專屬欄位是否存在，以避免 TypeError ★

  // 4) 身分證號
  if (idCardEl && !notEmpty(idCardEl.value)) // 檢查 idCardEl
    steps.push({ el: idCardEl, msg: "請輸入身分證號", valid: ()=> idCardEl && notEmpty(idCardEl.value) });

  // 5) 是否有執照
  if (hasCertEl && !hasCertEl.value) // 檢查 hasCertEl
    steps.push({ el: hasCertEl, msg: "請選擇是否有志工專業執照", valid: ()=> hasCertEl && !!hasCertEl.value });

  // 6) 良民證編號
  if (policeEl && !notEmpty(policeEl.value)) // 檢查 policeEl
    steps.push({ el: policeEl, msg: "請輸入良民證編號", valid: ()=> policeEl && notEmpty(policeEl.value) });

  // 7) 良民證照片
  if (policeFileEl && !policeFileEl.files?.length) // 檢查 policeFileEl
    steps.push({ el: policeFileEl, msg: "請上傳良民證照片", valid: ()=> policeFileEl && policeFileEl.files?.length > 0 });

  // 8) 駕照照片
  if (licenseFileEl && !licenseFileEl.files?.length) // 檢查 licenseFileEl
    steps.push({ el: licenseFileEl, msg: "請上傳駕照照片", valid: ()=> licenseFileEl && licenseFileEl.files?.length > 0 });

  // 9) 服務地區（縣市/行政區）——同一步一起檢查
  if (volCityEl && volDistrictEl && (!notEmpty(volCityEl.value) || !notEmpty(volDistrictEl.value))) { // 檢查 volCityEl & volDistrictEl
    steps.push({
      el: volCityEl,
      msg: "請選擇志工服務地區（縣市與行政區）",
      valid: ()=> volCityEl && volDistrictEl && notEmpty(volCityEl.value) && notEmpty(volDistrictEl.value)
    });
  }

  // 10) （若選「有執照」）志工證明上傳
  if (hasCertEl?.value === "有" && certFileEl && !certFileEl.files?.length) // 使用可選鏈 hasCertEl?.value，並檢查 certFileEl
    steps.push({ el: certFileEl, msg: "請上傳志工證明", valid: ()=> certFileEl && certFileEl.files?.length > 0 });

  return steps;
}

/* ========= 綁定欄位事件：即時清錯 & 患者「其他」自動勾選 ========= */
[
  nameEl, phoneEl, enameEl, ephoneEl,
  disabilityEl, cityEl, districtEl, chronicOtherEl,
  idCardEl, hasCertEl, policeEl, volCityEl, volDistrictEl
].forEach(el=>{
  el?.addEventListener("input", ()=> clearInlineError(el));
  el?.addEventListener("change", ()=> clearInlineError(el));
});
const chronicOtherBox = document.querySelector('input[name="chronic"][value="其他"]');
chronicOtherEl?.addEventListener("input", () => {
  if (notEmpty(chronicOtherEl.value) && chronicOtherBox) chronicOtherBox.checked = true;
});

/* ========= 啟動引導（泛用） ========= */
let currentGuideCleanup = null;
function startGuide(steps, bindExtraWatchers){
  if (!steps.length) return;

  // 取消前一次監聽（避免重複）
  if (typeof currentGuideCleanup === "function") currentGuideCleanup();

  let idx = 0;
  const total = steps.length;
  const listeners = [];

  const addL = (target, evt, h) => {
    target?.addEventListener(evt, h, { once:false });
    listeners.push(()=> target?.removeEventListener(evt, h));
  };

  const cleanup = () => {
    listeners.forEach(off => off());
    removeCoachBar();
  };
  currentGuideCleanup = cleanup;

  const go = (i) => {
    idx = i;
    const step = steps[idx];
    renderCoachBar(idx, total, step.msg);

    showInlineError(step.el, step.msg);
    scrollFocus(step.el);

    const focusBtn = coachBar.querySelector("#mwCoachFocus");
    focusBtn.onclick = () => scrollFocus(step.el);

    const updateNextEnabled = () => enableNextBtn(step.valid());
    updateNextEnabled();

    // 單一欄位即時監聽
    addL(step.el, "input", updateNextEnabled);
    addL(step.el, "change", updateNextEnabled);

    // 額外監聽（像 checkbox 群組、file input、聯動欄位等）
    bindExtraWatchers?.(updateNextEnabled, addL);

    const nextBtn = coachBar.querySelector("#mwCoachNext");
    nextBtn.onclick = () => {
      if (!step.valid()) return;
      clearInlineError(step.el); // 點擊下一步時，清除目前的錯誤提示
      
      if (idx < total - 1) {
        removeCoachBar(); // 讓提示框先收起來
        // 使用 setTimeout 確保 UI 變更後，再啟動下一步 (setTimeout(0) 即可將 go(idx+1) 放入事件佇列)
        setTimeout(() => go(idx + 1), 0); 
      } else {
        cleanup();
        alert("🎉 已完成所有必填欄位，請再次點擊「儲存並完成註冊」。");
      }
    };
  };

  go(0);
}

function startPatientGuide(steps){
  startGuide(steps, (update, addL)=>{
    // 慢性病史：任一勾選就更新
    document.querySelectorAll('input[name="chronic"]').forEach(cb=>{
      addL(cb, "change", update);
    });
  });
}
function startVolunteerGuide(steps){
  startGuide(steps, (update, addL)=>{
    // 志工：檔案/選單/成對欄位即時檢查
    [policeFileEl, licenseFileEl, certFileEl].forEach(fi=>{
      addL(fi, "change", update);
    });
    // 是否有執照 → 影響「志工證明上傳」步驟
    addL(hasCertEl, "change", update);

    // 緊急聯絡人「同一步檢查姓名＋電話」
    addL(ephoneEl, "input", update);

    // 服務地區「同一步檢查縣市＋行政區」
    addL(volDistrictEl, "change", update);
  });
}

/* ========= 送出註冊 ========= */
saveBtn?.addEventListener("click", async () => {
  try{
    uiBusy(true);

    const role = roleHidden.value === "志工" ? "志工" : "患者";

    if (role === "患者") {
      const missing = buildPatientMissingSteps();
      if (missing.length){
        uiBusy(false);
        startPatientGuide(missing);
        return;
      }
    } else {
      // 志工模式下，由於 buildVolunteerMissingSteps 已經修正，不會再發生 null 錯誤
      const missing = buildVolunteerMissingSteps();
      if (missing.length){
        uiBusy(false);
        startVolunteerGuide(missing);
        return;
      }
    }

    // 通過本地驗證 → 進行登入與寫入
    saveTip.textContent = "準備登入…";
    const user = await ensureFirebaseAuthViaLINE();
    if (!user) return;
    const uid = user.uid;
    const provider = "line";

    // 檢查用戶是否已註冊此角色
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const old = snap.data();
      if (old.roles && old.roles.includes(role)) {
        alert(`此帳號已經以「${role}」的身份註冊過了！請勿重複註冊。`);
        uiBusy(false);
        return; // 終止函式執行
      }
    }

    // 合併 roles（支援先患者後志工）
    const old = snap.exists() ? (snap.data() || {}) : {};
    const roles = Array.from(new Set([...(old.roles || []), role]));

    // 基本資料
    const base = {
      uid, provider, roles,
      name: nameEl.value.trim(),
      phone: phoneEl.value.trim(),
      emergencyName: enameEl.value.trim(),
      emergencyPhone: ephoneEl.value.trim(),
      updatedAt: serverTimestamp(),
      createdAt: old.createdAt || serverTimestamp()
    };

    let extra = {};
    if (role === "患者") {
      const chronic = getCheckedValues("chronic");
      const otherChecked = document.querySelector('input[name="chronic"][value="其他"]')?.checked;
      if (otherChecked && notEmpty(chronicOtherEl.value)) chronic.push(chronicOtherEl.value.trim());

      extra = {
        disability: disabilityEl.value || "",
        chronic,
        patientCity: cityEl.value || "",
        patientDistrict: districtEl.value || ""
      };
    } else {
      saveTip.textContent = "上傳志工附件…";
      const policeCert  = await uploadIfSelected(`police_certificates/${uid}`,  policeFileEl);
      const licenseFile = await uploadIfSelected(`licenses/${uid}`,            licenseFileEl);
      const volCert     = (hasCertEl?.value === "有") ? await uploadIfSelected(`volunteer_certificates/${uid}`, certFileEl) : null;

      extra = {
        idCard: idCardEl?.value.trim() || "",
        hasCertificate: hasCertEl?.value || "",
        police: policeEl?.value.trim() || "",
        volCity: volCityEl?.value || "",
        volDistrict: volDistrictEl?.value || "",
        policeCert, licenseFile,
        volunteerCertificate: volCert
      };
    }

    saveTip.textContent = "寫入基本資料…";
    await setDoc(userRef, { ...base, ...extra }, { merge: true });

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