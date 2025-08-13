// functions/src/api/createFirebaseToken.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

// 真正處理流程的 handler（可被其他路由/Express 重用）
async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  try {
    const { idToken, role } = req.body || {};
    if (!idToken) return res.status(400).json({ error: "Missing idToken" });

    const CHANNEL_ID = functions.config().line.channel_id; // 之後會設定
    const verifyUrl = `https://api.line.me/oauth2/v2.1/verify?id_token=${encodeURIComponent(
      idToken
    )}&client_id=${encodeURIComponent(CHANNEL_ID)}`;

    const resp = await fetch(verifyUrl);
    const verify = await resp.json();

    if (!verify || !verify.sub) {
      return res.status(401).json({ error: "Invalid LINE id_token", detail: verify });
    }

    const uid = `line:${verify.sub}`;
    const claims = {
      provider: "line",
      role: role || "患者",
      name: verify.name || "",
      picture: verify.picture || "",
      email: verify.email || ""
    };

    const customToken = await admin.auth().createCustomToken(uid, claims);
    return res.json({ firebaseToken: customToken });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}

// 匯出成 HTTPS Function（獨立可部署）
const createFirebaseToken = functions.region("asia-east1").https.onRequest(handler);

module.exports = { createFirebaseToken, handler };
