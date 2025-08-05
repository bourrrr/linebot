const drawButton = document.getElementById('drawButton');
const cardDisplay = document.getElementById('cardDisplay');
const historyDisplay = document.getElementById('historyDisplay');
let cards = [];
let isMuted = false; // 保留未來擴充

// ✅ 使用 LINE userId 當作唯一識別（預設 guest）
const userId = window.lineProfile?.userId || "guest";

// 🔊 載入抽卡音效
const drawAudio = new Audio('sounds/draw.mp3');

fetch('cards.json')
  .then(res => res.json())
  .then(data => {
    cards = data;
    loadHistory();
    loadCollection();
  });

drawButton.addEventListener('click', () => {
  cardDisplay.innerHTML = '';

  // 🔊 播放抽卡音效
  if (!isMuted) drawAudio.play();

  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  cardDisplay.appendChild(spinner);

  setTimeout(() => {
    // 🛑 停止音效
    drawAudio.pause();
    drawAudio.currentTime = 0;

    cardDisplay.innerHTML = '';
    const drawn = new Set();

    while (drawn.size < 3) {
      const rand = Math.random();
      let sum = 0;
      for (const card of cards) {
        sum += card.rate;
        if (rand <= sum) {
          drawn.add(card);
          break;
        }
      }
    }

    drawn.forEach(card => {
      const div = document.createElement('div');
      div.className = 'card';
      div.setAttribute('data-rarity', card.rarity);
      div.innerHTML = `
        <img src="images/cards/${card.image}" class="card-image" />
        <h3>${card.name}</h3>
        <p>稀有度：${card.rarity}</p>
        <button onclick="shareToLINE('${card.name}')">分享到 LINE</button>
      `;
      cardDisplay.appendChild(div);
      saveToFirebase(card);
    });

  }, 2000);
});

function saveToFirebase(card) {
  db.collection('draw_history').add({
    userId,
    cardName: card.name,
    rarity: card.rarity,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  const docRef = db.collection('card_collection').doc(`${userId}_${card.name}`);
  docRef.get().then(doc => {
    if (doc.exists) {
      docRef.update({ count: firebase.firestore.FieldValue.increment(1) });
    } else {
      docRef.set({
        userId,
        cardName: card.name,
        rarity: card.rarity,
        image: card.image,
        count: 1
      });
    }
  }).then(loadCollection);
}

function loadHistory() {
  historyDisplay.innerHTML = '<h3>抽卡紀錄</h3>';
  db.collection('draw_history')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(5)
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const data = doc.data();
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `${data.cardName}（${data.rarity}） - ${data.timestamp?.toDate().toLocaleString()}`;
        historyDisplay.appendChild(el);
      });
    })
    .catch(err => console.error("載入歷史紀錄錯誤：", err));
}

function loadCollection() {
  const containerId = 'collectionDisplay';
  let collectionContainer = document.getElementById(containerId);
  if (!collectionContainer) {
    collectionContainer = document.createElement('div');
    collectionContainer.id = containerId;
    document.body.appendChild(collectionContainer);
  }
  collectionContainer.innerHTML = `<h3>📕 ${userId} 的圖鑑</h3>`;

  const cardGrid = document.createElement('div');
  cardGrid.id = 'cardGrid';
  cardGrid.style.display = 'flex';
  cardGrid.style.flexWrap = 'wrap';
  cardGrid.style.justifyContent = 'center';
  collectionContainer.appendChild(cardGrid);

  db.collection('card_collection')
    .where('userId', '==', userId)
    .get()
    .then(snapshot => {
      let total = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        total += data.count;
        const div = document.createElement('div');
        div.className = 'card';
        div.setAttribute('data-rarity', data.rarity);
        div.innerHTML = `
          <img src="images/cards/${data.image}" class="card-image" />
          <h4>${data.cardName}</h4>
          <p>稀有度：${data.rarity}</p>
          <p>數量：${data.count}</p>
          <a href="images/cards/${data.image}" download="${data.cardName}.png">
            <button>⬇️ 下載圖片</button>
          </a>
        `;
        cardGrid.appendChild(div);
      });
      const stats = document.createElement('p');
      stats.textContent = `📈 總收集數量：${total} 張卡`;
      collectionContainer.appendChild(stats);
    });
}

function shareToLINE(cardName) {
  const url = encodeURIComponent(window.location.href);
  const text = encodeURIComponent(`我剛剛在 MakeWell 抽到了『${cardName}』長輩圖，來一起收集吧！`);
  const lineURL = `https://social-plugins.line.me/lineit/share?url=${url}&text=${text}`;
  window.open(lineURL, '_blank');
}
