const fail = (status, message) => Object.assign(new Error(message), { status });

function geocoderBase() {
  const value = process.env.MAP_GEOCODER_BASE_URL?.trim();
  if (!value)
    throw fail(
      503,
      "Address search is not configured. Set MAP_GEOCODER_BASE_URL on the server.",
    );
  let url;
  try {
    url = new URL(value);
  } catch {
    throw fail(503, "The configured map geocoder URL is invalid.");
  }
  if (url.protocol !== "https:")
    throw fail(503, "The map geocoder must use HTTPS.");
  return url.toString().endsWith("/") ? url : new URL(`${url.toString()}/`);
}

function normalizeAddress(address = {}) {
  return {
    house: address.house_number || address.house_name || "",
    street:
      address.road ||
      address.pedestrian ||
      address.residential ||
      address.street ||
      "",
    landmark: address.suburb || address.neighbourhood || address.quarter || "",
    city:
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      "",
    state: address.state || address.province || address.region || "",
    postalCode: address.postcode || "",
  };
}

async function request(path, parameters) {
  const url = new URL(path, geocoderBase());
  for (const [key, value] of Object.entries(parameters))
    url.searchParams.set(key, String(value));
  const headers = {
    Accept: "application/json",
    "User-Agent": process.env.MAP_GEOCODER_USER_AGENT || "FoodieHub/1.0",
  };
  if (process.env.MAP_GEOCODER_API_KEY)
    headers.Authorization = `Bearer ${process.env.MAP_GEOCODER_API_KEY}`;
  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  } catch {
    throw fail(502, "The configured map geocoder could not be reached.");
  }
  if (!response.ok)
    throw fail(502, `The map geocoder returned status ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw fail(502, "The map geocoder returned an invalid response.");
  }
}

function normalizeResult(item) {
  const properties = item.properties || item;
  const coordinates = item.geometry?.coordinates;
  const latitude = Number(item.lat ?? properties.lat ?? coordinates?.[1]);
  const longitude = Number(item.lon ?? properties.lon ?? coordinates?.[0]);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  )
    return null;
  return {
    latitude,
    longitude,
    label:
      item.display_name ||
      properties.label ||
      properties.name ||
      "Map location",
    address: normalizeAddress(item.address || properties.address || {}),
  };
}

exports.search = async (query) => {
  const q = typeof query === "string" ? query.trim().slice(0, 200) : "";
  if (q.length < 3)
    throw fail(400, "Enter at least 3 characters to search for an address.");
  const payload = await request("search", {
    q,
    format: "jsonv2",
    addressdetails: 1,
    limit: 5,
  });
  const records = Array.isArray(payload) ? payload : payload.features || [];
  return records.map(normalizeResult).filter(Boolean);
};

exports.reverse = async (latitude, longitude) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lon) ||
    lon < -180 ||
    lon > 180
  )
    throw fail(400, "Provide valid latitude and longitude coordinates.");
  const item = await request("reverse", {
    lat,
    lon,
    format: "jsonv2",
    addressdetails: 1,
  });
  const normalized = normalizeResult(item);
  if (!normalized)
    throw fail(404, "The map geocoder found no address for these coordinates.");
  return normalized;
};
