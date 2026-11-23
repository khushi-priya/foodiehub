import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../services/api';

const defaults = { platformName: 'FoodieHub', platformLogo: '', contactEmail: '', contactPhone: '', supportInfo: '', defaultCurrency: 'INR', timezone: 'Asia/Kolkata', taxEnabled: false, taxRate: 0, platformAvailable: true };
const inputClass = 'mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-orange-400';
const pretty = (value) => value == null ? '—' : JSON.stringify(value, null, 2);

function Field({ label, children }) { return <label className="block text-xs font-semibold text-slate-600">{label}{children}</label>; }

export default function System() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'audit' ? 'audit' : 'settings');
  const [settings, setSettings] = useState(defaults);
  const [filters, setFilters] = useState({ search: '', action: '', entityType: '', from: '', to: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', action: '', entityType: '', from: '', to: '' });
  const [audit, setAudit] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { if (searchParams.get('tab') === 'audit' && tab !== 'audit') setTab('audit'); }, [searchParams, tab]);
  useEffect(() => {
    let active = true;
    api.get('/admin/system/settings').then(({ data }) => { if (active) setSettings({ ...defaults, ...data.data.settings }); })
      .catch((e) => { if (active) setError(e.response?.data?.message || 'Platform settings could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const loadAudit = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const params = Object.fromEntries(Object.entries({ ...appliedFilters, page, pageSize: 25 }).filter(([, value]) => value !== ''));
      const { data } = await api.get('/admin/system/audit-logs', { params });
      setAudit(data.data);
    } catch (e) { setError(e.response?.data?.message || 'Audit logs could not be loaded.'); }
    finally { setLoading(false); }
  }, [appliedFilters]);
  useEffect(() => { if (tab === 'audit') loadAudit(1); }, [tab, loadAudit]);

  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  async function saveSettings(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const { data } = await api.put('/admin/system/settings', { settings });
      setSettings((current) => ({ ...current, ...data.data.settings }));
      setNotice('Platform settings saved. A change was added to the audit log.');
    } catch (e) { setError(e.response?.data?.message || 'Settings could not be saved.'); }
    finally { setSaving(false); }
  }

  const pageButtons = useMemo(() => audit.pagination.totalPages > 1, [audit.pagination.totalPages]);
  function chooseTab(value) { setTab(value); setSearchParams(value === 'audit' ? { tab: 'audit' } : {}); }
  const date = (value) => value ? new Date(value).toLocaleString() : '—';

  return <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
    <header><p className="text-sm font-bold uppercase tracking-widest text-orange-600">System</p><h1 className="mt-2 text-3xl font-extrabold text-slate-900">Platform settings & audit</h1><p className="mt-2 text-sm text-slate-500">Manage platform contact and display details, then review the immutable record of administrative changes.</p></header>
    <nav className="flex gap-2 border-b border-slate-200"><button onClick={() => chooseTab('settings')} className={`px-4 py-3 text-sm font-bold ${tab === 'settings' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-slate-500'}`}>Platform settings</button><button onClick={() => chooseTab('audit')} className={`px-4 py-3 text-sm font-bold ${tab === 'audit' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-slate-500'}`}>Audit logs</button></nav>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

    {tab === 'settings' ? <>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Operational scope:</strong> Tax and platform availability are saved as configuration only. Tax is not applied to checkout, and availability does not currently block customer or restaurant requests.</div>
      <form onSubmit={saveSettings} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <section><h2 className="font-bold text-slate-900">Platform identity</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Platform name"><input required maxLength={120} className={inputClass} value={settings.platformName} onChange={(e) => update('platformName', e.target.value)}/></Field><Field label="Logo URL or application path"><input maxLength={1000} className={inputClass} placeholder="https://… or /assets/logo.svg" value={settings.platformLogo} onChange={(e) => update('platformLogo', e.target.value)}/></Field></div></section>
        <section><h2 className="font-bold text-slate-900">Contact & defaults</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Contact email"><input type="email" maxLength={254} className={inputClass} value={settings.contactEmail} onChange={(e) => update('contactEmail', e.target.value)}/></Field><Field label="Contact phone"><input maxLength={30} className={inputClass} value={settings.contactPhone} onChange={(e) => update('contactPhone', e.target.value)}/></Field><Field label="Default currency (ISO code)"><input required maxLength={3} className={inputClass} value={settings.defaultCurrency} onChange={(e) => update('defaultCurrency', e.target.value.toUpperCase())}/></Field><Field label="Timezone (IANA)"><input required maxLength={100} className={inputClass} placeholder="Asia/Kolkata" value={settings.timezone} onChange={(e) => update('timezone', e.target.value)}/></Field><Field label="Support information"><textarea rows={3} maxLength={2000} className={inputClass} value={settings.supportInfo} onChange={(e) => update('supportInfo', e.target.value)}/></Field></div></section>
        <section><h2 className="font-bold text-slate-900">Tax & availability configuration</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold text-slate-700"><input type="checkbox" checked={settings.taxEnabled} onChange={(e) => update('taxEnabled', e.target.checked)}/>Tax enabled flag</label><Field label="Tax rate (%)"><input type="number" min="0" max="100" step="0.01" className={inputClass} value={settings.taxRate} onChange={(e) => update('taxRate', e.target.value === '' ? '' : Number(e.target.value))}/></Field><label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold text-slate-700"><input type="checkbox" checked={settings.platformAvailable} onChange={(e) => update('platformAvailable', e.target.checked)}/>Platform marked available</label></div></section>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><p className="text-xs text-slate-400">Settings are stored in the database. Changes are recorded with before and after values.</p><button disabled={saving || loading} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{saving ? 'Saving…' : 'Save settings'}</button></div>
      </form>
    </> : <>
      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3"><Field label="Search action, entity, ID, or actor"><input className={inputClass} value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })}/></Field><Field label="Action"><input className={inputClass} placeholder="restaurant.updated" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}/></Field><Field label="Entity type"><input className={inputClass} placeholder="restaurant" value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}/></Field><Field label="From (UTC)"><input type="datetime-local" className={inputClass} value={filters.from.slice(0, 16)} onChange={(e) => setFilters({ ...filters, from: e.target.value ? new Date(e.target.value).toISOString() : '' })}/></Field><Field label="To (UTC)"><input type="datetime-local" className={inputClass} value={filters.to.slice(0, 16)} onChange={(e) => setFilters({ ...filters, to: e.target.value ? new Date(e.target.value).toISOString() : '' })}/></Field><div className="flex items-end"><button onClick={() => setAppliedFilters(filters)} className="h-10 rounded-lg bg-slate-900 px-5 text-sm font-bold text-white">Apply filters</button></div></section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="font-bold text-slate-900">Administrative activity</h2><p className="text-xs text-slate-500">{audit.pagination.total.toLocaleString()} records · read-only</p></div><button onClick={() => loadAudit(audit.pagination.page)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Refresh</button></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Time</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">Reason</th><th className="p-3">Details</th></tr></thead><tbody className="divide-y divide-slate-100">{audit.items.map((row) => <tr key={row.id} className="text-slate-700"><td className="whitespace-nowrap p-3">{date(row.createdAt)}</td><td className="p-3">{row.actor ? `${row.actor.firstName || ''} ${row.actor.lastName || ''}`.trim() || row.actor.email : 'System / deleted actor'}</td><td className="p-3 font-semibold">{row.action}</td><td className="p-3">{row.entityType}<span className="block max-w-48 truncate text-xs text-slate-400">{row.entityId}</span></td><td className="max-w-48 truncate p-3">{row.reason || '—'}</td><td className="p-3"><button onClick={() => setSelected(row)} className="font-semibold text-orange-600 hover:underline">View</button></td></tr>)}</tbody></table>{!loading && audit.items.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No audit records match these filters.</p>}</div><div className="flex items-center justify-between border-t border-slate-100 p-4 text-xs text-slate-500"><span>Page {audit.pagination.page} of {audit.pagination.totalPages || 1}</span>{pageButtons && <div className="flex gap-2"><button disabled={audit.pagination.page <= 1} onClick={() => loadAudit(audit.pagination.page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><button disabled={audit.pagination.page >= audit.pagination.totalPages} onClick={() => loadAudit(audit.pagination.page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>}</div></section>
    </>}
    {selected && <div role="dialog" aria-modal="true" aria-label="Audit log details" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setSelected(null)}><section onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">{selected.action}</h2><p className="text-xs text-slate-500">{selected.entityType} · {selected.entityId} · {date(selected.createdAt)}</p></div><button onClick={() => setSelected(null)} className="rounded-lg border px-3 py-2 text-sm">Close</button></div><div className="mt-5 grid gap-4 md:grid-cols-2"><div><h3 className="mb-2 text-sm font-bold">Before</h3><pre className="max-h-80 overflow-auto rounded-xl bg-slate-50 p-3 text-xs">{pretty(selected.beforeData)}</pre></div><div><h3 className="mb-2 text-sm font-bold">After</h3><pre className="max-h-80 overflow-auto rounded-xl bg-slate-50 p-3 text-xs">{pretty(selected.afterData)}</pre></div></div><dl className="mt-4 grid gap-2 text-xs text-slate-600 md:grid-cols-2"><div>Reason: {selected.reason || '—'}</div><div>Actor role: {selected.actorRole || '—'}</div><div>IP: {selected.ipAddress || '—'}</div><div>User agent: {selected.userAgent || '—'}</div></dl></section></div>}
  </div>;
}
