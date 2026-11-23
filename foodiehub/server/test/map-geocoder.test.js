const test = require('node:test');
const assert = require('node:assert/strict');
const geocoder = require('../src/services/map-geocoder');

function restoreEnv(t, names) {
  const values = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(() => { for (const name of names) values[name] === undefined ? delete process.env[name] : process.env[name] = values[name]; });
}

test('geocoder clearly reports missing configuration and refuses insecure provider URLs', async (t) => {
  restoreEnv(t, ['MAP_GEOCODER_BASE_URL']);
  delete process.env.MAP_GEOCODER_BASE_URL;
  await assert.rejects(geocoder.search('Bengaluru market'), { status: 503, message: /not configured/ });
  process.env.MAP_GEOCODER_BASE_URL = 'http://geocoder.example';
  await assert.rejects(geocoder.search('Bengaluru market'), { status: 503, message: /HTTPS/ });
});

test('geocoder validates address input and coordinate bounds before making a request', async (t) => {
  restoreEnv(t, ['MAP_GEOCODER_BASE_URL']);
  process.env.MAP_GEOCODER_BASE_URL = 'https://geocoder.example';
  await assert.rejects(geocoder.search('  '), { status: 400 });
  await assert.rejects(geocoder.reverse(91, 0), { status: 400 });
  await assert.rejects(geocoder.reverse(0, -181), { status: 400 });
});

test('geocoder normalizes real provider results and sends its configured bearer token', async (t) => {
  restoreEnv(t, ['MAP_GEOCODER_BASE_URL', 'MAP_GEOCODER_API_KEY', 'MAP_GEOCODER_USER_AGENT']);
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  process.env.MAP_GEOCODER_BASE_URL = 'https://geocoder.example/';
  process.env.MAP_GEOCODER_API_KEY = 'test-token';
  process.env.MAP_GEOCODER_USER_AGENT = 'FoodieHub integration test';
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: new URL(url), options });
    return { ok: true, status: 200, json: async () => [{ lat: '12.9716', lon: '77.5946', display_name: 'Bengaluru, Karnataka', address: { road: 'MG Road', city: 'Bengaluru', state: 'Karnataka', postcode: '560001' } }] };
  };
  const found = await geocoder.search('MG Road Bengaluru');
  assert.deepEqual(found[0], { latitude: 12.9716, longitude: 77.5946, label: 'Bengaluru, Karnataka', address: { house: '', street: 'MG Road', landmark: '', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001' } });
  assert.equal(requests[0].url.pathname, '/search');
  assert.equal(requests[0].url.searchParams.get('q'), 'MG Road Bengaluru');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token');
  assert.equal(requests[0].options.headers['User-Agent'], 'FoodieHub integration test');
});

