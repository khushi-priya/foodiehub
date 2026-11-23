import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Headphones, LoaderCircle, MessageCircle, Paperclip, Search, Send, ShieldCheck, Ticket, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../services/api';
import SupportAttachmentList from '../../support/SupportAttachmentList';
import { encodeAttachments, formatDate, statusLabel, SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUSES, validateFiles } from '../../support/supportUtils';

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50';
const statusTone = { open: 'bg-blue-50 text-blue-700', in_progress: 'bg-violet-50 text-violet-700', waiting_for_restaurant: 'bg-amber-50 text-amber-800', resolved: 'bg-emerald-50 text-emerald-700', closed: 'bg-slate-100 text-slate-600' };

function Attachments({ files, setFiles }) {
  const [error, setError] = useState('');
  return <div><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600"><Paperclip size={14}/>Attach<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" className="sr-only" onChange={(event) => { const next = [...event.target.files]; const issue = validateFiles(next); setError(issue); if (!issue) setFiles(next); event.target.value = ''; }}/></label>{files.length>0&&<p className="mt-1 text-xs text-slate-500">{files.map((file)=>file.name).join(', ')}</p>}{error&&<p className="mt-1 text-xs text-red-600">{error}</p>}</div>;
}

export default function AdminSupport() {
  const [searchParams] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const [summary, setSummary] = useState({ total: 0, open: 0, inProgress: 0, waiting: 0, resolved: 0, closed: 0 });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replyFiles, setReplyFiles] = useState([]);
  const [replyError, setReplyError] = useState('');

  const load = useCallback(async (nextPage = page) => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/admin/support/tickets', { params: { page: nextPage, pageSize: 15, search: search || undefined, status: status || undefined, category: category || undefined, priority: priorityFilter || undefined } });
      setTickets(data.tickets || []); setSummary(data.summary || {}); setPagination(data.pagination || { page: nextPage, totalPages: 1, total: 0 });
    } catch (requestError) { setError(requestError.response?.data?.message || 'Support tickets could not be loaded.'); }
    finally { setLoading(false); }
  }, [page, search, status, category, priorityFilter]);
  useEffect(() => { load(page); }, [load, page]);
  useEffect(() => { api.get('/admin/support/agents').then(({ data }) => setAgents(data.agents || [])).catch(() => {}); }, []);

  const openTicket = useCallback(async (ticketId) => {
    setSelected({ id: ticketId }); setDetailLoading(true); setReplyError('');
    try { const { data } = await api.get(`/admin/support/tickets/${ticketId}`); setSelected(data.ticket); }
    catch (requestError) { setReplyError(requestError.response?.data?.message || 'Ticket details could not be loaded.'); }
    finally { setDetailLoading(false); }
  }, []);
  useEffect(() => { const ticketId = searchParams.get('ticketId'); if (ticketId) openTicket(ticketId); }, [searchParams, openTicket]);

  const updateTicket = async (updates) => {
    setSaving(true); setReplyError('');
    try { await api.patch(`/admin/support/tickets/${selected.id}`, updates); setNotice('Ticket updated.'); await Promise.all([load(page), openTicket(selected.id)]); }
    catch (requestError) { setReplyError(requestError.response?.data?.message || 'Ticket could not be updated.'); }
    finally { setSaving(false); }
  };

  const sendReply = async (event) => {
    event.preventDefault(); const formElement = event.currentTarget; const body = String(new FormData(formElement).get('body') || '').trim();
    if (!body) return setReplyError('Write a reply before sending.');
    setSaving(true); setReplyError('');
    try { const attachments = await encodeAttachments(replyFiles); await api.post(`/admin/support/tickets/${selected.id}/replies`, { body, attachments }); setReplyFiles([]); formElement.reset(); setNotice('Reply sent.'); await Promise.all([load(page), openTicket(selected.id)]); }
    catch (requestError) { setReplyError(requestError.response?.data?.message || 'Reply could not be sent.'); }
    finally { setSaving(false); }
  };

  const metrics = [['Total', summary.total || 0], ['Open', summary.open || 0], ['In Progress', summary.inProgress || 0], ['Waiting for Restaurant', summary.waiting || 0], ['Resolved', summary.resolved || 0], ['Closed', summary.closed || 0]];

  return <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8"><header className="mb-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-orange-600">Customer and restaurant help desk</p><h1 className="mt-1 text-2xl font-extrabold text-slate-900">Support & Complaints</h1><p className="mt-1 text-sm text-slate-500">Review customer and restaurant requests, reply, and manage ticket status.</p></header>
    {notice&&<div role="status" className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}<button type="button" onClick={()=>setNotice('')} aria-label="Dismiss"><X size={16}/></button></div>}
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{metrics.map(([label,value],index)=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-500">{label}</p>{index===0?<Ticket className="text-orange-500" size={17}/>:<Headphones className="text-slate-400" size={17}/>}</div><p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p></div>)}</section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-4"><label className="relative"><Search size={15} className="absolute left-3 top-3.5 text-slate-400"/><input value={search} onChange={(event)=>{setSearch(event.target.value);setPage(1);}} placeholder="Search ticket ID or subject" className={`${input} pl-9`}/></label><select value={status} onChange={(event)=>{setStatus(event.target.value);setPage(1);}} className={input}><option value="">All statuses</option>{SUPPORT_STATUSES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select value={category} onChange={(event)=>{setCategory(event.target.value);setPage(1);}} className={input}><option value="">All categories</option>{SUPPORT_CATEGORIES.map((value)=><option key={value}>{value}</option>)}</select><select value={priorityFilter} onChange={(event)=>{setPriorityFilter(event.target.value);setPage(1);}} className={input}><option value="">All priorities</option>{SUPPORT_PRIORITIES.map((value)=><option key={value} value={value}>{value}</option>)}</select></div>
      {error&&<div role="alert" className="m-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={16}/>{error}</div>}
      {loading?<div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin text-orange-500"/>Loading ticketsâ€¦</div>:tickets.length?<div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>{['Ticket','Requester','Category','Priority','Status','Updated'].map((label)=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{tickets.map((ticket)=><tr key={ticket.id} className="cursor-pointer hover:bg-orange-50/40" onClick={()=>openTicket(ticket.id)}><td className="px-4 py-3"><p className="font-bold text-slate-900">{ticket.subject}</p><p className="mt-0.5 text-xs text-slate-500">{ticket.reference}</p></td><td className="px-4 py-3"><p className="font-semibold text-slate-800">{ticket.restaurant?.name || ticket.creator?.email}</p><p className="text-xs text-slate-500">{ticket.restaurant?.email || ticket.creator?.email}</p></td><td className="px-4 py-3 text-xs">{ticket.category}</td><td className="px-4 py-3 text-xs font-bold capitalize">{ticket.priority}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone[ticket.status]}`}>{statusLabel(ticket.status)}</span></td><td className="px-4 py-3 text-xs text-slate-500">{formatDate(ticket.updatedAt)}</td></tr>)}</tbody></table></div>:<div className="p-12 text-center"><Headphones size={28} className="mx-auto text-slate-300"/><p className="mt-3 font-bold text-slate-800">No support tickets</p><p className="mt-1 text-sm text-slate-500">Customer and restaurant requests will appear here.</p></div>}
      <div className="flex items-center justify-between border-t border-slate-100 p-4 text-xs text-slate-500"><span>{pagination.total||0} tickets Â· Page {pagination.page||1} of {pagination.totalPages||1}</span><div className="flex gap-2"><button type="button" disabled={page<=1||loading} onClick={()=>setPage((value)=>value-1)} className="rounded-lg border p-2 disabled:opacity-40"><ChevronLeft size={15}/></button><button type="button" disabled={page>=(pagination.totalPages||1)||loading} onClick={()=>setPage((value)=>value+1)} className="rounded-lg border p-2 disabled:opacity-40"><ChevronRight size={15}/></button></div></div>
    </section>

    {selected&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-5"><section className="max-h-[95vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-4 sm:p-6"><div><p className="text-xs font-bold uppercase tracking-wider text-orange-600">{selected.reference||'Support ticket'}</p><h2 className="mt-1 text-xl font-extrabold text-slate-900">{selected.subject||'Loading ticketâ€¦'}</h2><p className="mt-1 text-xs text-slate-500">{selected.restaurant?.name || 'Customer'} · {selected.restaurant?.email || selected.creator?.email}</p></div><button type="button" onClick={()=>setSelected(null)} aria-label="Close ticket details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={19}/></button></header>{detailLoading?<div className="flex min-h-52 items-center justify-center"><LoaderCircle className="animate-spin text-orange-500"/></div>:selected.subject&&<div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-6">{replyError&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 lg:col-span-2">{replyError}</p>}<div><article className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{selected.category} Â· Opened {formatDate(selected.createdAt)} by {selected.creator?.firstName} {selected.creator?.lastName}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.description}</p><SupportAttachmentList api={api} endpoint="/admin/support/attachments" attachments={selected.attachments}/></article><div className="mt-5"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900"><MessageCircle size={16} className="text-orange-500"/>Conversation</h3><div className="space-y-3">{(selected.messages||[]).map((message)=><article key={message.id} className={`rounded-xl border p-4 ${message.authorType==='admin'?'border-orange-100 bg-orange-50/50':'border-slate-200 bg-white'}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-slate-800">{message.authorType==='admin'?'FoodieHub Support':message.authorType==='customer'?'Customer':`${message.author?.firstName||'Restaurant team'} ${message.author?.lastName||''}`}</p><time className="text-[10px] text-slate-400">{formatDate(message.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{message.body}</p><SupportAttachmentList api={api} endpoint="/admin/support/attachments" attachments={message.attachments}/></article>)}</div></div>{selected.status!=='closed'&&<form onSubmit={sendReply} className="mt-5 rounded-xl border border-slate-200 p-4"><label className="block text-xs font-bold text-slate-700">Reply to requester<textarea name="body" required maxLength={6000} rows={4} className={`${input} mt-2 resize-y`} placeholder="Write a support responseâ€¦"/></label><div className="mt-3 flex flex-wrap items-end justify-between gap-3"><Attachments files={replyFiles} setFiles={setReplyFiles}/><button type="submit" disabled={saving} className={button}>{saving?<LoaderCircle className="animate-spin" size={15}/>:<Send size={15}/>}Send reply</button></div></form>}<section className="mt-5 rounded-xl border border-slate-200 p-4"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Ticket history</h3><ul className="mt-3 space-y-2">{(selected.history||[]).map((item)=><li key={item.id} className="flex flex-wrap justify-between gap-2 border-l-2 border-orange-200 pl-3 text-xs"><span className="font-semibold text-slate-700">{item.action.replace('support.ticket.','').replaceAll('_',' ')}</span><span className="text-slate-400">{item.actor?.firstName||'System'} Â· {formatDate(item.createdAt)}</span></li>)}</ul></section></div>
        <aside className="space-y-4"><div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><ShieldCheck size={14}/>Manage ticket</div><label className="mt-4 block text-xs font-semibold text-slate-600">Status<select value={selected.status} onChange={(event)=>updateTicket({status:event.target.value})} disabled={saving} className={`${input} mt-1`}>{SUPPORT_STATUSES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="mt-3 block text-xs font-semibold text-slate-600">Priority<select value={selected.priority} onChange={(event)=>updateTicket({priority:event.target.value})} disabled={saving} className={`${input} mt-1`}>{SUPPORT_PRIORITIES.map((value)=><option key={value} value={value}>{value}</option>)}</select></label><label className="mt-3 block text-xs font-semibold text-slate-600">Assigned support agent<select value={selected.assignedAdminUserId||''} onChange={(event)=>updateTicket({assignedAdminUserId:event.target.value||null})} disabled={saving} className={`${input} mt-1`}><option value="">Unassigned</option>{agents.map((agent)=><option key={agent.id} value={agent.id}>{agent.firstName} {agent.lastName} Â· {agent.email}</option>)}</select></label></div><div className="rounded-xl border border-slate-200 p-4"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Related records</h3><dl className="mt-3 space-y-3 text-xs">{selected.relatedBranch&&<div><dt className="text-slate-400">Branch</dt><dd className="mt-0.5 font-semibold text-slate-700">{selected.relatedBranch.name}</dd></div>}{selected.relatedOrder&&<div><dt className="text-slate-400">Order</dt><dd className="mt-0.5 font-semibold text-slate-700">{selected.relatedOrder.orderNumber} Â· {selected.relatedOrder.status}</dd></div>}<div><dt className="text-slate-400">Last reply</dt><dd className="mt-0.5 font-semibold text-slate-700">{formatDate(selected.lastReplyAt)}</dd></div></dl></div></aside></div>}</section></div>}
  </main>;
}
