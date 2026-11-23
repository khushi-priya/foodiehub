import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, CreditCard, LoaderCircle, Minus, Plus, Printer, Search, ShoppingBasket, Trash2 } from 'lucide-react';
import { api } from '../../../services/api';

const dataOf = (response) => response?.data?.data;
const money = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const idempotencyKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const errorMessage = (error) => error.response?.data?.message || error.message || 'The request could not be completed.';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100';

export default function RestaurantPOS() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [menu, setMenu] = useState([]);
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState('takeaway');
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [cashAmount, setCashAmount] = useState('');
  const [optionItem, setOptionItem] = useState(null);
  const [optionVariant, setOptionVariant] = useState('');
  const [optionAddons, setOptionAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshOrders = useCallback(async (selectedBranch) => {
    if (!selectedBranch) { setOrders([]); return; }
    const response = await api.get('/restaurant/pos/orders', { params: { branchId: selectedBranch } });
    setOrders(Array.isArray(dataOf(response)) ? dataOf(response) : []);
  }, []);

  useEffect(() => {
    let active = true;
    api.get('/restaurant/pos/branches').then((response) => {
      if (!active) return;
      const rows = Array.isArray(dataOf(response)) ? dataOf(response) : [];
      setBranches(rows);
      setBranchId(rows[0]?.id || '');
      if (!rows.length) setLoading(false);
    }).catch((loadError) => { if (active) { setError(errorMessage(loadError)); setLoading(false); } });
    return () => { active = false; };
  }, []);

  const loadBranch = useCallback(async (selectedBranch) => {
    if (!selectedBranch) return;
    setLoading(true); setError('');
    try {
      const [menuResponse, tableResponse, orderResponse] = await Promise.all([
        api.get('/restaurant/pos/menu', { params: { branchId: selectedBranch } }),
        api.get('/restaurant/pos/tables', { params: { branchId: selectedBranch } }),
        api.get('/restaurant/pos/orders', { params: { branchId: selectedBranch } }),
      ]);
      setMenu(dataOf(menuResponse)?.items || []);
      setTables(Array.isArray(dataOf(tableResponse)) ? dataOf(tableResponse) : []);
      setOrders(Array.isArray(dataOf(orderResponse)) ? dataOf(orderResponse) : []);
      setCart([]); setSelectedOrder(null);
    } catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (branchId) loadBranch(branchId); }, [branchId, loadBranch]);

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [cart]);
  const filteredMenu = useMemo(() => menu.filter((item) => `${item.name} ${item.category || ''}`.toLowerCase().includes(search.toLowerCase())), [menu, search]);

  const addConfiguredItem = (item, variantId = '', addonIds = []) => {
    const variant = item.options.find((option) => option.id === variantId);
    const addons = item.options.filter((option) => addonIds.includes(option.id));
    // Match customer checkout pricing: a chosen variant is the replacement base price; add-ons are added on top.
    const unitPrice = Number(variant?.price ?? item.price) + addons.reduce((sum, option) => sum + Number(option.price), 0);
    const cartLine = { key: idempotencyKey(), menuItemId: item.id, name: item.name, variantOptionId: variant?.id || null, variantName: variant?.name || '', addonOptionIds: addons.map((option) => option.id), addons: addons.map((option) => ({ id: option.id, name: option.name, price: option.price })), quantity: 1, unitPrice };
    setCart((current) => [...current, cartLine]);
    setOptionItem(null); setOptionVariant(''); setOptionAddons([]);
  };

  const selectMenuItem = (item) => {
    const variants = item.options.filter((option) => option.type === 'variant');
    const addons = item.options.filter((option) => option.type === 'addon');
    if (!variants.length && !addons.length) { addConfiguredItem(item); return; }
    setOptionItem(item); setOptionVariant(variants.length === 1 ? variants[0].id : ''); setOptionAddons([]);
  };

  const changeQuantity = (key, delta) => setCart((current) => current.map((line) => line.key === key ? { ...line, quantity: Math.max(1, Math.min(99, line.quantity + delta)) } : line));
  const removeLine = (key) => setCart((current) => current.filter((line) => line.key !== key));

  const createOrder = async (event) => {
    event.preventDefault();
    if (!cart.length) { setError('Add at least one menu item.'); return; }
    if (orderType === 'dine_in' && !tableId) { setError('Choose a table for dine-in.'); return; }
    setWorking(true); setError(''); setNotice('');
    try {
      const response = await api.post('/restaurant/pos/orders', { branchId, orderType, tableId: orderType === 'dine_in' ? tableId : null, customerName, customerPhone: customerPhone || null, items: cart.map((line) => ({ menuItemId: line.menuItemId, variantOptionId: line.variantOptionId, addonOptionIds: line.addonOptionIds, quantity: line.quantity })), idempotencyKey: idempotencyKey() });
      const order = dataOf(response);
      setSelectedOrder(order); setCashAmount(order.balanceDue.toFixed(2)); setCart([]);
      setNotice(`Order ${order.orderNumber} created. Record payment to print the receipt.`);
      await refreshOrders(branchId);
    } catch (saveError) { setError(errorMessage(saveError)); }
    finally { setWorking(false); }
  };

  const loadOrder = async (orderId) => {
    try { const response = await api.get(`/restaurant/pos/orders/${orderId}`); const order = dataOf(response); setSelectedOrder(order); setCashAmount(order.balanceDue.toFixed(2)); }
    catch (loadError) { setError(errorMessage(loadError)); }
  };

  const takeCash = async () => {
    if (!selectedOrder) return;
    setWorking(true); setError(''); setNotice('');
    try {
      const response = await api.post(`/restaurant/pos/orders/${selectedOrder.id}/tenders/cash`, { amount: Number(cashAmount), idempotencyKey: idempotencyKey() });
      const order = dataOf(response); setSelectedOrder(order); setCashAmount(order.balanceDue.toFixed(2)); setNotice('Cash payment recorded.'); await refreshOrders(branchId);
    } catch (paymentError) { setError(errorMessage(paymentError)); }
    finally { setWorking(false); }
  };

  const takeOnlinePayment = async () => {
    if (!selectedOrder) return;
    setWorking(true); setError(''); setNotice('');
    try {
      const response = await api.post(`/restaurant/pos/orders/${selectedOrder.id}/tenders/razorpay/order`, { amount: Number(cashAmount), idempotencyKey: idempotencyKey() });
      const details = dataOf(response);
      await loadRazorpay();
      const checkout = new window.Razorpay({ key: details.keyId, amount: details.amount, currency: details.currency, name: 'FoodieHub', description: `POS order ${details.orderNumber}`, order_id: details.razorpayOrderId, handler: async (payment) => {
        try {
          const verified = await api.post(`/restaurant/pos/tenders/${details.tenderId}/razorpay/verify`, payment);
          const order = dataOf(verified); setSelectedOrder(order); setCashAmount(order.balanceDue.toFixed(2)); setNotice('Online payment verified and captured.'); await refreshOrders(branchId);
        } catch (verifyError) { setError(errorMessage(verifyError)); }
      }, modal: { ondismiss: async () => {
        try {
          const reconciled = await api.post(`/restaurant/pos/tenders/${details.tenderId}/razorpay/reconcile`, { razorpayOrderId: details.razorpayOrderId });
          const order = dataOf(reconciled); setSelectedOrder(order); setCashAmount(order.balanceDue.toFixed(2));
          setNotice(order.paymentStatus === 'paid' ? 'Online payment confirmed.' : 'No captured payment found. You can retry or take another tender.');
          await refreshOrders(branchId);
        } catch (reconcileError) { setError(errorMessage(reconcileError)); }
      } } });
      checkout.open();
    } catch (paymentError) { setError(errorMessage(paymentError)); }
    finally { setWorking(false); }
  };

  if (loading && !branches.length) return <div className="flex min-h-72 items-center justify-center text-slate-500"><LoaderCircle className="mr-2 animate-spin"/>Loading cashier workspace…</div>;

  return <main className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
    <style>{'@media print { body * { visibility: hidden !important; } #pos-receipt, #pos-receipt * { visibility: visible !important; } #pos-receipt { position: absolute; inset: 0; width: 100%; padding: 20px; color: black; } .pos-no-print { display: none !important; } }'}</style>
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">Cashier workspace</p><h1 className="mt-1 text-3xl font-extrabold text-slate-900">Point of sale</h1><p className="mt-1 text-sm text-slate-500">Create dine-in or takeaway orders, collect split payments and print receipts.</p></div><label className="min-w-56 text-xs font-semibold text-slate-500">Branch<select className={`${inputClass} mt-1`} value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></header>
    {error && <div role="alert" className="mb-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle size={17} className="shrink-0"/>{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {!branches.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">No active branch is assigned to this cashier account.</div> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,.9fr)]">
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Menu</h2><p className="text-xs text-slate-500">Prices and options are revalidated by the server when the order is placed.</p></div><label className="relative w-full sm:w-64"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu" className={`${inputClass} pl-9`}/></label></div>
        {loading ? <div className="flex min-h-52 items-center justify-center text-slate-500"><LoaderCircle className="mr-2 animate-spin"/>Loading menu…</div> : filteredMenu.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{filteredMenu.map((item) => <button key={item.id} type="button" onClick={() => selectMenuItem(item)} className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-orange-300 hover:bg-orange-50/40"><div className="flex items-start justify-between gap-2"><span className="font-semibold text-slate-900">{item.name}</span><Plus size={17} className="shrink-0 text-orange-600"/></div><p className="mt-1 text-xs text-slate-500">{item.category || 'Menu item'}{item.foodType ? ` · ${item.foodType.replace('_',' ')}` : ''}</p><p className="mt-3 font-bold text-slate-900">{money(item.price)}</p>{item.options.length > 0 && <p className="mt-1 text-[11px] text-orange-700">Options available</p>}</button>)}</div> : <div className="p-10 text-center text-sm text-slate-500">No available menu items match.</div>}
      </section>
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center gap-2"><ShoppingBasket size={18} className="text-orange-600"/><h2 className="font-bold text-slate-900">Current order</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-500">Order type<select className={`${inputClass} mt-1`} value={orderType} onChange={(event) => { setOrderType(event.target.value); setTableId(''); }}><option value="takeaway">Takeaway</option><option value="dine_in">Dine-in</option></select></label>{orderType === 'dine_in' && <label className="text-xs font-semibold text-slate-500">Table<select required className={`${inputClass} mt-1`} value={tableId} onChange={(event) => setTableId(event.target.value)}><option value="">Select available table</option>{tables.filter((table) => ['available','occupied'].includes(table.occupancyStatus)).map((table) => <option key={table.id} value={table.id}>{table.tableNumber} · {table.occupancyStatus}</option>)}</select></label>}<label className="text-xs font-semibold text-slate-500">Customer name<input className={`${inputClass} mt-1`} value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={150}/></label><label className="text-xs font-semibold text-slate-500">Phone (optional)<input className={`${inputClass} mt-1`} value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} maxLength={20} inputMode="tel"/></label></div>
          <div className="mt-4 divide-y divide-slate-100">{cart.map((line) => <div key={line.key} className="flex items-center gap-2 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{line.name}{line.variantName ? ` · ${line.variantName}` : ''}</p>{line.addons.length > 0 && <p className="truncate text-xs text-slate-500">{line.addons.map((addon) => addon.name).join(', ')}</p>}<p className="text-xs text-slate-500">{money(line.unitPrice)} each</p></div><div className="flex items-center gap-1"><button type="button" onClick={() => changeQuantity(line.key, -1)} aria-label={`Decrease ${line.name}`} className="rounded-lg border p-1.5"><Minus size={14}/></button><span className="w-6 text-center text-sm">{line.quantity}</span><button type="button" onClick={() => changeQuantity(line.key, 1)} aria-label={`Increase ${line.name}`} className="rounded-lg border p-1.5"><Plus size={14}/></button></div><p className="w-20 text-right text-sm font-semibold">{money(line.unitPrice * line.quantity)}</p><button type="button" onClick={() => removeLine(line.key)} aria-label={`Remove ${line.name}`} className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600"><Trash2 size={15}/></button></div>)}</div>
          <div className="mt-3 flex justify-between border-t border-slate-200 pt-4 text-base font-bold"><span>Total</span><span>{money(subtotal)}</span></div><button type="button" disabled={working || !cart.length || !branchId} onClick={createOrder} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">{working && <LoaderCircle size={16} className="animate-spin"/>}Place order</button>
        </section>
        {selectedOrder && <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Payment & receipt</p><h2 className="mt-1 font-bold text-slate-900">{selectedOrder.orderNumber}</h2><p className="text-xs text-slate-600">{selectedOrder.paymentStatus === 'paid' ? 'Paid in full' : `Balance due ${money(selectedOrder.balanceDue)}`}</p></div><button type="button" onClick={() => window.print()} disabled={selectedOrder.paymentStatus !== 'paid'} className="pos-no-print inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold disabled:opacity-40"><Printer size={16}/>Print receipt</button></div>
          {selectedOrder.paymentStatus !== 'paid' && <><label className="pos-no-print mt-4 block text-xs font-semibold text-slate-600">Tender amount<input className={`${inputClass} mt-1`} type="number" min="0.01" max={selectedOrder.balanceDue} step="0.01" value={cashAmount} onChange={(event) => setCashAmount(event.target.value)}/></label><div className="pos-no-print mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={working || !cashAmount} onClick={takeCash} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-50">{working ? <LoaderCircle size={15} className="animate-spin"/> : <Check size={15}/>}Cash tender</button><button type="button" disabled={working || !cashAmount} onClick={takeOnlinePayment} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 disabled:opacity-50"><CreditCard size={15}/>Online</button></div><p className="pos-no-print mt-2 text-xs text-slate-500">Multiple cash/online tenders are supported. Online payments require Razorpay credentials and captured test-mode payments for verification.</p></>}
          <div id="pos-receipt" className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm"><h3 className="text-center text-lg font-extrabold">FoodieHub</h3><p className="text-center text-xs text-slate-500">Payment receipt</p><div className="my-3 border-t border-dashed"/><p>Order: {selectedOrder.orderNumber}</p><p>Customer: {selectedOrder.customerName}</p><p>Type: {selectedOrder.orderType.replace('_',' ')}</p><div className="my-3 border-t border-dashed"/>{selectedOrder.items.map((line) => <div key={line.id} className="flex justify-between gap-2 py-1"><span>{line.quantity} × {line.name}{line.variantName ? ` (${line.variantName})` : ''}</span><span>{money(line.lineTotal)}</span></div>)}<div className="my-3 border-t border-dashed"/><div className="flex justify-between font-bold"><span>Total</span><span>{money(selectedOrder.total)}</span></div><p className="mt-1 text-xs">Paid {money(selectedOrder.paidAmount)} · Due {money(selectedOrder.balanceDue)}</p><div className="mt-3 border-t border-dashed pt-2">{selectedOrder.tenders.map((tender) => <p key={tender.id} className="flex justify-between text-xs"><span>{tender.method} · {tender.status}</span><span>{money(tender.amount)}</span></p>)}</div><p className="mt-3 text-center text-xs">{selectedOrder.paymentStatus === 'paid' ? 'Thank you. Payment complete.' : 'Receipt becomes printable after full payment.'}</p></div>
        </section>}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Recent POS orders</h2><button type="button" onClick={() => refreshOrders(branchId).catch((loadError) => setError(errorMessage(loadError)))} className="text-xs font-semibold text-orange-700">Refresh</button></div><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{orders.map((order) => <button key={order.id} type="button" onClick={() => loadOrder(order.id)} className={`w-full rounded-xl border p-3 text-left ${selectedOrder?.id === order.id ? 'border-orange-300 bg-orange-50' : 'border-slate-100 hover:bg-slate-50'}`}><span className="flex justify-between gap-2 text-sm font-semibold"><span>{order.orderNumber}</span><span>{money(order.total)}</span></span><span className="mt-1 flex justify-between gap-2 text-xs text-slate-500"><span>{order.customerName} · {order.orderType.replace('_',' ')}</span><span>{order.paymentStatus}</span></span></button>)}{!orders.length && <p className="py-5 text-center text-sm text-slate-500">No POS orders yet.</p>}</div></section>
      </div>
    </div>}
    {optionItem && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"><section role="dialog" aria-modal="true" aria-labelledby="pos-options-title" className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"><div className="flex items-start justify-between"><div><h2 id="pos-options-title" className="text-lg font-bold">{optionItem.name}</h2><p className="text-sm text-slate-500">Choose variants and add-ons</p></div><button type="button" onClick={() => setOptionItem(null)} className="rounded-lg px-2 py-1 text-slate-500">Close</button></div>{optionItem.options.filter((option) => option.type === 'variant').length > 0 && <fieldset className="mt-4"><legend className="text-sm font-bold">Variant</legend>{optionItem.options.filter((option) => option.type === 'variant').map((option) => <label key={option.id} className="mt-2 flex items-center justify-between rounded-lg border p-3 text-sm"><span><input type="radio" name="pos-variant" value={option.id} checked={optionVariant === option.id} onChange={() => setOptionVariant(option.id)} className="mr-2 accent-orange-600"/>{option.name}</span><span>+{money(option.price)}</span></label>)}</fieldset>}{optionItem.options.filter((option) => option.type === 'addon').length > 0 && <fieldset className="mt-4"><legend className="text-sm font-bold">Add-ons</legend>{optionItem.options.filter((option) => option.type === 'addon').map((option) => <label key={option.id} className="mt-2 flex items-center justify-between rounded-lg border p-3 text-sm"><span><input type="checkbox" checked={optionAddons.includes(option.id)} onChange={(event) => setOptionAddons((current) => event.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id))} className="mr-2 accent-orange-600"/>{option.name}</span><span>+{money(option.price)}</span></label>)}</fieldset>}<button type="button" disabled={optionItem.options.some((option) => option.type === 'variant') && !optionVariant} onClick={() => addConfiguredItem(optionItem, optionVariant, optionAddons)} className="mt-5 min-h-11 w-full rounded-xl bg-orange-600 font-bold text-white disabled:opacity-50">Add to order</button></section></div>}
  </main>;
}

async function loadRazorpay() {
  if (window.Razorpay) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true;
    script.onload = resolve; script.onerror = () => reject(new Error('Could not load Razorpay Checkout. Check network access and retry.'));
    document.body.appendChild(script);
  });
}
