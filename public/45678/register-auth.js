// register-auth.js — Step 1: 以 LINE 建立帳號（自動續跑版）
const LIFF_ID = "2007877199-Y5R2LenL";

const btn  = document.getElementById('lineSignupBtn');
const hint = document.getElementById('providerHint');

function setBusy(b){
  if(!btn) return;
  btn.disabled = !!b;
  btn.textContent = b ? '處理中…' : '使用 LINE 建立帳號';
}

async function ensureLIFF(){
  try{
    if(!window.liff) throw new Error('LIFF SDK 未載入');
    if(!window.MW_LIFF_READY){
      await liff.init({ liffId: LIFF_ID });
      window.MW_LIFF_READY = true;
    }
    return true;
  }catch(e){
    alert('無法初始化 LINE LIFF，請稍後再試。');
    console.error(e);
    return false;
  }
}

function persistProfileAndGo(profile){
  localStorage.setItem('MW_LIFF_UID', profile.userId || '');
  localStorage.setItem('MW_LIFF_NAME', profile.displayName || '');
  localStorage.setItem('MW_LIFF_PIC', profile.pictureUrl || '');
  localStorage.setItem('MW_REG_PROVIDER', 'line');
  localStorage.setItem('MW_REG_UID', `line:${profile.userId}`);
  if (hint){
    hint.textContent = `已使用 LINE：${profile.displayName || ''}`;
    hint.classList.remove('hidden');
  }
  // 直接進第 2 步
  window.location.href = 'register-profile.html';
}

async function continueIfLoggedIn(){
  if(!(await ensureLIFF())) return;
  if(!liff.isLoggedIn()) return; // 等使用者按鈕登入
  try{
    setBusy(true);
    const p = await liff.getProfile();
    persistProfileAndGo(p);
  }catch(err){
    console.error(err);
    alert('❌ 取得 LINE 使用者資料失敗，請重試。');
    setBusy(false);
  }
}

document.addEventListener('DOMContentLoaded', continueIfLoggedIn);

// 按鈕：尚未登入就觸發 LINE Login；已登入直接往下一步
btn?.addEventListener('click', async () => {
  if(!(await ensureLIFF())) return;
  if(!liff.isLoggedIn()){
    // 登入後會回到本頁，DOMContentLoaded 會自動續跑
    liff.login({ redirectUri: location.href });
    return;
  }
  await continueIfLoggedIn();
});
