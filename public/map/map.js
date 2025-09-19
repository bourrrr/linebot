const customIcon = new L.Icon({
  iconUrl: 'my-marker.svg',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  shadowSize: [41, 41]
});

const map = L.map('map', { maxZoom: 17, minZoom: 7 }).setView([23.5, 121], 7.2);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri',
  maxZoom: 17

}).addTo(map);

let allMarkers = [];
let rawData = [];
let currentMode = null;
let userLocation = null;
let suppressNextZoomCollapse = false; // 🔧 用來跳過一次 zoomend 收起
let showDistance = false;
let suppressZoomCollapseCount = 0;
let userMarker = null; // 全域變數存放使用者標記
let preloadedData = {};
const dataSources = {
  pharmacy: 'points.json',
  clinic: 'clinic_points_format.json'
};

document.addEventListener('DOMContentLoaded', () => {
  preloadData();
  if (window.innerWidth > 700) {
    locateUser();  // 只有寬度超過 700px 的才定位（桌面）
  }
  // ✅ 自動收起 bottom-sheet 機制
  let lastZoom = map.getZoom();

  map.on('zoomend', () => {
    if (suppressZoomCollapseCount > 0) {
      suppressZoomCollapseCount--;
      return;
    }

    const newZoom = map.getZoom();
    if (newZoom > lastZoom) {
      document.getElementById('bottom-sheet').classList.add('collapsed');
    }
    lastZoom = newZoom;
  });

  function preloadData() {
    Object.entries(dataSources).forEach(([mode, url]) => {
      fetch(url)
        .then(res => res.json())
        .then(json => {
          preloadedData[mode] = json.features;
          console.log(`✅ ${mode} 資料已預載 (${json.features.length} 筆)`);
        })
        .catch(err => console.error(`❌ ${mode} 載入失敗`, err));
    });
  }


  map.on('click', (e) => {
    // ✅ 點擊 popup 或 marker 不觸發收起
    const target = e.originalEvent.target;
    const isPopupOrMarker =
      target.closest('.leaflet-popup') || target.closest('.leaflet-marker-icon');

    if (!isPopupOrMarker) {
      document.getElementById('bottom-sheet').classList.add('collapsed');
    }
  });


  document.getElementById('btn-clinic').addEventListener('click', () => {
    // 🔹 清空所有條件
    showDistance = false;

    const citySelect = document.getElementById('citySelect');
    const districtSelect = document.getElementById('districtSelect');
    citySelect.value = '';
    districtSelect.value = '';
    districtSelect.disabled = true;
    document.getElementById('keywordInput').value = '';

    document.getElementById('results-list').innerHTML = '<div class="no-result">請先搜尋</div>';
    document.getElementById('bottom-sheet').classList.add('collapsed');

    allMarkers.forEach(m => {
      map.removeLayer(m);
      m.meta.distance = undefined;
    });

    allMarkers = [];
    rawData = [];
    activeMarker = null;
    activePopup = null;
    map.closePopup();
    map.setView([23.5, 121], 7.2);

    if (userMarker) {
      map.removeLayer(userMarker);
      userMarker = null;
    }
    userLocation = null;

    // 🔹 切換模式
    currentMode = 'clinic';
    updateModeButtonStyle();
    loadData();
  });

  document.getElementById('btn-pharmacy').addEventListener('click', () => {
    // 🔹 清空所有條件
    showDistance = false;

    const citySelect = document.getElementById('citySelect');
    const districtSelect = document.getElementById('districtSelect');
    citySelect.value = '';
    districtSelect.value = '';
    districtSelect.disabled = true;
    document.getElementById('keywordInput').value = '';

    document.getElementById('results-list').innerHTML = '<div class="no-result">請先搜尋</div>';
    document.getElementById('bottom-sheet').classList.add('collapsed');

    allMarkers.forEach(m => {
      map.removeLayer(m);
      m.meta.distance = undefined;
    });

    allMarkers = [];
    rawData = [];
    activeMarker = null;
    activePopup = null;
    map.closePopup();
    map.setView([23.5, 121], 7.2);

    if (userMarker) {
      map.removeLayer(userMarker);
      userMarker = null;
    }
    userLocation = null;

    // 🔹 切換模式
    currentMode = 'pharmacy';
    updateModeButtonStyle();
    loadData();
  });



  document.getElementById('locateBtn').addEventListener('click', async () => {
    if (!currentMode) {
      alert('⚠️ 請先選擇「就醫掛號」或「就近領藥」');
      return;
    }

    const inLiff = (typeof liff !== 'undefined');
    try {
      if (inLiff) {
        await liff.init({ liffId: '2007877199-bPxeDZLD' });
      }
    } catch (err) {
      console.warn('⚠️ LIFF 初始化失敗，改用一般定位', err);
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        userLocation = { lat, lng };
        showDistance = true;

        // ✅ 畫使用者位置藍點
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.circleMarker([lat, lng], {
          radius: 7,
          color: '#c1c1c1ff',
          fillColor: '#2a93ee',
          fillOpacity: 0.9
        }).addTo(map).bindPopup("📍 您的位置").openPopup();

        // ✅ 找最近診所/藥局
        const nearest = allMarkers
          .map(m => {
            const dist = getDistanceInKm(lat, lng, m.meta.lat, m.meta.lng);
            return { marker: m, dist };
          })
          .sort((a, b) => a.dist - b.dist)[0];

        if (nearest && nearest.marker.meta.city) {
          const city = nearest.marker.meta.city;
          document.getElementById('citySelect').value = city;
          document.getElementById('districtSelect').disabled = true;
        }

        applyFilter();
        document.getElementById('bottom-sheet').classList.remove('collapsed');
        document.getElementById('results-list').scrollTo({ top: 0, behavior: 'smooth' });

        // ✅ 同時顯示使用者 + 最近診所/藥局
        if (nearest) {
          const bounds = L.latLngBounds([
            [lat, lng],
            [nearest.marker.meta.lat, nearest.marker.meta.lng]
          ]);
          suppressNextZoomCollapse = true;
          suppressZoomCollapseCount = 2;
          map.fitBounds(bounds.pad(0.2)); // 包含兩個點
          suppressNextZoomCollapse = true;
          suppressZoomCollapseCount = 2;

          map.setZoom(14); // 強制 zoom 到 14 級
          nearest.marker.openPopup();
        } else {
          map.setView([lat, lng], 14); // 沒找到時只顯示自己
        }

        alert("已定位並顯示離您最近的醫院/藥局");
      },
      err => {
        let tip = "⚠️ 定位失敗：" + err.message;

        if (err.code === err.PERMISSION_DENIED) {
          tip = "❌ 您拒絕了定位權限";
          const ua = navigator.userAgent;
          if (ua.includes("Chrome")) {
            tip += "\n請至設定 > 隱私與安全性 > 網站設定 > 位置 > 本網站 > 點選「允許」";
          } else if (ua.includes("Safari")) {
            tip += "\n請至 設定 > App > Line > 位置 > 點選「永遠」";
          } else if (ua.includes("Firefox")) {
            tip += "\n請至 設定 > App > Line > 位置 > 點選「一律允許」";
          }
        }
        alert(tip);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });



  const bottomSheet = document.getElementById('bottom-sheet');
  const sheetHandle = bottomSheet.querySelector('.sheet-handle');
  sheetHandle.addEventListener('click', () => {
    bottomSheet.classList.toggle('collapsed');
  });

  const scrollBtn = document.getElementById('scrollTopBtn');
  const resultContainer = document.getElementById('results-list');
  scrollBtn.addEventListener('click', () => resultContainer.scrollTo({ top: 0, behavior: 'smooth' }));
  resultContainer.addEventListener('scroll', () => {
    scrollBtn.style.display = resultContainer.scrollTop > 200 ? 'block' : 'none';
  });

  initFilterOptions();

  document.getElementById('results-list').innerHTML = '<div class="no-result">請先搜尋</div>';
  document.getElementById('bottom-sheet').classList.add('collapsed');
});
function locateUser() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      () => {
        // ✅ 不設定位置、不畫藍點，只是觸發一下看瀏覽器支援
      },
      () => console.warn("⚠️ 無法取得您的位置")
    );
  } else {
    alert("⚠️ 此瀏覽器不支援定位功能");
  }
}


function getDistanceInKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function updateModeButtonStyle() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  if (currentMode === 'clinic') {
    document.getElementById('btn-clinic').classList.add('active');
  } else if (currentMode === 'pharmacy') {
    document.getElementById('btn-pharmacy').classList.add('active');
  }
}
function initFilterOptions() {
  const citySelect = document.getElementById('citySelect');
  const districtSelect = document.getElementById('districtSelect');

  citySelect.innerHTML = '<option value="">縣市</option>';
  districtSelect.innerHTML = '<option value="">鄉鎮市區</option>';
  districtSelect.disabled = true;

  const taiwanCityOrder = [
    "基隆市", "臺北市", "新北市", "桃園市", "新竹市", "新竹縣",
    "宜蘭縣", "苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣",
    "嘉義市", "嘉義縣", "臺南市", "高雄市", "屏東縣",
    "臺東縣", "花蓮縣", "澎湖縣", "金門縣", "連江縣"
  ];

  function normalizeCityName(name) {
    return name.replace("台", "臺"); // 將「台」換成「臺」來比對排序
  }

  if (!rawData || rawData.length === 0) return;

  const citySet = new Set(rawData.map(d => d.city).filter(Boolean));
  [...citySet]
    .sort((a, b) =>
      taiwanCityOrder.indexOf(normalizeCityName(a)) -
      taiwanCityOrder.indexOf(normalizeCityName(b))
    )
    .forEach(city => {
      citySelect.innerHTML += `<option value="${city}">${city}</option>`;
    });

  citySelect.addEventListener('change', () => {
    const selectedCity = citySelect.value;
    districtSelect.innerHTML = '<option value="">鄉鎮市區</option>';

    if (!selectedCity) {
      districtSelect.disabled = true;
      return;
    }

    const districtSet = new Set(
      rawData.filter(d => d.city === selectedCity).map(d => d.district).filter(Boolean)
    );
    [...districtSet].sort().forEach(dist => {
      districtSelect.innerHTML += `<option value="${dist}">${dist}</option>`;
    });

    districtSelect.disabled = false;
  });

  // ✅ 搜尋按鈕
  document.getElementById('filterButton').addEventListener('click', () => {
    showDistance = false; // 搜尋不顯示距離
    applyFilter();
  });

  document.getElementById('clearButton').addEventListener('click', () => {
    showDistance = false;

    citySelect.value = '';
    districtSelect.value = '';
    districtSelect.disabled = true;
    document.getElementById('keywordInput').value = '';
    document.getElementById('results-list').innerHTML = '<div class="no-result">請先搜尋</div>';
    document.getElementById('bottom-sheet').classList.add('collapsed');

    allMarkers.forEach(m => {
      map.removeLayer(m);
      m.meta.distance = undefined;
    });

    allMarkers = [];
    rawData = [];
    currentMode = null;
    updateModeButtonStyle();
    activeMarker = null;
    activePopup = null;
    map.closePopup();
    map.setView([23.5, 121], 7.2);

    // ✅✅✅ 加在這裡：清除使用者藍點
    if (userMarker) {
      map.removeLayer(userMarker);
      userMarker = null;
    }
    userLocation = null;
  });

}

