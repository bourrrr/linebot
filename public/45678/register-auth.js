// Step 1: Account creation via LINE only
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

function goNext(){ window.location.href = "register-profile.html"; }

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
    const hint = document.getElementById('providerHint');
    if (hint){
      hint.textContent = `已使用 LINE：${p.displayName}`;
      hint.classList.remove('hidden');
    }
    goNext();
  }catch(err){
    alert("❌ 取得 LINE 使用者資料失敗：" + (err?.message || err));
  }
});
