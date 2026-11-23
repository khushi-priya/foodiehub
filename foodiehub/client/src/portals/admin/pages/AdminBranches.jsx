import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight, GitBranch, LoaderCircle, RefreshCw, Search, ShieldCheck, Store } from 'lucide-react';
import { api } from '../../../services/api';

const approvalClass = { pending: 'bg-amber-50 text-amber-800 ring-amber-200', approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200', rejected: 'bg-rose-50 text-rose-800 ring-rose-200', suspended: 'bg-slate-100 text-slate-700 ring-slate-200' };
const operationalClass = { open: 'text-emerald-700', closed: 'text-slate-600', temporarily_closed: 'text-amber-700', inactive: 'text-rose-700' };
const availabilityClass = { open: 'bg-emerald-50 text-emerald-700 ring-emerald-200', closed: 'bg-slate-100 text-slate-600 ring-slate-200' };

export default function AdminBranches() {
  const [branches, setBranches] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('all');
  const [operationalStatus, setOperationalStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/admin/branches', { params: { page, limit: 20, search: search.trim() || undefined, approvalStatus, operationalStatus } });
      setBranches(response.data.data.branches || []);
      setPagination(response.data.data.pagination);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Branches could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [page, search, approvalStatus, operationalStatus]);

  useEffect(() => { load(); }, [load]);

  async function changeApproval(branch, nextStatus) {
    let reason;
    if (nextStatus === 'rejected') {
      reason = window.prompt(`Reason for rejecting ${branch.name}:`);
      if (reason === null) return;
      if (!reason.trim()) { setError('A rejection reason is required.'); return; }
    }
    if (nextStatus === 'suspended' && !window.confirm(`Suspend ${branch.name}? It will no longer be available to marketplace customers.`)) return;
    setBusyId(branch.id); setError(''); setNotice('');
    try {
      await api.patch(`/admin/branches/${branch.id}/approval`, { approvalStatus: nextStatus, ...(reason ? { reason } : {}) });
      setNotice(`${branch.name} is now ${nextStatus}.`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Branch status could not be updated.');
    } finally { setBusyId(''); }
  }

  async function changeOperations(branch, value) {
    setBusyId(branch.id); setError(''); setNotice('');
    try {
      await api.patch(`/admin/branches/${branch.id}/operational-status`, { operationalStatus: value });
      setNotice(`${branch.name} operational status updated.`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Operational status could not be updated.');
      await load();
    } finally { setBusyId(''); }
  }

  return <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">Platform management</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Branch management</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Review branch approvals and monitor operational availability across restaurants.</p></div><span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><GitBranch size={16} className="text-orange-500"/>{pagination.total.toLocaleString('en-IN')} branches</span></header>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><span className="inline-flex items-center gap-2"><AlertCircle size={16}/>{error}</span><button type="button" onClick={load} disabled={loading} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold ring-1 ring-rose-200 disabled:opacity-50"><RefreshCw size={14}/>Retry</button></div>}
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <section aria-label="Branch filters" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_200px_220px]"><label className="relative"><span className="sr-only">Search branch or restaurant</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search branch, city, or code" className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"/></label><label><span className="sr-only">Filter approval status</span><select value={approvalStatus} onChange={(event) => { setPage(1); setApprovalStatus(event.target.value); }} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="all">All approval statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option></select></label><label><span className="sr-only">Filter operational status</span><select value={operationalStatus} onChange={(event) => { setPage(1); setOperationalStatus(event.target.value); }} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="all">All operational statuses</option><option value="scheduled">Use schedule</option><option value="temporarily_closed">Temporarily closed</option><option value="inactive">Inactive</option></select></label></section>
    <section className="space-y-3" aria-live="polite">
      {loading ? [1,2,3].map((id) => <div key={id} className="h-36 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200"/>) : branches.length ? branches.map((branch) => <article key={branch.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Store size={19}/></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-bold text-slate-900">{branch.name}</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ring-1 ${approvalClass[branch.approvalStatus] || approvalClass.pending}`}>{branch.approvalStatus}</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 ring-1 ring-blue-200">{!branch.isActive || branch.operationalStatus === 'inactive' ? 'Inactive' : branch.approvalStatus === 'suspended' || branch.operationalStatus === 'temporarily_closed' ? 'Suspended' : 'Active'}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${availabilityClass[branch.availabilityStatus] || availabilityClass.closed}`}>{branch.availabilityStatus === 'open' ? 'Open now' : 'Closed now'}</span></div><p className="mt-1 text-sm text-slate-600">{branch.restaurant?.name} <span className="text-slate-300">·</span> {branch.branchCode}</p><p className="mt-1 text-xs text-slate-500">{[branch.city, branch.state, branch.postalCode].filter(Boolean).join(', ') || 'Address not provided'}{branch.isPrimary ? ' · Primary branch' : ''}</p>{branch.rejectionReason && <p className="mt-2 line-clamp-2 text-xs text-rose-700">Reason: {branch.rejectionReason}</p>}</div></div><div className="flex flex-wrap items-end gap-2 lg:justify-end"><label className="min-w-44"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Operations</span><select aria-label={`Operational status for ${branch.name}`} disabled={busyId === branch.id} value={['open', 'closed'].includes(branch.operationalStatus) ? 'closed' : branch.operationalStatus} onChange={(event) => changeOperations(branch, event.target.value)} className={`h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold ${operationalClass[branch.operationalStatus] || ''}`}><option value="closed">Use schedule</option><option value="temporarily_closed">Temporarily closed</option><option value="inactive">Inactive</option></select></label>{branch.approvalStatus === 'pending' && <><button type="button" disabled={busyId === branch.id} onClick={() => changeApproval(branch, 'approved')} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check size={14}/>Approve</button><button type="button" disabled={busyId === branch.id} onClick={() => changeApproval(branch, 'rejected')} className="min-h-10 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Reject</button></>}{branch.approvalStatus === 'rejected' && <button type="button" disabled={busyId === branch.id} onClick={() => changeApproval(branch, 'approved')} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check size={14}/>Approve</button>}{branch.approvalStatus === 'approved' && <button type="button" disabled={busyId === branch.id} onClick={() => changeApproval(branch, 'suspended')} className="min-h-10 rounded-lg border border-amber-200 px-3 text-xs font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-50">Suspend</button>}{branch.approvalStatus === 'suspended' && <button type="button" disabled={busyId === branch.id} onClick={() => changeApproval(branch, 'approved')} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><ShieldCheck size={14}/>Reactivate</button>}{busyId === branch.id && <LoaderCircle size={16} className="animate-spin text-orange-500"/>}</div></div></article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><GitBranch className="mx-auto text-slate-300"/><h2 className="mt-3 font-bold text-slate-800">No branches match these filters</h2><p className="mt-1 text-sm text-slate-500">Try changing the search or status filters.</p></div>}
    </section>
    <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">Page {pagination.page || 1} of {Math.max(pagination.totalPages || 0, 1)} · {pagination.total || 0} results</p><div className="flex gap-2"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-xs font-semibold disabled:opacity-40"><ChevronLeft size={14}/>Previous</button><button type="button" disabled={loading || page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-xs font-semibold disabled:opacity-40">Next<ChevronRight size={14}/></button></div></footer>
  </main>;
}
