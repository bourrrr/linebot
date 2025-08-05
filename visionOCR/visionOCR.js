// C:\Users\mexx0\linebot\visionOCR\visionOCR.js
const vision = require('@google-cloud/vision');
const path = require('path');

const client = new vision.ImageAnnotatorClient({
  keyFilename: '/etc/secrets/google-vision-key.json'
});


async function googleVisionOCR(imagePath) {
  const [result] = await client.textDetection(imagePath);
  const detections = result.textAnnotations;
  return detections[0]?.description || '';
}

module.exports = googleVisionOCR;