function applyFilter() {
  const city = document.getElementById('citySelect').value;
  const district = document.getElementById('districtSelect').value;
  const keywordRaw = document.getElementById('keywordInput').value.trim();
  const keyword = keywordRaw;

  if (!city && !district && !keyword) {
    alert('請至少選擇縣市後再點擊「篩選」按鈕');
    return;
  }
  // ✅ 加入這段「只允許文字」
  const isValidText = /^[\p{L}]+$/u.test(keyword); // \p{L} 表示 Unicode 文字（中英皆可）
  if (keyword && !isValidText) {
    alert('⚠️ 關鍵字請輸入文字，不能包含數字或符號');
    return;
  }


  allMarkers.forEach(m => map.removeLayer(m));

  const matched = allMarkers.filter(marker => {
    const { address, name, city: mCity, district: mDistrict } = marker.meta;
    return (!city || mCity === city) &&
      (!district || mDistrict === district) &&
      (!keyword || address.includes(keyword) || name.includes(keyword));
  });
  if (showDistance && userLocation) {
    matched.forEach(m => {
      const dist = getDistanceInKm(userLocation.lat, userLocation.lng, m.meta.lat, m.meta.lng);
      m.meta.distance = dist;
    });
    matched.sort((a, b) => a.meta.distance - b.meta.distance);
  } else {
    matched.forEach(m => m.meta.distance = undefined);
  }

  if (matched.length > 0) {
    matched.forEach(m => m.addTo(map));
    const group = new L.featureGroup(matched);

    suppressNextZoomCollapse = true; // ✅ 通知 zoomend 跳過一次
    map.fitBounds(group.getBounds().pad(0.2));

    document.getElementById('bottom-sheet').classList.remove('collapsed');
    currentMode === 'clinic' ? renderClinicResults(matched) : renderPharmacyResults(matched);
    // 🔸 每次篩選後：捲回結果最上方
    const list = document.getElementById('results-list');
    list.scrollTo({ top: 0, behavior: 'auto' });

    // 🔸 把第一筆設為 active 並聚焦地圖 + 開 popup
    const first = matched[0];
    // 先清掉之前的 active
    document.querySelectorAll('.result-card').forEach(c => c.classList.remove('active'));

    // 等 DOM 的卡片插進去後再設 active（0ms 即可）
    setTimeout(() => {
      if (first._cardElement) {
        first._cardElement.classList.add('active');
      }
      // 更新全域的 activeMarker / activePopup，也避免舊 popup 影響
      activeMarker = null;
      activePopup = null;
      map.closePopup();

      // 聚焦第一個點（你原本的 focusMarker 會 pan + popup）
      focusMarker(first);
    }, 0);

  } else {
    alert(`找不到符合的${currentMode === 'pharmacy' ? '藥局' : '就醫地點'}`);
    document.getElementById('results-list').innerHTML = '<div class="no-result">查無資料</div>';
    document.getElementById('bottom-sheet').classList.remove('collapsed');
  }
}

