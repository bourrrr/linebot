// Step 1: Account creation via Email / LINE / Facebook
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ==== UI helpers ====
const pwd = document.getElementById('password');
const btnToggle = document.getElementById('togglePwd');
const eye = document.getElementById('icon-eye');
const eyeOff = document.getElementById('icon-eye-off');
btnToggle?.addEventListener('click', () => {
  if (!pwd) return;
  const show = pwd.type === 'password';
  pwd.type = show ? 'text' : 'password';
  const isText = pwd.type === 'text';
  eye?.classList.toggle('hidden', isText);
  eyeOff?.classList.toggle('hidden', !isText);
  btnToggle.setAttribute('aria-label', isText ? '隱藏密碼' : '顯示密碼');
  btnToggle.setAttribute('title', isText ? '隱藏密碼' : '顯示密碼');
});

// ==== LIFF ====
const LIFF_ID = "2007877199-Y5R2LenL";
async function ensureLIFF(){
  try{
    if(!window.liff) throw new Error("LIFF SDK 未載入");
    if(!window.MW_LIFF_READY){
      await liff.init({ liffId: LIFF_ID });
      window.MW_LIFF_READY = true;
    }
    return true;
  }catch(e){
    alert("無法初始化 LINE LIFF，請稍後再試或確認 LIFF 設定。");
    return false;
  }
}

function goNext(){
  // 前往第二步
  window.location.href = "register-profile.html";
}

// ==== Email signup ====
document.getElementById('emailSignupBtn')?.addEventListener('click', async () => {
  const email = (document.getElementById('email')).value.trim();
  const password = (document.getElementById('password')).value;
  if(!email || !password){ alert("請輸入 Email 與密碼"); return; }
  try{
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const user = cred.user;
    try{ await sendEmailVerification(user); }catch{}
    localStorage.setItem('MW_REG_PROVIDER', 'password');
    localStorage.setItem('MW_REG_UID', user.uid);
    localStorage.setItem('MW_REG_EMAIL', email);
    alert("✅ 已建立帳號並寄出驗證信，請至信箱驗證。接下來請前往第二步填寫基本資料。");
    goNext();
  }catch(err){
    alert("❌ 建立帳號失敗：" + (err?.message || err));
  }
});

// ==== LINE ====
document.getElementById('lineSignupBtn')?.addEventListener('click', async () => {
  if(!(await ensureLIFF())) return;
  if(!liff.isLoggedIn()){ liff.login({ redirectUri: location.href }); return; }
  try{
    const p = await liff.getProfile();
    localStorage.setItem('MW_LIFF_UID', p.userId || '');
    localStorage.setItem('MW_LIFF_NAME', p.displayName || '');
    localStorage.setItem('MW_LIFF_PIC', p.pictureUrl || '');
    localStorage.setItem('MW_REG_PROVIDER', 'line');
    localStorage.setItem('MW_REG_UID', `liff:${p.userId}`);
    document.getElementById('providerHint').textContent = `已使用 LINE：${p.displayName}`;
    document.getElementById('providerHint').classList.remove('hidden');
    goNext();
  }catch(err){
    alert("❌ 取得 LINE 使用者資料失敗：" + (err?.message || err));
  }
});

// ==== Facebook (placeholder) ====
document.getElementById('fbSignupBtn')?.addEventListener('click', () => {
  alert("Facebook 登入：請接上你的 OAuth 流程（完成後導向 register-profile.html）。");
  localStorage.setItem('MW_REG_PROVIDER', 'facebook');
  goNext();
});
