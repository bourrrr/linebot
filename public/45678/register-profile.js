// Step 2: Basic profile form and Firestore save (LINE-only identity)
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
async function ensureLIFF(){
  try{
    if(!window.liff) throw new Error("LIFF SDK 未載入");
    if(!window.MW_LIFF_READY){
      await liff.init({ liffId: LIFF_ID });
      window.MW_LIFF_READY = true;
    }
    return true;
  }catch(e){
    alert("無法初始化 LINE LIFF，請回上一步重新登入。");
    return false;
  }
}

let CURRENT_LIFF = { uid: "", name: "" };

async function requireLineIdentity(){
  const ok = await ensureLIFF();
  if(!ok) return false;
  if(!liff.isLoggedIn()){
    document.getElementById('authWarn')?.classList.remove('hidden');
    (document.getElementById('saveBtn')).disabled = true;
    return false;
  }
  try{
    const p = await liff.getProfile();
    CURRENT_LIFF.uid = `liff:${p.userId}`;
    CURRENT_LIFF.name = p.displayName || "";
    document.getElementById('authWarn')?.classList.add('hidden');
    (document.getElementById('saveBtn')).disabled = false;
    // 預填姓名 placeholder
    const nameEl = document.getElementById('name');
    if(nameEl && !nameEl.value) nameEl.placeholder = `姓名（LINE：${CURRENT_LIFF.name}）`;
    return true;
  }catch(e){
    document.getElementById('authWarn')?.classList.remove('hidden');
    (document.getElementById('saveBtn')).disabled = true;
    return false;
  }
}

// ====== UI helpers ======
function setActiveRole(role){
  const patientBtn = document.getElementById('patientBtn');
  const volunteerBtn = document.getElementById('volunteerBtn');
  const roleInput = document.getElementById('role');
  const patientFields = document.getElementById('patientFields');
  const volunteerFields = document.getElementById('volunteerFields');
  if(role === '志工'){
    volunteerBtn?.classList.add('active'); patientBtn?.classList.remove('active');
    roleInput.value = '志工';
    patientFields?.classList.add('hidden');
    volunteerFields?.classList.remove('hidden');
  }else{
    patientBtn?.classList.add('active'); volunteerBtn?.classList.remove('active');
    roleInput.value = '患者';
    patientFields?.classList.remove('hidden');
    volunteerFields?.classList.add('hidden');
  }
}
document.getElementById('patientBtn')?.addEventListener('click', ()=> setActiveRole('患者'));
document.getElementById('volunteerBtn')?.addEventListener('click', ()=> setActiveRole('志工'));

// City-district linkage (patient)
const citySel = document.getElementById("city");
const distSel = document.getElementById("district");
citySel?.addEventListener("change", () => {
  const val = (citySel).value;
  distSel.innerHTML = '<option value="">請選擇行政區</option>';
  if (cityDistricts[val]){
    cityDistricts[val].forEach(d => {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d; distSel.appendChild(opt);
    });
    (distSel).disabled = false;
  } else {
    (distSel).disabled = true;
  }
});
// City-district linkage (volunteer)
const volCitySel = document.getElementById("volCity");
const volDistSel = document.getElementById("volDistrict");
volCitySel?.addEventListener("change", () => {
  const val = (volCitySel).value;
  volDistSel.innerHTML = '<option value="">志工服務行政區</option>';
  if (cityDistricts[val]){
    cityDistricts[val].forEach(d => {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d; volDistSel.appendChild(opt);
    });
    (volDistSel).disabled = false;
  } else {
    (volDistSel).disabled = true;
  }
});

// ====== Save profile ======
document.getElementById('saveBtn')?.addEventListener('click', async () => {
  if(!CURRENT_LIFF.uid){
    alert("請先完成第 1 步（使用 LINE 登入）");
    return;
  }
  const uid = CURRENT_LIFF.uid;

  const role = (document.getElementById('role')).value;
  const name = (document.getElementById('name')).value.trim() || CURRENT_LIFF.name || "";
  const phone = (document.getElementById('phone')).value.trim();
  const emergencyName = (document.getElementById('emergencyName')).value.trim();
  const emergencyPhone = (document.getElementById('emergencyPhone')).value.trim();

  if(!name){ alert("請輸入姓名"); return; }

  const baseData = {
    uid, role, name, phone, emergencyName, emergencyPhone,
    provider: 'line',
    liffUid: CURRENT_LIFF.uid.replace(/^liff:/,''),
    createdAt: serverTimestamp()
  };

  try{
    if(role === '患者'){
      const chronic = Array.from(document.querySelectorAll("input[name='chronic']:checked")).map((c)=> c.value);
      const chronicOther = (document.getElementById('chronicOther')).value.trim();
      const pCity = (document.getElementById('city')).value;
      const pDist = (document.getElementById('district')).value;
      const road = (document.getElementById('road')).value.trim();
      const disability = (document.getElementById('disability')).value;
      Object.assign(baseData, { chronic, chronicOther, city: pCity, district: pDist, road, disability });
    }else{
      const idCard = (document.getElementById('idCard')).value.trim();
      const police = (document.getElementById('police')).value.trim();
      const vCity = (document.getElementById('volCity')).value;
      const vDist = (document.getElementById('volDistrict')).value;
      const hasCert = (document.getElementById('hasCert')).value;
      Object.assign(baseData, { idCard, police, city: vCity, district: vDist, hasCert });

      // uploads
      if(hasCert === '有'){
        const certFile = (document.getElementById('certFile'))?.files?.[0];
        if(certFile){
          const certRef = ref(storage, `volunteer_certificates/${uid}/${certFile.name}`);
          const snap = await uploadBytes(certRef, certFile);
          baseData.certUrl = await getDownloadURL(snap.ref);
        }
      }
      const policeFile = (document.getElementById('policeFile'))?.files?.[0];
      if(policeFile){
        const pRef = ref(storage, `police_certificates/${uid}/${policeFile.name}`);
        const pSnap = await uploadBytes(pRef, policeFile);
        baseData.policeUrl = await getDownloadURL(pSnap.ref);
      }
      const licenseFile = (document.getElementById('licenseFile'))?.files?.[0];
      if(licenseFile){
        const lRef = ref(storage, `licenses/${uid}/${licenseFile.name}`);
        const lSnap = await uploadBytes(lRef, licenseFile);
        baseData.licenseUrl = await getDownloadURL(lSnap.ref);
      }
    }

    await setDoc(doc(db, "users", uid), baseData, { merge: true });
    alert("✅ 基本資料已儲存，請回登入頁登入。");
    window.location.href = "login.html";
  }catch(err){
    console.error(err);
    alert("❌ 儲存失敗：" + (err?.message || err));
  }
});

// 初始化：需要偵測 LINE 登入
(async () => {
  await requireLineIdentity();
})();
