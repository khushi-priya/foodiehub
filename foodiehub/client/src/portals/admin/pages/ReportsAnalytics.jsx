import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import { api } from '../../../services/api';

const reports = ['orders', 'restaurants', 'customers', 'subscriptions', 'payments', 'commissions', 'settlements', 'refunds'];
const reportName = (value) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value) => value == null ? 'Unavailable' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
const number = (value) => Number(value || 0).toLocaleString('en-IN');
const utcDate = (value) => new Date(value).toISOString().slice(0, 10);
const dateRange = (preset) => {
  const now = new Date(); const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); const day = 86400000;
  if (preset === 'today') return { from: new Date(today).toISOString(), to: now.toISOString() };
  if (preset === 'yesterday') return { from: new Date(today - day).toISOString(), to: new Date(today).toISOString() };
  if (preset === 'last7') return { from: new Date(today - 6 * day).toISOString(), to: now.toISOString() };
  if (preset === 'last30') return { from: new Date(today - 29 * day).toISOString(), to: now.toISOString() };
  if (preset === 'thisMonth') return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(), to: now.toISOString() };
  if (preset === 'previousMonth') return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString(), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString() };
  return dateRange('last30');
};

function Metric({ label, value, note, tone = 'slate' }) {
  const tones = { slate: 'border-slate-200', orange: 'border-orange-200', green: 'border-emerald-200', blue: 'border-blue-200', violet: 'border-violet-200' };
  return <article className={`rounded-2xl border ${tones[tone]} bg-white p-4 shadow-sm`}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-xl font-extrabold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{note}</p></article>;
}

function Bars({ title, rows, value, label, format = number, color = 'bg-orange-400' }) {
  const max = Math.max(0, ...rows.map((row) => Number(value(row) || 0)));
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-bold text-slate-900">{title}</h3>{rows.length ? <div className="mt-5 flex h-52 items-end gap-1 overflow-x-auto border-b border-slate-100 pb-2">{rows.map((row, index) => { const amount = Number(value(row) || 0); const height = amount && max ? Math.max(3, amount / max * 100) : 2; return <div key={`${label(row)}-${index}`} title={`${label(row)}: ${format(amount)}`} className="group flex h-full min-w-[15px] flex-1 flex-col justify-end"><div className={`w-full rounded-t-sm ${color} transition hover:opacity-75`} style={{ height: `${height}%` }}/><span className="mt-1 w-full truncate text-center text-[9px] text-slate-400">{rows.length <= 15 ? label(row) : index % 5 === 0 ? label(row) : ''}</span></div>; })}</div> : <p className="mt-5 flex h-52 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">No records in this period</p>}</article>;
}

function Ranking({ title, rows, primary, metric, format = number }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[metric] || 0)));
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-bold text-slate-900">{title}</h3>{rows.length ? <ol className="mt-4 space-y-3">{rows.map((row, index) => <li key={row[primary] || index}><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium text-slate-700">{index + 1}. {row[primary]}</span><span className="shrink-0 font-bold text-slate-900">{format(row[metric])}</span></div><div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-400" style={{ width: `${Math.max(2, Number(row[metric] || 0) / max * 100)}%` }}/></div></li>)}</ol> : <p className="mt-4 text-sm text-slate-400">No records in this period.</p>}</article>;
}