function renderClinicResults(markers) {
  const resultList = document.getElementById('results-list');
  resultList.innerHTML = '';
  if (markers.length === 0) {
    resultList.innerHTML = '<div class="no-result">查無資料</div>';
    return;
  }
  markers.forEach(marker => {
    const { name, address, distance, service_periods } = marker.meta;
    let openStatus = getNowOpenStatus(service_periods);
    let statusTag = '';

    // 距離顯示處理
    const distanceText = distance !== undefined
      ? (distance < 1
        ? `(${Math.round(distance * 1000)} 公尺)`
        : `(${distance.toFixed(2)} 公里)`)
      : '';

    const card = document.createElement('div');
    card.className = 'result-card clinic';
    card.innerHTML = `
      <img src="4.png" alt="就醫地點">
      <div class="info">
        <strong>
          ${name} ${statusTag}
          ${distanceText ? `<span class="distance" style="font-weight:normal;font-size:12px;margin-left:3px;">${distanceText}</span>` : ''}
        </strong><br>
        <span class="address">${address}</span><br>
      </div>
      <button class="more-btn">詳細</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('more-btn')) return;
      focusMarker(marker);
      handleCardClick(marker, card);
    });
    card.querySelector('.more-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      showDetailModal(marker.meta);
    });
    marker._cardElement = card;
    resultList.appendChild(card);
  });
  bindMarkerClickEvents(markers);
}

function renderPharmacyResults(markers) {
  const resultList = document.getElementById('results-list');
  resultList.innerHTML = '';
  if (markers.length === 0) {
    resultList.innerHTML = '<div class="no-result">查無資料</div>';
    return;
  }
  markers.forEach(marker => {
    const { name, address, distance } = marker.meta;

    // 距離顯示處理
    const distanceText = distance !== undefined
      ? (distance < 1
        ? `(${Math.round(distance * 1000)} 公尺)`
        : `(${distance.toFixed(2)} 公里)`)
      : '';

    const card = document.createElement('div');
    card.className = 'result-card pharmacy';
    card.innerHTML = `
      <img src="5.png" alt="藥局">
      <div class="info">
        <strong>${name}${distanceText ? `<span class="distance" style="font-weight:normal;font-size:12px;margin-left:3px;">${distanceText}</span>` : ''}</strong><br>
        <span class="address">${address}</span><br>
      </div>
      <button class="more-btn">詳細</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('more-btn')) return;
      focusMarker(marker);
      handleCardClick(marker, card);
    });
    card.querySelector('.more-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      showDetailModal(marker.meta);
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
      document.querySelectorAll('.result-card').forEach(c => c.classList.remove('active'));
      const card = marker._cardElement;
      if (card) {
        card.classList.add('active');
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      document.getElementById('bottom-sheet').classList.remove('collapsed');
    });
  });
}

