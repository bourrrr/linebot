// Step 2: Basic profile form and Firestore save
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";
import { cityDistricts } from "./district-data.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

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

// ====== Auth state ======
let CURRENT_USER = null;
const authWarn = document.getElementById('authWarn');
onAuthStateChanged(auth, async (user) => {
  CURRENT_USER = user || null;
  if(!user){
    authWarn?.classList.remove('hidden');
    (document.getElementById('saveBtn')).disabled = true;
  }else{
    authWarn?.classList.add('hidden');
    (document.getElementById('saveBtn')).disabled = false;
    // Prefill name/email if available
    try{
      const email = user.email || localStorage.getItem('MW_REG_EMAIL') || "";
      if(email) (document.getElementById('name')).placeholder = `姓名（登入：${email}）`;
      if(user.email && !user.emailVerified){
        try{ await sendEmailVerification(user); }catch{}
        document.getElementById('saveTip')?.classList.remove('hidden');
      }
    }catch{}
  }
});

// ====== Save profile ======
document.getElementById('saveBtn')?.addEventListener('click', async () => {
  if(!CURRENT_USER){ alert("請先完成第 1 步（Email 建立帳號）"); return; }
  const uid = CURRENT_USER.uid;

  const role = (document.getElementById('role')).value;
  const name = (document.getElementById('name')).value.trim();
  const phone = (document.getElementById('phone')).value.trim();
  const emergencyName = (document.getElementById('emergencyName')).value.trim();
  const emergencyPhone = (document.getElementById('emergencyPhone')).value.trim();

  if(!name){ alert("請輸入姓名"); return; }

  const baseData = {
    uid, role, name, phone, emergencyName, emergencyPhone,
    provider: localStorage.getItem('MW_REG_PROVIDER') || 'password',
    liffUid: localStorage.getItem('MW_LIFF_UID') || '',
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

    // Save to "users/{uid}"
    await setDoc(doc(db, "users", uid), baseData, { merge: true });
    alert("✅ 基本資料已儲存，請回登入頁登入。");
    window.location.href = "login.html";
  }catch(err){
    console.error(err);
    alert("❌ 儲存失敗：" + (err?.message || err));
  }
});

// Show/hide cert upload
const hasCertSel = document.getElementById("hasCert");
const certUploadSection = document.getElementById("certUploadSection");
hasCertSel?.addEventListener('change', () => {
  if ((hasCertSel).value === '有'){
    certUploadSection?.classList.remove('hidden');
  }else{
    certUploadSection?.classList.add('hidden');
  }
});
