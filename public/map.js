const map = L.map('map').setView([23.5, 118.5], 7.2);
map.zoomControl.setPosition('topright');

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri'
}).addTo(map);

let allMarkers = [];
let rawData = [];
let currentMode = null;
let userMarker = null;

const dataSources = {
  pharmacy: 'points.json',
  clinic: 'clinic_points_format.json'
};

document.addEventListener('DOMContentLoaded', () => {
  locateUser();

  const modeButtons = document.querySelectorAll('.mode-btn');
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      updateModeButtonStyle();
      loadData();
    });
  });

  const locateBtn = document.getElementById('locateButton');
  if (locateBtn) locateBtn.addEventListener('click', locateUser);

  const scrollBtn = document.getElementById('scrollTopBtn');
  const resultContainer = document.getElementById('sidebar');
  if (scrollBtn && resultContainer) {
    scrollBtn.addEventListener('click', () => resultContainer.scrollTo({ top: 0, behavior: 'smooth' }));
    resultContainer.addEventListener('scroll', () => {
      scrollBtn.style.display = resultContainer.scrollTop > 200 ? 'block' : 'none';
    });
  }
});

function locateUser() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        map.setView([lat, lng], 16);
        if (userMarker) {
          userMarker.setLatLng([lat, lng]);
        } else {
          userMarker = L.circleMarker([lat, lng], {
            radius: 8,
            color: '#1976d2',
            fillColor: '#64b5f6',
            fillOpacity: 0.6
          }).addTo(map);
        }
      },
      () => console.warn("⚠️ 無法取得您的位置")
    );
  } else {
    alert("⚠️ 此瀏覽器不支援定位功能");
  }
}

function updateModeButtonStyle() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.style.backgroundColor = '';
    btn.style.color = '';
  });
  const active = document.querySelector(`.mode-btn[data-mode="${currentMode}"]`);
  if (active) {
    active.style.backgroundColor = '#5b21b6';
    active.style.color = '#fff';
  }
}

function parseAddress(address) {
  const regex = /^(?<city>[^縣市]+[縣市])(?<district>[^區鄉鎮市]+[區鄉鎮市]?)/;
  const match = address.match(regex);
  if (match && match.groups) {
    return {
      city: match.groups.city,
      district: match.groups.district
    };
  }
  return { city: '', district: '' };
}

function loadData() {
  if (!currentMode || !dataSources[currentMode]) return;

  allMarkers.forEach(m => map.removeLayer(m));
  allMarkers = [];
  rawData = [];

  fetch(dataSources[currentMode])
    .then(res => res.json())
    .then(json => {
      const data = json.features;

      data.forEach(item => {
        const [lng, lat] = item.geometry.coordinates;
        const props = item.properties;
        const name = props.name || '未提供';
        const address = props.address || '未提供';
        const phone = props.phone || '無';
        const note = props.note || '無';
        const periods = props.service_periods || '';
        const dispense = props.dispense_method || [];
        const dispenseList = Array.isArray(dispense) ? dispense.join('、') : dispense;
        const serviceTableHTML = generatePeriodTable(periods);
        const isOpenNow = checkIfOpenNow(periods);
        const openTag = isOpenNow
          ? `<span style="background:#16a34a;color:white;padding:2px 6px;border-radius:4px;font-size:12px;">營業中</span>`
          : `<span style="background:#ccc;color:#333;padding:2px 6px;border-radius:4px;font-size:12px;">休息中</span>`;

        const popupHTML = `
          <div style="font-size:15px; line-height:2">
            <strong>📍 ${name}</strong> ${openTag}<br>
            ☎️ <a href="tel:${phone}" style="color:#2563eb;">${phone}</a><br>
            🏠 <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking"
                target="_blank" style="color:#2563eb;">${address}</a><br>
            ${currentMode === 'clinic' ? `🚗 領藥方式：${dispenseList}<br>` : ''}
            ${serviceTableHTML}
          </div>`;

        const marker = L.marker([lat, lng]).bindPopup(popupHTML);
        const { city, district } = parseAddress(address);
        marker.meta = { name, address, city, district, phone, note, lat, lng, service_periods: periods };
        allMarkers.push(marker);
        rawData.push(marker.meta);
      });

      allMarkers.forEach(m => m.addTo(map));
      setTimeout(() => map.invalidateSize(), 300);
      initFilterOptions();
    });
}

function generatePeriodTable(periodString) {
  const days = ['一', '二', '三', '四', '五', '六', '日'];
  const slots = [
    '上午<br><small>08:00–12:00</small>',
    '下午<br><small>15:00–18:00</small>',
    '晚上<br><small>18:45–20:45</small>'
  ];
  const symbols = periodString.trim().split('');
  if (symbols.length !== 21) return '<div>尚無營業資訊</div>';

  let table = `<div style="margin-top: 14px;">
    <table style="border-collapse: collapse; font-size:14px; text-align:center; border: 1px solid #ccc; width:100%;">
      <thead>
        <tr style="background-color: #40664b; color: white; height: 40px;">
          <th style="padding: 10px;">服務時間</th>
          ${days.map(d => `<th style="padding: 10px;">${d}</th>`).join('')}
        </tr>
      </thead>
      <tbody>`;

  for (let i = 0; i < 3; i++) {
    const bgColor = i % 2 === 0 ? '#f5f5f5' : '#ffffff';
    table += `<tr style="background-color:${bgColor}; height: 44px;"><td>${slots[i]}</td>`;
    for (let j = 0; j < 7; j++) {
      const val = symbols[i * 7 + j];
      table += val === 'N'
        ? `<td><img src="https://cdn-icons-png.flaticon.com/512/845/845646.png" width="20"></td>`
        : `<td style="color: #ccc;">✘</td>`;
    }
    table += '</tr>';
  }

  table += `</tbody></table></div>`;
  return table;
}

