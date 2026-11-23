import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertCircle, ArrowUpRight, Building2, Clock3, GitBranch, IndianRupee, RefreshCw, ShoppingBag, Store, Users } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../services/api';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value) => Number(value || 0).toLocaleString('en-IN');
const dateTime = (value) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Time unavailable';

function MetricCard({ title, value, note, icon: Icon, tone }) {
  const tones = {
    orange: 'bg-orange-50 text-orange-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium text-slate-500">{title}</p><p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</p></div><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon size={21}/></span></div>
    <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{note}</p>
  </article>;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 29 * 86400000).toISOString();
      const [response, reportResponse] = await Promise.all([
        api.get('/admin/dashboard'),
        api.get('/admin/reports/overview', { params: { from, to: now.toISOString() } }),
      ]);
      setData({ ...response.data.data, reportMetrics: reportResponse.data.data.metrics });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Dashboard metrics could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const metrics = data?.metrics;
  const chart = data?.paidOrderValueByMonth || [];
  const maxRevenue = Math.max(0, ...chart.map((entry) => Number(entry.paidOrderValue || 0)));

  return <div className="space-y-7">
    <section className="relative overflow-hidden rounded-3xl bg-[#171B2D] p-6 text-white shadow-lg sm:p-9">
      <div className="absolute -right-12 -top-24 h-72 w-72 rounded-full border-[35px] border-white/5"/><div className="absolute -bottom-32 right-44 h-64 w-64 rounded-full bg-orange-500/10 blur-2xl"/>
      <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center"><div><p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-orange-300"><span className="h-2 w-2 rounded-full bg-emerald-400"/>Platform administration</p><h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Good day, {user?.firstName || 'Administrator'}!</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Monitor current restaurant, customer, order and payment activity across FoodieHub.</p></div><Link to="/admin/restaurants" className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-orange-500 px-4 text-sm font-bold text-white transition hover:bg-orange-600 md:self-auto">Manage restaurants<ArrowUpRight size={16}/></Link></div>
    </section>

    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span className="inline-flex items-center gap-2"><AlertCircle size={17}/>{error}</span><button type="button" onClick={load} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 font-semibold text-rose-800 ring-1 ring-rose-200 disabled:opacity-50"><RefreshCw size={14}/>Retry</button></div>}

    {loading && !data ? <section aria-label="Loading dashboard" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map((key) => <div key={key} className="h-36 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200"/>)}<div className="h-72 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200 sm:col-span-2 xl:col-span-3"/><div className="h-72 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200"/></section> : data && <>
      <section aria-labelledby="overview-heading"><div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h2 id="overview-heading" className="text-lg font-bold text-slate-900">Platform overview</h2><p className="mt-1 text-sm text-slate-500">Live totals from current platform records.</p></div><p className="text-xs text-slate-400">Updated {dateTime(data.generatedAt)} · {data.timeZone}</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Restaurants" value={number(metrics.totalRestaurants)} note={`${number(metrics.publishedRestaurants)} published · ${number(metrics.pendingRestaurants)} pending review`} icon={Store} tone="orange"/>
          <MetricCard title="Branches" value={number(metrics.totalBranches)} note="Branches on record" icon={GitBranch} tone="blue"/>
          <MetricCard title="Customers" value={number(metrics.totalCustomers)} note="Customer accounts" icon={Users} tone="violet"/>
          <MetricCard title="Orders" value={number(metrics.totalOrders)} note={`${number(metrics.ordersToday)} created today (UTC)`} icon={ShoppingBag} tone="emerald"/>
        </div>
      </section>

      <section aria-labelledby="financial-overview-heading"><div className="mb-4"><h2 id="financial-overview-heading" className="text-lg font-bold text-slate-900">Financial overview · last 30 days</h2><p className="mt-1 text-sm text-slate-500">Order value, platform earnings, subscription revenue, and refunds are kept separate.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard title="Completed orders" value={number(data.reportMetrics.completedOrders)} note={`${number(data.reportMetrics.cancelledOrders)} cancelled or rejected`} icon={ShoppingBag} tone="blue"/><MetricCard title="Gross order value" value={money(data.reportMetrics.grossOrderValue)} note="Valid order value; not platform revenue" icon={IndianRupee} tone="orange"/><MetricCard title="Platform commission" value={money(data.reportMetrics.platformCommission)} note="From commission ledger records" icon={IndianRupee} tone="violet"/><MetricCard title="Subscription revenue" value={money(data.reportMetrics.subscriptionRevenue)} note={`${number(data.reportMetrics.activeSubscriptions)} currently active subscriptions`} icon={IndianRupee} tone="emerald"/><MetricCard title="Refund amount" value={data.reportMetrics.refundAmount == null ? 'Unavailable' : money(data.reportMetrics.refundAmount)} note={`${number(data.reportMetrics.refundedOrders)} refunded orders and ${number(data.reportMetrics.refundedSubscriptionPayments)} subscription payments; refund amounts are not stored`} icon={IndianRupee} tone="blue"/></div><Link to="/admin/reports" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-orange-700">Open date-filtered reports<ArrowUpRight size={14}/></Link></section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">Paid order value</h2><p className="mt-1 text-xs text-slate-500">Captured and verified order payments · last six calendar months</p></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><IndianRupee size={20}/></span></div><p className="mt-5 text-2xl font-bold text-slate-900">{money(metrics.paidOrderValue)}</p><p className="mt-1 text-xs text-slate-500">{number(metrics.paidOrders)} paid orders across the platform</p>
          {maxRevenue > 0 ? <div className="mt-6 grid h-44 grid-cols-6 items-end gap-2 sm:gap-4" role="img" aria-label="Verified paid order value by month">{chart.map((entry) => { const amount = Number(entry.paidOrderValue || 0); const height = amount ? Math.max(8, amount / maxRevenue * 100) : 2; return <div key={entry.month} className="flex h-full min-w-0 flex-col items-center justify-end gap-2"><span className="hidden max-w-full truncate text-[10px] text-slate-500 sm:block">{amount ? money(amount) : '—'}</span><div className="flex w-full flex-1 items-end"><div title={`${entry.label}: ${money(amount)}`} className="w-full rounded-t-lg bg-orange-400 transition-all" style={{ height: `${height}%` }}/></div><span className="text-[10px] font-medium text-slate-500">{entry.label}</span></div>; })}</div> : <div className="mt-6 flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center"><IndianRupee size={22} className="text-slate-300"/><p className="mt-2 text-sm font-semibold text-slate-700">No verified paid orders in this period</p><p className="mt-1 text-xs text-slate-500">This chart will populate when payment records are marked paid after verification.</p></div>}
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-400">This is order payment volume, not platform commission or restaurant settlement revenue. Commission records and payout history are available under Commissions.</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Recent activity</h2><p className="mt-1 text-xs text-slate-500">Latest orders and restaurant registrations</p></div><Activity size={20} className="text-slate-400"/></div>
          {data.recentActivity.length ? <ol className="mt-5 space-y-4">{data.recentActivity.map((item) => <li key={item.id} className="flex gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.type === 'order' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{item.type === 'order' ? <ShoppingBag size={16}/> : <Building2 size={16}/>}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{item.title}</p><p className="truncate text-xs text-slate-500">{item.detail}</p><p className="mt-1 text-[10px] text-slate-400">{dateTime(item.createdAt)}</p></div></li>)}</ol> : <div className="flex min-h-44 flex-col items-center justify-center text-center"><Clock3 size={22} className="text-slate-300"/><p className="mt-2 text-sm font-semibold text-slate-700">No recent activity</p><p className="mt-1 text-xs text-slate-500">Orders and registrations will appear here.</p></div>}
        </article>
      </section>
    </>}
  </div>;
}