let activeMarker = null;
let activePopup = null;

// ✅ 點選 marker 或卡片時聚焦並顯示 popup
function focusMarker(marker) {
  const latlng = marker.getLatLng();

  activeMarker = marker;
  activePopup = marker.getPopup();

  // Step 1：先移動到該點（zoom 不變）
  map.panTo(latlng, 13, { animate: true });

  // Step 2：延遲後打開 popup
  setTimeout(() => {
    marker.openPopup();
  }, 300);

  // Step 3：延遲一點進行上浮偏移（只對地圖移動，不影響 marker）
  setTimeout(() => {
    map.panBy([0, 85], { animate: true }); // 向上偏移
  }, 500);
}

// ✅ zoomstart：暫時關閉 popup，避免顯示偏移
map.on('zoomstart', () => {
  if (activePopup) {
    map.closePopup(activePopup);
  }
});

// ✅ zoomend：重新打開 popup 並上浮
map.on('zoomend', () => {
  if (activeMarker) {
    const latlng = activeMarker.getLatLng();

    // 重新對焦位置 + 打開 popup
    map.panTo(latlng, { animate: false }); // 不移動畫面，只保證 marker 不偏
    activeMarker.openPopup();

  }
});


function handleCardClick(marker, card) {
  document.querySelectorAll('.result-card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
}


function loadData() {
  if (!currentMode || !preloadedData[currentMode]) {
    console.warn("⚠️ 尚未預載完成");
    return;
  }

  allMarkers.forEach(m => map.removeLayer(m));
  allMarkers = [];
  rawData = [];

  const data = preloadedData[currentMode]; // ✅ 直接用記憶體資料

  data.forEach(item => {
    const [lng, lat] = item.geometry.coordinates;
    const props = item.properties;

    const marker = L.marker([lat, lng], { icon: customIcon }).bindPopup(`
      <div style="font-size:15px;">
        🚩 <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking"
          target="_blank">${props.name}（導航）</a>
      </div>
    `);

    const { city, district } = parseAddress(props.address || '');
    marker.meta = {
      name: props.name || '未提供',
      address: props.address || '未提供',
      phone: props.phone || '無',
      note: props.note || '無',
      service_periods: props.service_periods || '',
      dispense_method: props.dispense_method,
      description: props.description,
      registration_url: props.registration_url,
      lat, lng, city, district
    };

    allMarkers.push(marker);
    rawData.push(marker.meta);
  });

  allMarkers.forEach(m => m.addTo(map));
  setTimeout(() => map.invalidateSize(), 300);
  initFilterOptions();

  document.getElementById('results-list').innerHTML = '<div class="no-result">請先搜尋</div>';
  document.getElementById('bottom-sheet').classList.add('collapsed');
}


function parseAddress(address) {
  const regex = /^(?<city>[^縣市]+[縣市])(?<district>[^縣市]+[區鄉鎮市])/;
  const match = address.match(regex);
  if (match && match.groups) {
    return {
      city: match.groups.city,
      district: match.groups.district
    };
  }
  return { city: '', district: '' };
}
function getNowOpenStatus(service_periods) {
  if (!service_periods || service_periods.length !== 21) return 'unknown';
  const now = new Date();
  const day = now.getDay(); // 0=日, 1=一, ..., 6=六
  const hour = now.getHours();
  const min = now.getMinutes();

  const slots = [
    { start: 8 * 60, end: 12 * 60 },           // 上午
    { start: 15 * 60, end: 18 * 60 },          // 下午
    { start: 18 * 60 + 45, end: 20 * 60 + 45 } // 晚上
  ];

  const idx = day === 0 ? 6 : day - 1;
  const nowMins = hour * 60 + min;

  for (let i = 0; i < 3; i++) {
    const periodChar = service_periods[i * 7 + idx];
    if (periodChar === 'N') {
      if (nowMins >= slots[i].start && nowMins <= slots[i].end) {
        return 'open';
      }
    }
  }
  return 'closed';
}

function showDetailModal(meta) {
  let openStatus = 'unknown';
  if (meta.service_periods) {
    openStatus = getNowOpenStatus(meta.service_periods);
  }
  const statusTag = openStatus === 'open'
    ? `<span class="open-tag">營業中</span>`
    : (openStatus === 'closed'
      ? `<span class="closed-tag">休息中</span>`
      : '');

  const address = meta.address || '';
  const lat = meta.lat, lng = meta.lng;
  const phone = meta.phone || '';
  const dispense = Array.isArray(meta.dispense_method) ? meta.dispense_method.join('、') : (meta.dispense_method || '');

  let regArr = Array.isArray(meta.description) ? meta.description : (meta.description ? [meta.description] : []);
  let regText = '';
  let hasWebReg = false;

  let mappedArr = regArr.map(item => {
    if (item.indexOf('現場') !== -1) return '現場';
    if (item.indexOf('電話') !== -1) return '電話';
    if (item.indexOf('網路') !== -1) {
      if (meta.registration_url) hasWebReg = true;
      return '網路';
    }
    return item; // 其它保留原文字
  });
  regText = mappedArr.join('、');
  if (hasWebReg && meta.registration_url) {
    regText += `<a href="${meta.registration_url}" target="_blank" style="color:#659963de;font-size:14.5px;text-decoration:underline;margin-left:8px;">(點我網路掛號)</a>`;
  }

let detailHtml = `
  <div style="font-size:22px;font-weight:700;color:#588157;margin-bottom:8px;">
    🚩 ${meta.name} ${statusTag}
  </div>
  <div style="font-size:16.5px;line-height:1.8; padding-left:10px;">
    ☎️ ${phone}
    <a href="tel:${phone}" style="color:#659963de;font-size:14.5px;text-decoration:underline;margin-left:8px;">
      (點我撥打)
    </a><br>
    🏠 ${address}
    <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking"
      target="_blank" style="color:#659963de;font-size:14.5px;text-decoration:underline;margin-left:8px;">
      (點我導航)
    </a><br>
`;

if (currentMode === 'clinic') {
  detailHtml += `
    🚗 領藥方式：${dispense || '－'}<br>
    🪪 掛號方式：${regText || '－'}<br>
  `;
}

  detailHtml += `</div>
    <div style="margin:12px 0 0 0;">
      ${meta.service_periods ? generatePeriodTable(meta.service_periods) : ''}
    </div>`;

  document.getElementById('modal-content').innerHTML = `
    <button class="modal-close" id="modal-close" title="關閉">×</button>
    ${detailHtml}
  `;
  document.getElementById('detail-modal').classList.add('active');

  document.getElementById('modal-close').onclick = hideDetailModal;
  document.getElementById('detail-modal').onclick = function (e) {
    if (e.target.id === 'detail-modal') hideDetailModal();
  };
}

function hideDetailModal() {
  document.getElementById('detail-modal').classList.remove('active');
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

  let table = `<div style="margin-top:0;"><table><thead><tr><th>服務時間</th>${days.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>`;
  for (let i = 0; i < 3; i++) {
    table += `<tr><td>${slots[i]}</td>`;
    for (let j = 0; j < 7; j++) {
      const val = symbols[i * 7 + j];
      table += val === 'N'
        ? `<td><span class="period-check">&#10003;</span></td>`
        : `<td><span class="period-x">&#10005;</span></td>`;
    }
    table += '</tr>';
  }
  table += '</tbody></table></div>';
  return table;
}