function checkIfOpenNow(periodString) {
  const now = new Date();
  const weekday = now.getDay();
  const hour = now.getHours();
  const slot = hour >= 6 && hour < 12 ? 0 : hour >= 12 && hour < 18 ? 1 : hour >= 18 && hour < 24 ? 2 : -1;
  if (slot === -1 || periodString.length !== 21) return false;
  const dayIndex = (weekday + 6) % 7;
  return periodString[slot * 7 + dayIndex] === 'N';
}

function initFilterOptions() {
  const citySelect = document.getElementById('citySelect');
  const districtSelect = document.getElementById('districtSelect');

  citySelect.innerHTML = '<option value="">縣市</option>';
  const citySet = new Set(rawData.map(d => d.city));
  [...citySet].forEach(city => {
    citySelect.innerHTML += `<option value="${city}">${city}</option>`;
  });

  citySelect.addEventListener('change', () => {
    const selectedCity = citySelect.value;
    districtSelect.innerHTML = '<option value="">鄉鎮市區</option>';
    districtSelect.disabled = false;
    const districtSet = new Set(
      rawData.filter(d => d.city === selectedCity).map(d => d.district)
    );
    [...districtSet].forEach(dist => {
      districtSelect.innerHTML += `<option value="${dist}">${dist}</option>`;
    });
  });

  document.getElementById('filterButton').addEventListener('click', applyFilter);
  document.getElementById('clearButton').addEventListener('click', () => {
    citySelect.value = '';
    districtSelect.value = '';
    districtSelect.disabled = true;
    document.getElementById('roadInput').value = '';
    document.getElementById('nameInput').value = '';
    document.getElementById('result-list').innerHTML = '';
    allMarkers.forEach(m => map.removeLayer(m));
    allMarkers = [];
    rawData = [];
    currentMode = null;
    updateModeButtonStyle();
    map.setView([23.5, 118.5], 7.2);
  });
}

function applyFilter() {
  const city = document.getElementById('citySelect').value;
  const district = document.getElementById('districtSelect').value;
  const roadKeyword = document.getElementById('roadInput').value.trim();
  const nameKeyword = document.getElementById('nameInput').value.trim();

  if (!city && !district && !roadKeyword && !nameKeyword) {
    alert('請輸入至少一個條件再執行篩選');
    return;
  }

  allMarkers.forEach(m => map.removeLayer(m));
  const matched = allMarkers.filter(marker => {
    const { address, name, city: mCity, district: mDistrict } = marker.meta;
    return (!city || mCity === city) &&
           (!district || mDistrict === district) &&
           (!roadKeyword || address.includes(roadKeyword)) &&
           (!nameKeyword || name.includes(nameKeyword));
  });

  if (matched.length > 0) {
    matched.forEach(m => m.addTo(map));
    const group = new L.featureGroup(matched);
    map.fitBounds(group.getBounds().pad(0.2));
    currentMode === 'clinic' ? renderClinicResults(matched) : renderPharmacyResults(matched);
  } else {
    alert(`找不到符合的${currentMode === 'pharmacy' ? '藥局' : '就醫地點'}`);
    document.getElementById('result-list').innerHTML = '';
  }
}

// 專為手機自動收合 sidebar
function handleCardClick(marker, card) {
  document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
  // 只在手機版收合 sidebar
  if (window.innerWidth <= 700) {
    document.getElementById('sidebar').classList.add('collapsed');
  }
}

function renderClinicResults(markers) {
  const resultList = document.getElementById('result-list');
  resultList.innerHTML = '';
  markers.forEach(marker => {
    const { name, address } = marker.meta;
    const card = document.createElement('div');
    card.className = 'card clinic';
    card.innerHTML = `
      <img src="https://cdn-icons-png.flaticon.com/512/2965/2965567.png" alt="就醫地點">
      <div class="card-info">
        <strong>${name}</strong><br><small>${address}</small>
      </div>`;
    card.addEventListener('click', () => {
      focusMarker(marker);
      handleCardClick(marker, card);
    });
    marker._cardElement = card;
    resultList.appendChild(card);
  });
  bindMarkerClickEvents(markers);
}

function renderPharmacyResults(markers) {
  const resultList = document.getElementById('result-list');
  resultList.innerHTML = '';
  markers.forEach(marker => {
    const { name, address } = marker.meta;
    const card = document.createElement('div');
    card.className = 'card pharmacy';
    card.innerHTML = `
      <img src="https://cdn-icons-png.flaticon.com/512/898/898651.png" alt="藥局">
      <div class="card-info">
        <strong>${name}</strong><br><small>${address}</small>
      </div>`;
    card.addEventListener('click', () => {
      focusMarker(marker);
      handleCardClick(marker, card);
    });
    marker._cardElement = card;
    resultList.appendChild(card);
  });
  bindMarkerClickEvents(markers);
}

function bindMarkerClickEvents(markers) {
  markers.forEach(marker => {
    marker.on('click', () => {
      focusMarker(marker);
      document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
      const card = marker._cardElement;
      if (card) {
        card.classList.add('active');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });
}

function focusMarker(marker) {
  const latlng = marker.getLatLng();
  const point = map.latLngToContainerPoint(latlng);
  const offsetY = window.innerWidth < 768 ? 250 : -150;
  const offsetPoint = L.point(point.x, point.y - offsetY);
  const centerLatLng = map.containerPointToLatLng(offsetPoint);
  map.setView(centerLatLng, 18);
  marker.openPopup();
}
