// === 元素綁定 ===
const cardDisplay = document.getElementById('cardDisplay');
const drawButton = document.getElementById('drawButton');
let cards = [];
let isMuted = false;

// 聲音
const drawAudio = new Audio('sounds/draw.mp3');
const userId = window.lineProfile?.userId || "guest"; // 若沒有 LIFF，就用 guest

// 動態載入卡片資料
fetch('cards.json')
  .then(res => res.json())
  .then(data => {
    cards = data;

    // 判斷是否為抽卡頁
    if (drawButton) {
      setupDrawPage();
    }

    // 有 historyDisplay 才載入歷史紀錄
    if (document.getElementById('historyDisplay')) {
      loadHistory();
    }
  });

// === 抽卡頁面設定 ===
function setupDrawPage() {
  drawButton.addEventListener('click', () => {
    cardDisplay.innerHTML = '';

    if (!isMuted) drawAudio.play();

    // 加入 loading spinner
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    cardDisplay.appendChild(spinner);

    setTimeout(() => {
      drawAudio.pause();
      drawAudio.currentTime = 0;
      cardDisplay.innerHTML = '';

      const drawn = new Set();
      while (drawn.size < 3) {
        const card = cards[Math.floor(Math.random() * cards.length)];
        drawn.add(card);
      }

      drawn.forEach(card => {
        const img = document.createElement('img');
        img.src = card.image;
        img.alt = card.name;
        img.style.width = '100px';
        img.style.margin = '5px';
        cardDisplay.appendChild(img);
      });

      saveDrawHistory([...drawn]);

    }, 1000);
  });
}

// === 歷史紀錄儲存 ===
function saveDrawHistory(drawnCards) {
  const history = JSON.parse(localStorage.getItem('drawHistory') || '[]');
  const today = new Date().toISOString().split('T')[0];
  history.push({ date: today, cards: drawnCards });
  localStorage.setItem('drawHistory', JSON.stringify(history));
}

// === 歷史紀錄載入（只有存在 historyDisplay 時才執行） ===
function loadHistory() {
  const historyDisplay = document.getElementById('historyDisplay');
  if (!historyDisplay) return;

  const history = JSON.parse(localStorage.getItem('drawHistory') || '[]');
  history.forEach(entry => {
    const div = document.createElement('div');
    div.textContent = `${entry.date} - ${entry.cards.map(c => c.name).join(', ')}`;
    historyDisplay.appendChild(div);
  });
}

// === Spinner 樣式動態注入 ===
const style = document.createElement('style');
style.textContent = `
.spinner {
  border: 6px solid #f3f3f3;
  border-top: 6px solid #588157; /* 重綠 */
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 0.8s linear infinite;
  margin: 20px auto;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}`;
document.head.appendChild(style);
