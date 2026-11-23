function getPublicAppUrl() {
  const configured = process.env.PUBLIC_APP_URL || process.env.CLIENT_URL?.split(',')[0]?.trim();
  if (!configured) {
    throw Object.assign(new Error('Configure PUBLIC_APP_URL before generating public QR codes.'), { status: 503 });
  }
  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    throw Object.assign(new Error('Configure PUBLIC_APP_URL before generating public QR codes.'), { status: 503 });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw Object.assign(new Error('PUBLIC_APP_URL must be a valid HTTP or HTTPS URL.'), { status: 503 });
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw Object.assign(new Error('PUBLIC_APP_URL must use HTTPS in production.'), { status: 503 });
  }
  return parsed.toString().replace(/\/$/, '');
}

module.exports = { getPublicAppUrl };
