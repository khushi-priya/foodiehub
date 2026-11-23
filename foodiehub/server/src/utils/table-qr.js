const QRCode = require('qrcode');
const { getPublicAppUrl } = require('./public-app-url');

async function buildTableQrPayload(table) {
  const qrUrl = `${getPublicAppUrl()}/qr/${encodeURIComponent(table.qrToken)}`;
  const imageDataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'H', margin: 4, width: 480 });
  const safeName = String(table.tableNumber || 'table').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'table';
  return { qrAvailable: true, qrUrl, imageDataUrl, downloadName: `foodiehub-${safeName}-qr.png` };
}

module.exports = { buildTableQrPayload };
