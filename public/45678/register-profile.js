// register-profile.js — Step 2: 基本資料 +（LINE 身分）
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";
import { cityDistricts } from "./district-data.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// ===== LIFF =====
const LIFF_ID = "2007877199-Y5R2LenL";

function waitForLiff(maxMs = 10000) {
  if (window.liff) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.liff) { clearInterval(timer); resolve(); }
      else if (Date.now() - started > maxMs) { clearInterval(timer); reject(new Error("LIFF SDK 未載入")); }
    }, 30);
  });
}

async function ensureLIFF(){
  try{
    await waitForLiff();
    if(!window.MW_LIFF_READY){
      await liff.init({ liffId: LIFF_ID });
      window.MW_LIFF_READY = true;
    }
    return true;
  }catch(e){
    console.error(e);
    alert("無法初始化 LINE LIFF，請回上一步重新登入（或稍後再試）。");
    return false;
  }
}

let CURRENT_LIFF = { uid: "", name: "" };

async function requireLineIdentity(){
  const ok = await ensureLIFF();
  const saveBtn = document.getElementById('saveBtn');
  if(!ok) { saveBtn && (saveBtn.disabled = true); return false; }

  if(!liff.isLoggedIn()){
    document.getElementById('authWarn')?.classList.remove('hidden');
    saveBtn && (saveBtn.disabled = true);
    return false;
  }
  try{
    const p = await liff.getProfile();
    CURRENT_LIFF.uid = `liff:${p.userId}`;
    CURRENT_LIFF.name = p.displayName || "";
    document.getElementById('authWarn')?.classList.add('hidden');
    saveBtn && (saveBtn.disabled = false);
    const nameEl = document.getElementById('name');
    if(nameEl && !nameEl.value) nameEl.placeholder = `姓名（LINE：${CURRENT_LIFF.name}）`;
    return true;
  }catch(e){
    console.error(e);
    document.getElementById('authWarn')?.classList.remove('hidden');
    saveBtn && (saveBtn.disabled = true);
    return false;
  }
}

// =====（以下與你現有版本相同，略：角色切換、地址連動、儲存流程…）=====
/* 直接把你現有檔案下方邏輯保留即可（我只改了 waitForLiff 的秒數與訊息） */
