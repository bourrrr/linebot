// checkin.js  — 每日簽到（一天一次）＋ 5 格集點 → 獎勵
// 需求：window.lineProfile, firebase 已初始化，且全域有 firebase.firestore()

(function(){
  const db = firebase.firestore();
  const card = document.getElementById('checkinCard');
  const btn = document.getElementById('btnCheckin');
  const stampRow = document.getElementById('stampRow');
  const nextHint = document.getElementById('nextRewardHint');

  // 以台北時區產生日字串，避免跨時區誤判
  const todayStr = new Intl.DateTimeFormat('zh-Hant-TW', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit' })
                    .format(new Date()).replaceAll('/',''); // e.g. 20250812 → '2025/08/12' -> '20250812'

  const uid = (window.lineProfile && window.lineProfile.userId) || 'debug';
  const usersCol = db.collection('users');
  const userDoc = usersCol.doc(uid);
  const checkinCol = userDoc.collection('checkins'); // 每日紀錄（可查明細）
  const metaDoc = userDoc.collection('meta').doc('checkin'); // 快取：最後簽到/本月點數/連續

  // 畫面顯示開啟
  card.style.display = 'block';

  // 取得狀態並渲染
  async function loadState(){
    const snap = await metaDoc.get();
    let data = snap.exists ? snap.data() : {
      lastDate: null,     // 'YYYYMMDD'
      month: monthKey(),  // 'YYYYMM'
      monthPoints: 0,     // 本月已集點
      streak: 0,          // 連續天數（可留作之後活動）
      drawChances: 0      // 抽卡次數池（滿 5 點 +1）
    };

    // 月份切換：新月份歸零
    if (data.month !== monthKey()){
      data.month = monthKey();
      data.monthPoints = 0;
    }

    // 渲染 5 個印章
    renderStamps(data.monthPoints % 5);

    // 今日是否已簽到
    const already = data.lastDate === todayStr;
    btn.disabled = already;
    btn.textContent = already ? '今日已簽到 ✓' : '今日簽到';

    const left = 5 - (data.monthPoints % 5 || 0);
    nextHint.textContent = left === 5 ? '再 5 點可獲得獎勵' : `再 ${left} 點可獲得獎勵`;
  }

  function renderStamps(count){
    // 清除再加上 filled
    [...stampRow.children].forEach((el,i)=>{
      el.classList.toggle('filled', i < count);
    });
  }

  function monthKey(){
    const d = new Date();
    const y = d.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',year:'numeric'});
    const m = d.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit'});
    return `${y}${m}`; // YYYYMM
  }

  // 點擊簽到
  btn.addEventListener('click', async ()=>{
    btn.disabled = true;
    try{
      await db.runTransaction(async (tx)=>{
        const docRef = metaDoc;
        const snap = await tx.get(docRef);
        let data = snap.exists ? snap.data() : {
          lastDate:null, month:monthKey(), monthPoints:0, streak:0, drawChances:0
        };

        // 換月重置月點數
        if (data.month !== monthKey()){
          data.month = monthKey();
          data.monthPoints = 0;
        }

        // 已簽到就直接退出
        if (data.lastDate === todayStr) return;

        // 連續天數：昨天字串
        const ytd = new Date();
        ytd.setDate(ytd.getDate()-1);
        const ytdStr = new Intl.DateTimeFormat('zh-Hant-TW',{ timeZone:'Asia/Taipei', year:'numeric',month:'2-digit',day:'2-digit'}).format(ytd).replaceAll('/','');

        data.streak = (data.lastDate === ytdStr) ? (data.streak||0)+1 : 1;

        // 月點數 +1
        data.monthPoints = (data.monthPoints||0) + 1;
        data.lastDate = todayStr;

        // 明細存一筆（可供活動查核）
        const detail = {
          date: todayStr,
          ts: firebase.firestore.FieldValue.serverTimestamp(),
          type: 'daily'
        };
        tx.set(checkinCol.doc(todayStr), detail, { merge:true });

        // 每 5 點給一次抽卡機會
        if (data.monthPoints % 5 === 0){
          data.drawChances = (data.drawChances||0) + 1;
          data.lastRewardAt = firebase.firestore.FieldValue.serverTimestamp();
        }

        tx.set(docRef, data, { merge:true });
      });

      // 成功後刷新 UI
      await loadState();

      // 彈提示
      const meta = await metaDoc.get();
      const { monthPoints, drawChances } = meta.data();
      if (monthPoints % 5 === 0){
        alert('恭喜！集滿 5 點，已獲得 1 次抽卡機會 🎉');
        // 可改成自動導到抽卡頁：
        // location.href = 'index.html#draw' 或 'draw.html'
      }else{
        alert('簽到成功！已為你累積 1 點 👍');
      }
    }catch(err){
      console.error(err);
      alert('簽到失敗，請稍後再試。');
      btn.disabled = false;
    }
  });

  // 首次載入
  loadState();
})();
