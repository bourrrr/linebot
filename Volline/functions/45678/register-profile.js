// register-profile.js — 使用 LINE (LIFF) + Firebase Custom Token 完成註冊（患者/志工）
// ★ 本版新增：患者端「一步一步引導」補齊未填必填欄位（含高亮、捲動、進度提示條）

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

/* ========= 引導：通用錯誤顯示 / 清除 ========= */
function showInlineError(el, msg){
  if (!el) return;
  el.classList.add("border-red-400","ring","ring-red-300");
  el.setAttribute("aria-invalid","true");
  // 建立/更新訊息節點
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
        <button id="mwCoachFocus" class="px-3 py-2 rounded-xl border text-sm" style="border-color:var(--border);color:var(--text)">定位</button>
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

/* ========= 患者：建立缺漏步驟清單（依序） ========= */
function buildPatientMissingSteps(){
  const steps = [];

  // 共用
  if (!notEmpty(nameEl.value))  steps.push({ el: nameEl,  msg: "請輸入姓名", valid: ()=> notEmpty(nameEl.value) });
  if (!notEmpty(phoneEl.value)) steps.push({ el: phoneEl, msg: "請輸入手機號碼", valid: ()=> notEmpty(phoneEl.value) });
  if (!notEmpty(enameEl.value)) steps.push({ el: enameEl, msg: "請輸入緊急聯絡人姓名", valid: ()=> notEmpty(enameEl.value) });
  if (!notEmpty(ephoneEl.value))steps.push({ el: ephoneEl,msg: "請輸入緊急聯絡人電話", valid: ()=> notEmpty(ephoneEl.value) });

  // 患者專屬
  if (!disabilityEl.value)      steps.push({ el: disabilityEl, msg:"請選擇是否為身心障礙者", valid: ()=> !!disabilityEl.value });

  const needCity = !notEmpty(cityEl.value);
  const needDist = !notEmpty(districtEl.value);
  if (needCity || needDist){
    steps.push({
      el: needCity ? cityEl : districtEl,
      msg: "請完整填寫居住地址（縣市、行政區）",
      valid: ()=> notEmpty(cityEl.value) && notEmpty(districtEl.value)
    });
  }

  // 慢性病史（至少一個；若只勾「其他」也要輸入文字）
  const chronicChecks = Array.from(document.querySelectorAll(`input[name="chronic"]`));
  const chronicChosen = chronicChecks.filter(c=>c.checked).map(c=>c.value);
  const otherBox = chronicChecks.find(c=>c.value==="其他");
  const otherTxtOk = notEmpty(chronicOtherEl.value);

  if (chronicChosen.length === 0){
    steps.push({
      el: chronicChecks[0] || chronicOtherEl,
      msg: "請至少勾選一個慢性病史（可勾選「其他」並填寫）",
      valid: ()=>{
        const chosen = Array.from(document.querySelectorAll(`input[name="chronic"]:checked`)).length > 0;
        return chosen;
      }
    });
  } else if (chronicChosen.includes("其他") && !otherTxtOk){
    steps.push({
      el: chronicOtherEl,
      msg: "已勾選「其他」，請輸入內容",
      valid: ()=> notEmpty(chronicOtherEl.value)
    });
  }

  return steps;
}

/* ========= 綁定欄位事件：即時清除錯誤 / 讓「其他」自動勾選 ========= */
[nameEl, phoneEl, enameEl, ephoneEl, disabilityEl, cityEl, districtEl, chronicOtherEl].forEach(el=>{
  el?.addEventListener("input", ()=> clearInlineError(el));
  el?.addEventListener("change", ()=> clearInlineError(el));
});
const chronicOtherBox = document.querySelector('input[name="chronic"][value="其他"]');
chronicOtherEl?.addEventListener("input", () => {
  if (notEmpty(chronicOtherEl.value) && chronicOtherBox) chronicOtherBox.checked = true;
});

/* ========= 啟動患者引導 ========= */
function startPatientGuide(steps){
  if (!steps.length) return;

  let idx = 0;
  const total = steps.length;

  const go = (i) => {
    idx = i;
    const step = steps[idx];
    renderCoachBar(idx, total, step.msg);

    // 先高亮 + 捲動 + 顯示訊息
    showInlineError(step.el, step.msg);
    scrollFocus(step.el);

    const focusBtn = coachBar.querySelector("#mwCoachFocus");
    focusBtn.onclick = () => scrollFocus(step.el);

    // 根據欄位是否有效，控制下一步按鈕可用性
    const updateNextEnabled = () => enableNextBtn(step.valid());
    updateNextEnabled();

    // 針對 checkbox 群組：只要任一勾選/取消都重算
    document.querySelectorAll('input[name="chronic"]').forEach(cb=>{
      cb.addEventListener("change", updateNextEnabled, { once:false });
    });

    // 單一欄位即時監聽
    step.el.addEventListener("input", updateNextEnabled, { once:false });
    step.el.addEventListener("change", updateNextEnabled, { once:false });

    const nextBtn = coachBar.querySelector("#mwCoachNext");
    nextBtn.onclick = () => {
      if (!step.valid()) return;
      clearInlineError(step.el);
      if (idx < total - 1) {
        go(idx + 1);
      } else {
        removeCoachBar();
        // 全部補齊
        alert("🎉 已完成所有必填欄位，請再次點擊「儲存並完成註冊」。");
      }
    };
  };

  go(0);
}

/* ========= 送出註冊 ========= */
saveBtn?.addEventListener("click", async () => {
  try{
    uiBusy(true);

    const role = roleHidden.value === "志工" ? "志工" : "患者";

    // ★ 若是患者：先檢查缺漏 → 啟動一步一步引導
    if (role === "患者") {
      const missing = buildPatientMissingSteps();
      if (missing.length){
        uiBusy(false);
        startPatientGuide(missing);
        return; // 先引導補齊，不送出
      }
    } else {
      // 志工：仍做基本必填檢查（非本需求重點，但沿用確保完整）
      if (!notEmpty(idCardEl.value))       { uiBusy(false); showInlineError(idCardEl,"請輸入身分證號"); scrollFocus(idCardEl); return; }
      if (!hasCertEl.value)                { uiBusy(false); showInlineError(hasCertEl,"請選擇是否有志工專業執照"); scrollFocus(hasCertEl); return; }
      if (!notEmpty(policeEl.value))       { uiBusy(false); showInlineError(policeEl,"請輸入良民證編號"); scrollFocus(policeEl); return; }
      if (!policeFileEl.files?.length)     { uiBusy(false); showInlineError(policeFileEl,"請上傳良民證照片"); scrollFocus(policeFileEl); return; }
      if (!licenseFileEl.files?.length)    { uiBusy(false); showInlineError(licenseFileEl,"請上傳駕照照片"); scrollFocus(licenseFileEl); return; }
      if (!notEmpty(volCityEl.value) || !notEmpty(volDistrictEl.value)) {
        uiBusy(false); showInlineError(volCityEl, "請選擇志工服務地區（縣市/行政區）"); scrollFocus(volCityEl); return;
      }
      if (hasCertEl.value === "有" && !certFileEl.files?.length) {
        uiBusy(false); showInlineError(certFileEl,"請上傳志工證明"); scrollFocus(certFileEl); return;
      }
    }

    // 通過本地驗證 → 進行登入與寫入
    saveTip.textContent = "準備登入…";
    const user = await ensureFirebaseAuthViaLINE();
    if (!user) return;
    const uid = user.uid;
    const provider = "line";

    // 合併 roles（支援先患者後志工）
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
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
      // 慢性病史
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
      // 志工附件
      saveTip.textContent = "上傳志工附件…";
      const policeCert  = await uploadIfSelected(`police_certificates/${uid}`,  policeFileEl);
      const licenseFile = await uploadIfSelected(`licenses/${uid}`,             licenseFileEl);
      const volCert     = (hasCertEl.value === "有") ? await uploadIfSelected(`volunteer_certificates/${uid}`, certFileEl) : null;

      extra = {
        idCard: idCardEl.value.trim(),
        hasCertificate: hasCertEl.value || "",
        police: policeEl.value.trim(),
        volCity: volCityEl.value || "",
        volDistrict: volDistrictEl.value || "",
        policeCert, licenseFile,
        volunteerCertificate: volCert
      };
    }

    // 寫入 Firestore
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