export default function ReportsAnalytics() {
  const initial = dateRange('last30');
  const [preset, setPreset] = useState('last30');
  const [fromInput, setFromInput] = useState(utcDate(initial.from));
  const [toInput, setToInput] = useState(utcDate(initial.to));
  const [applied, setApplied] = useState(initial);
  const [reportType, setReportType] = useState('orders');
  const [overview, setOverview] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [overviewResponse, reportResponse] = await Promise.all([
        api.get('/admin/reports/overview', { params: applied }),
        api.get(`/admin/reports/${reportType}`, { params: { ...applied, page: 1, pageSize: 100 } }),
      ]);
      setOverview(overviewResponse.data.data); setReport(reportResponse.data.data);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Reports could not be loaded.'); }
    finally { setLoading(false); }
  }, [applied, reportType]);
  useEffect(() => { load(); }, [load]);

  function choosePreset(value) {
    setPreset(value);
    if (value === 'custom') return;
    const next = dateRange(value); setApplied(next); setFromInput(utcDate(next.from)); setToInput(utcDate(new Date(new Date(next.to).getTime() - 1)));
  }
  function applyCustom() {
    if (!fromInput || !toInput || fromInput > toInput) { setError('Choose a valid custom date range.'); return; }
    setError(''); setApplied({ from: new Date(`${fromInput}T00:00:00.000Z`).toISOString(), to: new Date(new Date(`${toInput}T00:00:00.000Z`).getTime() + 86400000).toISOString() });
  }
  async function exportReport() {
    setExporting(true); setError('');
    try {
      const response = await api.get(`/admin/reports/${reportType}/export.csv`, { params: applied, responseType: 'blob' });
      const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = `foodiehub-${reportType}-report.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (requestError) { setError(requestError.response?.data?.message || 'CSV export failed.'); }
    finally { setExporting(false); }
  }

  const metrics = overview?.metrics || {};
  const headers = report?.items?.length ? Object.keys(report.items[0]) : [];

  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-widest text-orange-600">Business & revenue</p><h1 className="mt-2 text-3xl font-extrabold text-slate-900">Reports & analytics</h1><p className="mt-2 text-sm text-slate-500">Platform activity and financial measures from recorded orders, payments, subscriptions, and commission ledger entries.</p></div><button onClick={load} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold"><RefreshCw size={15}/>Refresh</button></header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><label className="text-xs font-semibold text-slate-500">Date preset<select value={preset} onChange={(event) => choosePreset(event.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last7">Last 7 days</option><option value="last30">Last 30 days</option><option value="thisMonth">This month</option><option value="previousMonth">Previous month</option><option value="custom">Custom</option></select></label><label className="text-xs font-semibold text-slate-500">From<input type="date" value={fromInput} onChange={(event) => { setFromInput(event.target.value); setPreset('custom'); }} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal"/></label><label className="text-xs font-semibold text-slate-500">To<input type="date" value={toInput} onChange={(event) => { setToInput(event.target.value); setPreset('custom'); }} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal"/></label>{preset === 'custom' && <button onClick={applyCustom} className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white">Apply dates</button>}<span className="ml-auto text-xs text-slate-400">Times and date boundaries use UTC.</span></section>

    {loading && !overview ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200"/>)}</div> : overview && <>
      {overview.chartsTruncated && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">A chart input reached the 20,000-row processing limit. Summary totals remain database aggregates; narrow the date range to inspect chart detail.</p>}
      <section><h2 className="mb-3 text-lg font-bold text-slate-900">Platform totals</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Restaurants" value={number(metrics.totalRestaurants)} note={`${number(metrics.activeRestaurants)} currently active`}/><Metric label="Branches" value={number(metrics.totalBranches)} note="Current platform total" tone="blue"/><Metric label="Customers" value={number(metrics.totalCustomers)} note="Customer accounts" tone="violet"/><Metric label="Orders" value={number(metrics.totalOrders)} note="Orders created in selected period"/></div></section>
      <section><h2 className="mb-3 text-lg font-bold text-slate-900">Financial and order measures</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Completed orders" value={number(metrics.completedOrders)} note="Selected period" tone="green"/><Metric label="Cancelled / rejected" value={number(metrics.cancelledOrders)} note="Selected period"/><Metric label="Gross order value" value={money(metrics.grossOrderValue)} note="Valid non-refunded orders; not platform revenue" tone="orange"/><Metric label="Platform commission" value={money(metrics.platformCommission)} note="Commission ledger net of recorded adjustments" tone="violet"/><Metric label="Subscription revenue" value={money(metrics.subscriptionRevenue)} note="Verified paid subscription payments" tone="blue"/><Metric label="Refund amount" value={metrics.refundAmount == null ? 'Unavailable' : money(metrics.refundAmount)} note={`${number(metrics.refundedOrders)} order and ${number(metrics.refundedSubscriptionPayments)} subscription refund records; amounts are not stored`}/><Metric label="Active subscriptions" value={number(metrics.activeSubscriptions)} note="Current effective subscriptions" tone="green"/></div></section>
      <section><h2 className="mb-3 text-lg font-bold text-slate-900">Trends</h2><div className="grid gap-4 xl:grid-cols-2"><Bars title="Orders over time" rows={overview.ordersOverTime || []} label={(row) => row.date.slice(5)} value={(row) => row.orders}/><Bars title="Gross order value by day" rows={overview.ordersOverTime || []} label={(row) => row.date.slice(5)} value={(row) => row.grossOrderValue} format={money} color="bg-blue-400"/><Bars title="Platform commission trend" rows={overview.ordersOverTime || []} label={(row) => row.date.slice(5)} value={(row) => row.platformCommission} format={money} color="bg-violet-400"/><Bars title="Subscription revenue trend" rows={overview.ordersOverTime || []} label={(row) => row.date.slice(5)} value={(row) => row.subscriptionRevenue} format={money} color="bg-emerald-400"/><Bars title="Restaurant growth" rows={overview.restaurantGrowth || []} label={(row) => row.date.slice(5)} value={(row) => row.count}/><Bars title="Customer growth" rows={overview.customerGrowth || []} label={(row) => row.date.slice(5)} value={(row) => row.count}/></div></section>
      <section className="grid gap-4 xl:grid-cols-2"><article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-bold text-slate-900">Order status distribution</h3><div className="mt-4 space-y-3">{(overview.orderStatusDistribution || []).filter((row) => row.count).map((row) => { const max = Math.max(1, ...overview.orderStatusDistribution.map((entry) => entry.count)); return <div key={row.status}><div className="flex justify-between text-sm"><span className="capitalize text-slate-600">{row.status}</span><strong>{number(row.count)}</strong></div><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-400" style={{ width: `${row.count / max * 100}%` }}/></div></div>; })}</div></article><Ranking title="Popular food categories" rows={overview.popularCategories || []} primary="categoryName" metric="unitsSold"/><Ranking title="Top-performing restaurants" rows={overview.topRestaurants || []} primary="restaurantName" metric="grossOrderValue" format={money}/><article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-bold text-slate-900">Subscription distribution</h3><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Plan</th><th className="py-2">Status</th><th className="py-2 text-right">Subscriptions</th></tr></thead><tbody>{(overview.subscriptionDistribution || []).map((row) => <tr key={`${row.planId}-${row.status}`} className="border-t"><td className="py-2 font-semibold">{row.plan}</td><td className="py-2 capitalize">{row.status}</td><td className="py-2 text-right">{number(row.subscriptions)}</td></tr>)}</tbody></table>{!overview.subscriptionDistribution?.length && <p className="py-6 text-center text-sm text-slate-400">No subscriptions in this period.</p>}</div></article></section>
    </>}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h2 className="font-bold text-slate-900">Data reports</h2><p className="mt-1 text-xs text-slate-500">The selected date range is applied to the report and its export.</p></div><div className="flex gap-2"><select value={reportType} onChange={(event) => setReportType(event.target.value)} className="h-10 rounded-lg border px-3 text-sm">{reports.map((value) => <option key={value} value={value}>{reportName(value)}</option>)}</select><button onClick={exportReport} disabled={exporting || !report} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-50"><Download size={15}/>{exporting ? 'Preparing…' : 'Export CSV'}</button></div></header><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{headers.map((key) => <th key={key} className="px-4 py-3">{reportName(key)}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{report?.items?.map((row, index) => <tr key={row.id || row.orderNumber || row.transactionReference || index}>{headers.map((key) => <td key={key} className="max-w-64 truncate px-4 py-3 text-slate-700">{row[key] == null ? '—' : typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key])}</td>)}</tr>)}{!loading && !report?.items?.length && <tr><td colSpan={Math.max(1, headers.length)} className="p-10 text-center text-slate-500"><BarChart3 className="mx-auto mb-2 text-slate-300"/>No {reportName(reportType).toLowerCase()} records in this period.</td></tr>}</tbody></table></div><footer className="flex justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>{report?.pagination?.total || 0} records · first 100 shown</span>{report?.truncated && <span>Export limit reached; narrow the date range.</span>}</footer></section>
  </main>;
}
