import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { cityDistricts } from './district-data.js';

const firebaseConfig = {
  apiKey: "AIzaSyCCUzkxpn1quR9PPSBeZBGGl7XVh8vPzjY",
  authDomain: "medwell-test1.firebaseapp.com",
  projectId: "medwell-test1",
  storageBucket: "medwell-test1.firebasestorage.app",
  messagingSenderId: "860851688843",
  appId: "1:860851688843:web:622eb8feccad45ce640b8e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// 身份切換
let userRole = "patient";
const patientBtn = document.getElementById("patientBtn");
const volunteerBtn = document.getElementById("volunteerBtn");
const patientFields = document.getElementById("patientFields");
const volunteerFields = document.getElementById("volunteerFields");

patientBtn.addEventListener("click", () => {
  userRole = "patient";
  patientFields.classList.remove("hidden");
  volunteerFields.classList.add("hidden");
  patientBtn.classList.add("bg-green-500", "text-white");
  volunteerBtn.classList.remove("bg-green-500", "text-white");
});

volunteerBtn.addEventListener("click", () => {
  userRole = "volunteer";
  volunteerFields.classList.remove("hidden");
  patientFields.classList.add("hidden");
  volunteerBtn.classList.add("bg-green-500", "text-white");
  patientBtn.classList.remove("bg-green-500", "text-white");
});

// 城市與行政區聯動 - 患者
const city = document.getElementById("city");
const district = document.getElementById("district");
if (city && district) {
  city.addEventListener('change', () => {
    const val = city.value;
    district.innerHTML = '<option value="">請選擇行政區</option>';
    if (cityDistricts[val]) {
      cityDistricts[val].forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        district.appendChild(opt);
      });
      district.disabled = false;
    } else {
      district.disabled = true;
    }
  });
}

// 城市與行政區聯動 - 志工
const volCity = document.getElementById("volCity");
const volDistrict = document.getElementById("volDistrict");
if (volCity && volDistrict) {
  volCity.addEventListener('change', () => {
    const val = volCity.value;
    volDistrict.innerHTML = '<option value="">請選擇行政區</option>';
    if (cityDistricts[val]) {
      cityDistricts[val].forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        volDistrict.appendChild(opt);
      });
      volDistrict.disabled = false;
    } else {
      volDistrict.disabled = true;
    }
  });
}

// 註冊送出
document.getElementById("registerBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const name = document.getElementById("name").value;
  const phone = document.getElementById("phone").value;
  const emergencyName = document.getElementById("emergencyName").value;
  const emergencyPhone = document.getElementById("emergencyPhone").value;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    let userData = {
      uid: user.uid,
      role: userRole,
      email,
      name,
      phone,
      emergencyName,
      emergencyPhone,
      createdAt: Timestamp.now()
    };

    if (userRole === "patient") {
      const chronicEls = document.querySelectorAll("input[name='chronic']:checked");
      const chronic = Array.from(chronicEls).map(c => c.value);
      const chronicOther = document.getElementById("chronicOther").value;
      const city = document.getElementById("city").value;
      const district = document.getElementById("district").value;
      const road = document.getElementById("road").value;
      const disability = document.getElementById("disability").value;
      Object.assign(userData, { chronic, chronicOther, city, district, road, disability });

    } else if (userRole === "volunteer") {
      const idCard = document.getElementById("idCard").value;
      const police = document.getElementById("police").value;
      const hours = document.getElementById("hours").value;
      const city = document.getElementById("volCity").value;
      const district = document.getElementById("volDistrict").value;
      const hasCert = document.getElementById("hasCert").value;
      Object.assign(userData, { idCard, police, city, district, hours: hours ? Number(hours) : 0, hasCert});

      const certFile = document.getElementById("certFile").files[0];
      if (certFile) {
        const storageRef = ref(storage, `certificates/${user.uid}/${certFile.name}`);
        const snapshot = await uploadBytes(storageRef, certFile);
        const downloadURL = await getDownloadURL(snapshot.ref);
        userData.certUrl = downloadURL;
      }
    }

    await addDoc(collection(db, "users"), userData);
    await sendEmailVerification(user);

    document.body.classList.add("bg-green-50");
    const btn = document.getElementById("registerBtn");
    btn.classList.add("animate-bounce");
    setTimeout(() => {
      window.location.href = "login.html";
    }, 1200);
    
  } catch (err) {
    console.error("❌ 註冊失敗", err);
    document.body.classList.add("bg-red-50");
    const btn = document.getElementById("registerBtn");
    btn.classList.add("animate-shake");
    alert("❌ 註冊失敗：" + err.message);
  }
});
