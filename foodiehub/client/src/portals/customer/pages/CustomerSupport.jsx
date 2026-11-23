import { useCallback, useEffect, useState } from 'react';
import { CircleHelp, LoaderCircle, MessageSquareText, Plus, RefreshCw, Send } from 'lucide-react';
import { api } from '../../../services/api';
import { connectCustomerSupportSocket } from '../../../services/socket';

const categories = ['Account & Login', 'Orders', 'Payments & Refunds', 'Technical Issues', 'Other'];
const statusLabel = (status = '') => status.replaceAll('_', ' ');
const when = (date) => date ? new Date(date).toLocaleString() : '';
const errorText = (error) => error.response?.data?.message || 'We could not complete that request. Please try again.';

export default function CustomerSupport() {
  const [tickets, setTickets] = useState([]);
  const [ticket, setTicket] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [description, setDescription] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/customer/support/tickets');
      const rows = response.data.tickets || [];
      setTickets(rows);
      if (selectedId && !rows.some((row) => row.id === selectedId)) setSelectedId('');
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setLoading(false); }
  }, [selectedId]);

  const loadTicket = useCallback(async (id) => {
    if (!id) { setTicket(null); return; }
    setError('');
    try {
      const response = await api.get(`/customer/support/tickets/${encodeURIComponent(id)}`);
      setTicket(response.data.ticket);
    } catch (requestError) { setTicket(null); setError(errorText(requestError)); }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => { loadTicket(selectedId); }, [selectedId, loadTicket]);
  useEffect(() => {
    if (!selectedId) return undefined;
    return connectCustomerSupportSocket((event) => {
      if (event.ticketId !== selectedId) return;
      loadTicket(selectedId);
      loadTickets();
    });
  }, [selectedId, loadTicket, loadTickets]);

  async function createTicket(event) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await api.post('/customer/support/tickets', { subject, category, description });
      setSubject(''); setDescription(''); setCreating(false);
      setSelectedId(response.data.ticket.id);
      setNotice(`Support request ${response.data.ticket.reference} was sent.`);
      await loadTickets();
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setSaving(false); }
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!ticket || !reply.trim()) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await api.post(`/customer/support/tickets/${encodeURIComponent(ticket.id)}/replies`, { body: reply.trim() });
      setReply('');
      setNotice('Your reply was sent.');
      await Promise.all([loadTicket(ticket.id), loadTickets()]);
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setSaving(false); }
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-orange-600">FoodieHub care</p><h1 className="mt-1 text-2xl font-extrabold text-slate-950 sm:text-3xl">Help &amp; Support</h1><p className="mt-1 text-sm text-slate-500">Create a request and follow replies from the support team.</p></div>
        <div className="flex gap-2"><button type="button" onClick={loadTickets} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-60"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>Refresh</button><button type="button" onClick={() => { setCreating((value) => !value); setError(''); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600"><Plus size={16}/>New request</button></div>
      </header>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {creating && <form onSubmit={createTicket} className="space-y-4 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="font-bold text-slate-900">Tell us what happened</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">Topic<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-700">Subject<input required minLength={4} maxLength={180} value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" placeholder="A short summary"/></label>
        </div>
        <label className="block text-sm font-semibold text-slate-700">Details<textarea required minLength={10} maxLength={10000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal" placeholder="Include any details that will help us investigate."/></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button><button disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-60">{saving && <LoaderCircle size={15} className="animate-spin"/>}Send request</button></div>
      </form>}
      <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.5fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Your support requests">
          <div className="border-b border-slate-100 px-4 py-3"><h2 className="font-bold text-slate-900">Your requests</h2></div>
          {loading ? <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle size={17} className="animate-spin"/>Loading requests</div> : tickets.length ? <ul className="divide-y divide-slate-100">{tickets.map((item) => <li key={item.id}><button type="button" onClick={() => setSelectedId(item.id)} className={`w-full px-4 py-3 text-left transition hover:bg-orange-50/70 ${selectedId === item.id ? 'border-l-4 border-orange-500 bg-orange-50' : ''}`}><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold text-slate-900">{item.subject}</span><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold capitalize text-slate-600">{statusLabel(item.status)}</span></span><span className="mt-1 block text-xs text-slate-500">{item.reference} · {item.category}</span><span className="mt-1 block text-[11px] text-slate-400">Updated {when(item.updatedAt)}</span></button></li>)}</ul> : <div className="px-5 py-10 text-center"><CircleHelp size={28} className="mx-auto text-slate-300"/><p className="mt-3 text-sm font-semibold text-slate-800">No requests yet</p><p className="mt-1 text-xs text-slate-500">Use “New request” if you need help.</p></div>}
        </section>
        <section className="min-h-72 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Support request conversation">
          {ticket ? <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4"><div><p className="text-xs font-bold text-orange-600">{ticket.reference} · {ticket.category}</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">{ticket.subject}</h2><p className="mt-1 text-xs capitalize text-slate-500">Status: {statusLabel(ticket.status)}</p></div><MessageSquareText size={20} className="text-orange-500"/></div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700"><p>{ticket.description}</p><p className="mt-2 text-[11px] text-slate-400">Submitted {when(ticket.createdAt)}</p></div>
            <div className="mt-4 space-y-3">{(ticket.messages || []).map((message) => <article key={message.id} className={`rounded-xl p-3 ${message.authorType === 'admin' ? 'bg-orange-50' : 'bg-slate-50'}`}><p className="text-xs font-bold capitalize text-slate-700">{message.authorType === 'admin' ? 'FoodieHub support' : 'You'} <span className="ml-2 font-normal text-slate-400">{when(message.createdAt)}</span></p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{message.body}</p></article>)}</div>
            {ticket.status !== 'closed' && <form onSubmit={sendReply} className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row"><textarea aria-label="Reply to support" rows={2} maxLength={6000} value={reply} onChange={(event) => setReply(event.target.value)} className="min-h-11 flex-1 resize-y rounded-xl border border-slate-200 p-3 text-sm" placeholder="Write a reply…"/><button disabled={saving || !reply.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle size={15} className="animate-spin"/> : <Send size={15}/>}Reply</button></form>}
          </> : <div className="flex min-h-60 flex-col items-center justify-center text-center"><MessageSquareText size={30} className="text-slate-300"/><h2 className="mt-3 font-bold text-slate-800">Choose a support request</h2><p className="mt-1 max-w-sm text-sm text-slate-500">Its status and conversation will appear here.</p></div>}
        </section>
      </div>
    </section>
  );
}
