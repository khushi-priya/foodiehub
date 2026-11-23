import { useState } from 'react';
import { api } from '../services/api';
import { LoaderCircle, MapPin, Search, LocateFixed } from 'lucide-react';

const validCoordinate = (latitude, longitude) => Number.isFinite(Number(latitude)) && Number(latitude) >= -90 && Number(latitude) <= 90 && Number.isFinite(Number(longitude)) && Number(longitude) >= -180 && Number(longitude) <= 180;

export default function AddressLocationPicker({ latitude, longitude, onCoordinatesChange, onAddressChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasLocation = validCoordinate(latitude, longitude) && latitude !== '' && longitude !== '';
  const mapUrl = hasLocation ? `https://www.openstreetmap.org/export/embed.html?bbox=${Number(longitude) - 0.012},${Number(latitude) - 0.008},${Number(longitude) + 0.012},${Number(latitude) + 0.008}&marker=${latitude},${longitude}` : '';

  const applyResult = (result) => {
    onCoordinatesChange(String(result.latitude), String(result.longitude));
    if (result.address) onAddressChange?.(result.address);
    setQuery(result.label || 'Selected map location');
    setResults([]);
    setError('');
  };

  const searchAddress = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await api.get('/customer/geocoding/search', { params: { q: query } });
      setResults(response.data.data || []);
      if (!response.data.data?.length) setError('No matching addresses were found.');
    } catch (requestError) { setError(requestError.response?.data?.message || 'Address search is unavailable.'); }
    finally { setBusy(false); }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { setError('Location access is not available in this browser.'); return; }
    setBusy(true); setError('');
    navigator.geolocation.getCurrentPosition(async (position) => {
      const result = { latitude: position.coords.latitude, longitude: position.coords.longitude, label: 'Current location' };
      try {
        const response = await api.get('/customer/geocoding/reverse', { params: { latitude: result.latitude, longitude: result.longitude } });
        applyResult(response.data.data);
      } catch {
        onCoordinatesChange(String(result.latitude), String(result.longitude));
        setQuery(result.label);
        setError('Location selected. Reverse address lookup is unavailable, so enter the address details below.');
      } finally { setBusy(false); }
    }, (locationError) => { setBusy(false); setError(locationError.message || 'Location permission was not granted.'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  };

  return <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><MapPin size={16} className="text-orange-600"/>Map location</h3><p className="mt-1 text-xs text-slate-500">Search an address or select your current location. Coordinates are optional.</p></div><button type="button" onClick={useCurrentLocation} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-50"><LocateFixed size={14}/>Use current location</button></div>
    <form onSubmit={searchAddress} className="mt-3 flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} minLength={3} placeholder="Search street, area or landmark" className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-orange-400"/><button disabled={busy || query.trim().length < 3} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle size={14} className="animate-spin"/> : <Search size={14}/>}Search</button></form>
    {error && <p role="status" className="mt-2 text-xs text-amber-800">{error}</p>}
    {results.length > 0 && <ul className="mt-2 max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">{results.map((result, index) => <li key={`${result.latitude}-${result.longitude}-${index}`}><button type="button" onClick={() => applyResult(result)} className="w-full px-3 py-2 text-left text-xs leading-5 text-slate-700 hover:bg-orange-50">{result.label}</button></li>)}</ul>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Latitude<input inputMode="decimal" value={latitude ?? ''} onChange={(event) => onCoordinatesChange(event.target.value, longitude ?? '')} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Optional"/></label><label className="text-xs font-semibold text-slate-600">Longitude<input inputMode="decimal" value={longitude ?? ''} onChange={(event) => onCoordinatesChange(latitude ?? '', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Optional"/></label></div>
    {hasLocation && <><iframe title="Selected delivery map location" src={mapUrl} loading="lazy" className="mt-3 h-48 w-full rounded-lg border border-slate-200 bg-white"/><p className="mt-1 text-[10px] text-slate-500">Map data © OpenStreetMap contributors. <a href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`} target="_blank" rel="noreferrer" className="font-semibold text-orange-700">Open map</a></p></>}
  </section>;
}
