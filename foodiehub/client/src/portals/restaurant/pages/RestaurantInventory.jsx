// import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// import {
//   AlertTriangle,
//   Boxes,
//   ClipboardList,
//   LoaderCircle,
//   Plus,
//   RefreshCw,
//   Truck,
//   Utensils,
//   X,
// } from "lucide-react";
// import { Link } from "react-router-dom";
// import { api } from "../../../services/api";

// const tabs = [
//   { id: "stock", label: "Stock & movements", icon: Boxes },
//   { id: "suppliers", label: "Suppliers", icon: Truck },
//   { id: "purchases", label: "Purchase orders", icon: ClipboardList },
//   { id: "recipes", label: "Recipes", icon: Utensils },
// ];
// const inputClass =
//   "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
// const dataOf = (response) => response?.data?.data;
// const errorMessage = (error) =>
//   error.response?.data?.message ||
//   error.message ||
//   "Unable to complete the request.";
// const key = () =>
//   globalThis.crypto?.randomUUID?.() ||
//   `stock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
// const money = (value) =>
//   `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// export default function RestaurantInventory() {
//   const [branches, setBranches] = useState([]);
//   const [branchId, setBranchId] = useState("");
//   const [activeTab, setActiveTab] = useState("stock");
//   const [summary, setSummary] = useState({
//     itemCount: 0,
//     lowStockCount: 0,
//     totalValue: 0,
//   });
//   const [items, setItems] = useState([]);
//   const [movements, setMovements] = useState([]);
//   const [suppliers, setSuppliers] = useState([]);
//   const [orders, setOrders] = useState([]);
//   const [menuItems, setMenuItems] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [saving, setSaving] = useState(false);
//   const [error, setError] = useState("");
//   const [notice, setNotice] = useState("");
//   const [dialog, setDialog] = useState(null);
//   const [showInactive, setShowInactive] = useState(false);
//   const requestSequence = useRef(0);

//   const load = useCallback(async (selectedBranch) => {
//     const sequence = ++requestSequence.current;
//     if (!selectedBranch) {
//       setSummary({ itemCount: 0, lowStockCount: 0, totalValue: 0 });
//       setItems([]);
//       setMovements([]);
//       setSuppliers([]);
//       setOrders([]);
//       setMenuItems([]);
//       setLoading(false);
//       return;
//     }
//     setLoading(true);
//     setError("");
//     setSummary({ itemCount: 0, lowStockCount: 0, totalValue: 0 });
//     setItems([]);
//     setMovements([]);
//     setSuppliers([]);
//     setOrders([]);
//     setMenuItems([]);
//     try {
//       const params = { branchId: selectedBranch };
//       const [
//         summaryResponse,
//         itemsResponse,
//         movementResponse,
//         supplierResponse,
//         orderResponse,
//         menuResponse,
//       ] = await Promise.all([
//         api.get("/restaurant/inventory/summary", { params }),
//         api.get("/restaurant/inventory/items", {
//           params: { ...params, includeInactive: true },
//         }),
//         api.get("/restaurant/inventory/movements", { params }),
//         api.get("/restaurant/inventory/suppliers"),
//         api.get("/restaurant/inventory/purchase-orders", { params }),
//         api.get("/restaurant/inventory/menu-items", { params }),
//       ]);
//       if (sequence !== requestSequence.current) return;
//       setSummary(
//         dataOf(summaryResponse) || {
//           itemCount: 0,
//           lowStockCount: 0,
//           totalValue: 0,
//         },
//       );
//       setItems(
//         Array.isArray(dataOf(itemsResponse)) ? dataOf(itemsResponse) : [],
//       );
//       setMovements(
//         Array.isArray(dataOf(movementResponse)) ? dataOf(movementResponse) : [],
//       );
//       setSuppliers(
//         Array.isArray(dataOf(supplierResponse)) ? dataOf(supplierResponse) : [],
//       );
//       setOrders(
//         Array.isArray(dataOf(orderResponse)) ? dataOf(orderResponse) : [],
//       );
//       setMenuItems(
//         Array.isArray(dataOf(menuResponse)) ? dataOf(menuResponse) : [],
//       );
//     } catch (loadError) {
//       if (sequence === requestSequence.current)
//         setError(errorMessage(loadError));
//     } finally {
//       if (sequence === requestSequence.current) setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     let alive = true;
//     const fetchBranches = async () => {
//       const first = await api.get("/restaurant/branches", {
//         params: { page: 1, limit: 100, status: "all" },
//       });
//       const firstData = dataOf(first);
//       const rows = Array.isArray(firstData?.branches) ? firstData.branches : [];
//       const totalPages = Math.max(
//         1,
//         Number(firstData?.pagination?.totalPages) || 1,
//       );
//       const remaining = await Promise.all(
//         Array.from({ length: totalPages - 1 }, (_, index) =>
//           api.get("/restaurant/branches", {
//             params: { page: index + 2, limit: 100, status: "all" },
//           }),
//         ),
//       );
//       return [
//         ...rows,
//         ...remaining.flatMap((response) => {
//           const pageRows = dataOf(response)?.branches;
//           return Array.isArray(pageRows) ? pageRows : [];
//         }),
//       ];
//     };
//     fetchBranches()
//       .then((rows) => {
//         if (!alive) return;
//         setBranches(rows);
//         setBranchId((current) =>
//           rows.some((branch) => branch.id === current)
//             ? current
//             : rows[0]?.id || "",
//         );
//         if (rows[0]) load(rows[0].id);
//         else setLoading(false);
//       })
//       .catch((loadError) => {
//         if (alive) {
//           setError(errorMessage(loadError));
//           setLoading(false);
//         }
//       });
//     return () => {
//       alive = false;
//       requestSequence.current += 1;
//     };
//   }, [load]);
//   const selectedBranch = useMemo(
//     () => branches.find((branch) => branch.id === branchId),
//     [branches, branchId],
//   );
//   const run = async (callback, success) => {
//     setSaving(true);
//     setError("");
//     setNotice("");
//     try {
//       await callback();
//       setDialog(null);
//       setNotice(success);
//       await load(branchId);
//     } catch (saveError) {
//       setError(errorMessage(saveError));
//     } finally {
//       setSaving(false);
//     }
//   };

//   const saveIngredient = (event) => {
//     event.preventDefault();
//     const form = new FormData(event.currentTarget);
//     const values = {
//       name: form.get("name"),
//       sku: form.get("sku"),
//       unit: form.get("unit"),
//       reorderLevel: form.get("reorderLevel"),
//       unitCost: form.get("unitCost"),
//     };
//     run(
//       () =>
//         dialog.item
//           ? api.put(`/restaurant/inventory/items/${dialog.item.id}`, values)
//           : api.post("/restaurant/inventory/items", {
//               ...values,
//               branchId,
//               openingQuantity: form.get("openingQuantity"),
//             }),
//       dialog.item ? "Ingredient updated." : "Inventory item saved.",
//     );
//   };
//   const adjustStock = (event) => {
//     event.preventDefault();
//     const form = new FormData(event.currentTarget);
//     run(
//       () =>
//         api.post("/restaurant/inventory/movements", {
//           itemId: dialog.item.id,
//           branchId,
//           movementType: form.get("movementType"),
//           quantity: form.get("quantity"),
//           idempotencyKey: key(),
//           note: form.get("note"),
//         }),
//       "Stock movement recorded.",
//     );
//   };
//   const saveSupplier = (event) => {
//     event.preventDefault();
//     const form = new FormData(event.currentTarget);
//     const values = {
//       name: form.get("name"),
//       contactName: form.get("contactName"),
//       phone: form.get("phone").replace(/[^\d+]/g, ""),
//       email: form.get("email"),
//       address: form.get("address"),
//     };
//     run(
//       () =>
//         dialog.supplier
//           ? api.put(
//               `/restaurant/inventory/suppliers/${dialog.supplier.id}`,
//               values,
//             )
//           : api.post("/restaurant/inventory/suppliers", values),
//       dialog.supplier ? "Supplier updated." : "Supplier saved.",
//     );
//   };
//   const createPurchase = (values) =>
//     run(
//       () =>
//         api.post("/restaurant/inventory/purchase-orders", {
//           branchId,
//           ...values,
//         }),
//       "Draft purchase order created.",
//     );
//   const saveRecipe = (values) =>
//     run(
//       () =>
//         api.put(
//           `/restaurant/inventory/recipes/${branchId}/${values.menuItemId}`,
//           {
//             yieldQuantity: values.yieldQuantity,
//             ingredients: values.ingredients,
//           },
//         ),
//       "Recipe saved.",
//     );

//   const modalTitle =
//     dialog?.type === "ingredient"
//       ? dialog.item
//         ? "Edit inventory item"
//         : "Add inventory item"
//       : dialog?.type === "movement"
//         ? `Adjust ${dialog.item.name}`
//         : dialog?.type === "supplier"
//           ? dialog.supplier
//             ? "Edit supplier"
//             : "Add supplier"
//           : dialog?.type === "purchase"
//             ? "Create purchase order"
//             : "Set recipe";

//   return (
//     <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
//       <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
//         <div>
//           <p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">
//             Restaurant operations
//           </p>
//           <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
//             Inventory & purchasing
//           </h1>
//           <p className="mt-2 max-w-2xl text-sm text-slate-500">
//             Track branch stock, record wastage, manage suppliers and receive
//             purchase orders.
//           </p>
//         </div>
//         <div className="flex flex-wrap gap-2">
//           <label className="text-xs font-semibold text-slate-500">
//             Branch
//             <select
//               value={branchId}
//               onChange={(event) => {
//                 setBranchId(event.target.value);
//                 load(event.target.value);
//               }}
//               disabled={!branches.length}
//               className="mt-1 block min-w-52 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 disabled:bg-slate-100"
//               aria-label="Inventory branch"
//             >
//               {branches.map((branch) => (
//                 <option key={branch.id} value={branch.id}>
//                   {branch.name}
//                   {branch.isActive ? "" : " (inactive)"}
//                 </option>
//               ))}
//             </select>
//           </label>
//           <button
//             type="button"
//             onClick={() => load(branchId)}
//             disabled={!branchId || loading}
//             className="mt-auto inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
//           >
//             <RefreshCw size={15} />
//             Refresh
//           </button>
//         </div>
//       </header>
//       {error && (
//         <div
//           role="alert"
//           className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
//         >
//           <AlertTriangle size={17} className="mt-0.5 shrink-0" />
//           {error}
//         </div>
//       )}
//       {notice && (
//         <div
//           role="status"
//           className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
//         >
//           {notice}
//         </div>
//       )}
//       {!branches.length && !loading && !error ? (
//         <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
//           <Boxes className="mx-auto text-slate-300" />
//           <h2 className="mt-3 font-bold text-slate-800">
//             Create a branch to track stock
//           </h2>
//           <p className="mt-1 text-sm text-slate-500">
//             Inventory is stored per branch so each location has an accurate
//             quantity.
//           </p>
//           <Link
//             to="/restaurant/branches"
//             className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700"
//           >
//             Open Branch Management
//           </Link>
//         </section>
//       ) : (
//         <>
//           <section className="mt-6 grid gap-3 sm:grid-cols-3">
//             <Metric label="Active ingredients" value={summary.itemCount} />
//             <Metric
//               label="Low stock alerts"
//               value={summary.lowStockCount}
//               alert={summary.lowStockCount > 0}
//             />
//             <Metric label="Stock value" value={money(summary.totalValue)} />
//           </section>
//           <nav
//             className="mt-6 flex gap-2 overflow-x-auto border-b border-slate-200 pb-2"
//             aria-label="Inventory sections"
//           >
//             {tabs.map(({ id, label, icon: Icon }) => (
//               <button
//                 key={id}
//                 type="button"
//                 onClick={() => setActiveTab(id)}
//                 className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${activeTab === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"}`}
//               >
//                 <Icon size={16} />
//                 {label}
//               </button>
//             ))}
//           </nav>
//           <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
//             <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
//               <div>
//                 <h2 className="font-bold text-slate-900">
//                   {activeTab === "stock"
//                     ? "Ingredient stock"
//                     : activeTab === "suppliers"
//                       ? "Suppliers"
//                       : activeTab === "purchases"
//                         ? "Purchase orders"
//                         : "Menu recipes"}
//                 </h2>
//                 <p className="mt-1 text-xs text-slate-500">
//                   {selectedBranch?.name || "Selected branch"} · restaurant data
//                   is scoped to your access
//                 </p>
//               </div>
//               <div className="flex flex-wrap gap-2">
//                 {activeTab === "stock" && (
//                   <button
//                     onClick={() => setDialog({ type: "ingredient" })}
//                     className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-3 text-sm font-bold text-white hover:bg-orange-700"
//                   >
//                     <Plus size={16} />
//                     Add ingredient
//                   </button>
//                 )}
//                 {activeTab === "suppliers" && (
//                   <button
//                     onClick={() => setDialog({ type: "supplier" })}
//                     className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-3 text-sm font-bold text-white"
//                   >
//                     <Plus size={16} />
//                     Add supplier
//                   </button>
//                 )}
//                 {activeTab === "purchases" && (
//                   <button
//                     onClick={() => setDialog({ type: "purchase" })}
//                     disabled={!suppliers.length || !items.length}
//                     title={
//                       !suppliers.length ? "Add a supplier first" : undefined
//                     }
//                     className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-3 text-sm font-bold text-white disabled:opacity-50"
//                   >
//                     <Plus size={16} />
//                     New purchase
//                   </button>
//                 )}
//                 {activeTab === "recipes" && (
//                   <button
//                     onClick={() => setDialog({ type: "recipe" })}
//                     disabled={!items.length || !menuItems.length}
//                     className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-3 text-sm font-bold text-white disabled:opacity-50"
//                   >
//                     <Plus size={16} />
//                     Set recipe
//                   </button>
//                 )}
//               </div>
//             </div>
//             {loading ? (
//               <div className="flex min-h-56 items-center justify-center text-sm text-slate-500">
//                 <LoaderCircle className="mr-2 animate-spin" size={18} />
//                 Loading branch inventory…
//               </div>
//             ) : activeTab === "stock" ? (
//               <>
//                 <label className="m-4 inline-flex items-center gap-2 text-sm text-slate-600">
//                   <input
//                     type="checkbox"
//                     checked={showInactive}
//                     onChange={(event) => setShowInactive(event.target.checked)}
//                   />
//                   Show inactive ingredients
//                 </label>
//                 <StockTable
//                   items={items.filter((item) => showInactive || item.isActive)}
//                   onEdit={(item) => setDialog({ type: "ingredient", item })}
//                   onToggle={(item) =>
//                     run(
//                       () =>
//                         api.put(`/restaurant/inventory/items/${item.id}`, {
//                           isActive: !item.isActive,
//                         }),
//                       item.isActive
//                         ? "Ingredient deactivated."
//                         : "Ingredient reactivated.",
//                     )
//                   }
//                   onAdjust={(item) => setDialog({ type: "movement", item })}
//                 />
//               </>
//             ) : activeTab === "suppliers" ? (
//               <SuppliersList
//                 suppliers={suppliers}
//                 onEdit={(supplier) => setDialog({ type: "supplier", supplier })}
//                 onToggle={(supplier) =>
//                   run(
//                     () =>
//                       api.put(
//                         `/restaurant/inventory/suppliers/${supplier.id}`,
//                         { isActive: !supplier.isActive },
//                       ),
//                     supplier.isActive
//                       ? "Supplier deactivated."
//                       : "Supplier reactivated.",
//                   )
//                 }
//               />
//             ) : activeTab === "purchases" ? (
//               <PurchaseList
//                 orders={orders}
//                 onUpdate={(order, status) =>
//                   run(
//                     () =>
//                       status === "received"
//                         ? api.post(
//                             `/restaurant/inventory/purchase-orders/${order.id}/receive`,
//                           )
//                         : api.patch(
//                             `/restaurant/inventory/purchase-orders/${order.id}`,
//                             { status, branchId },
//                           ),
//                     status === "received"
//                       ? "Purchase received and stock updated."
//                       : "Purchase order updated.",
//                   )
//                 }
//               />
//             ) : (
//               <RecipeList
//                 menuItems={menuItems}
//                 items={items}
//                 branchId={branchId}
//                 onEdit={(recipe) => setDialog({ type: "recipe", recipe })}
//                 onDeactivate={(menuItemId) =>
//                   run(
//                     () =>
//                       api.delete(
//                         `/restaurant/inventory/recipes/${branchId}/${menuItemId}`,
//                       ),
//                     "Recipe deactivated.",
//                   )
//                 }
//               />
//             )}
//           </section>
//           {activeTab === "stock" && (
//             <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
//               <h2 className="font-bold text-slate-900">
//                 Recent stock movements
//               </h2>
//               <MovementList movements={movements} />
//             </section>
//           )}
//         </>
//       )}
//       {dialog && (
//         <div
//           className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
//           role="presentation"
//           onMouseDown={(event) => {
//             if (event.target === event.currentTarget && !saving)
//               setDialog(null);
//           }}
//         >
//           <section
//             role="dialog"
//             aria-modal="true"
//             aria-labelledby="inventory-dialog-title"
//             className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
//           >
//             <div className="flex items-start justify-between">
//               <h2
//                 id="inventory-dialog-title"
//                 className="text-lg font-bold text-slate-900"
//               >
//                 {modalTitle}
//               </h2>
//               <button
//                 type="button"
//                 onClick={() => setDialog(null)}
//                 disabled={saving}
//                 aria-label="Close dialog"
//                 className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
//               >
//                 <X size={20} />
//               </button>
//             </div>
//             {dialog.type === "ingredient" && (
//               <form
//                 onSubmit={saveIngredient}
//                 className="mt-4 grid gap-3 sm:grid-cols-2"
//               >
//                 <Field
//                   name="name"
//                   label="Ingredient name"
//                   required
//                   defaultValue={dialog.item?.name}
//                 />
//                 <Field
//                   name="sku"
//                   label="SKU"
//                   required
//                   defaultValue={dialog.item?.sku}
//                 />
//                 <Field
//                   name="unit"
//                   label="Unit (kg, L, pcs)"
//                   required
//                   defaultValue={dialog.item?.unit}
//                 />
//                 {!dialog.item && (
//                   <Field
//                     name="openingQuantity"
//                     label="Opening quantity"
//                     type="number"
//                     min="0"
//                     step="0.001"
//                     defaultValue="0"
//                   />
//                 )}
//                 <Field
//                   name="reorderLevel"
//                   label="Low stock threshold"
//                   type="number"
//                   min="0"
//                   step="0.001"
//                   defaultValue={dialog.item?.reorderLevel ?? 0}
//                 />
//                 <Field
//                   name="unitCost"
//                   label="Cost per unit (₹)"
//                   type="number"
//                   min="0"
//                   step="0.0001"
//                   defaultValue={dialog.item?.unitCost ?? 0}
//                 />
//                 <Submit saving={saving} />
//               </form>
//             )}
//             {dialog.type === "movement" && (
//               <form onSubmit={adjustStock} className="mt-4 grid gap-3">
//                 <label className="text-sm font-semibold text-slate-700">
//                   Movement type
//                   <select name="movementType" className={inputClass}>
//                     <option value="adjustment_in">
//                       Stock received (manual)
//                     </option>
//                     <option value="adjustment_out">
//                       Stock correction (out)
//                     </option>
//                     <option value="wastage">Record wastage</option>
//                   </select>
//                 </label>
//                 <Field
//                   name="quantity"
//                   label={`Quantity (${dialog.item.unit})`}
//                   type="number"
//                   min="0.001"
//                   step="0.001"
//                   required
//                 />
//                 <Field name="note" label="Reason / note" />
//                 <Submit saving={saving} />
//               </form>
//             )}
//             {dialog.type === "supplier" && (
//               <form onSubmit={saveSupplier} className="mt-4 grid gap-3">
//                 <Field
//                   name="name"
//                   label="Supplier name"
//                   required
//                   defaultValue={dialog.supplier?.name}
//                 />
//                 <Field
//                   name="contactName"
//                   label="Contact person"
//                   defaultValue={dialog.supplier?.contactName}
//                 />
//                 <Field
//                   name="phone"
//                   label="Mobile number (India)"
//                   type="tel"
//                   inputMode="tel"
//                   autoComplete="tel"
//                   pattern="(?:\+?91[ -]?)?[6-9][0-9]{9}"
//                   title="Enter a valid 10-digit Indian mobile number, optionally with +91."
//                   placeholder="98765 43210"
//                   maxLength={14}
//                   defaultValue={dialog.supplier?.phone}
//                 />
//                 <Field
//                   name="email"
//                   label="Email"
//                   type="email"
//                   defaultValue={dialog.supplier?.email}
//                 />
//                 <Field
//                   name="address"
//                   label="Address"
//                   defaultValue={dialog.supplier?.address}
//                 />
//                 <Submit saving={saving} />
//               </form>
//             )}
//             {dialog.type === "purchase" && (
//               <PurchaseForm
//                 suppliers={suppliers}
//                 items={items}
//                 saving={saving}
//                 onSubmit={createPurchase}
//               />
//             )}
//             {dialog.type === "recipe" && (
//               <RecipeForm
//                 key={`${dialog.recipe?.menuItemId || "new"}-${branchId}`}
//                 menuItems={menuItems}
//                 items={items}
//                 saving={saving}
//                 initial={dialog.recipe}
//                 onSave={saveRecipe}
//               />
//             )}
//           </section>
//         </div>
//       )}
//     </main>
//   );
// }

// function Metric({ label, value, alert }) {
//   return (
//     <div
//       className={`rounded-2xl border bg-white p-4 shadow-sm ${alert ? "border-amber-200" : "border-slate-200"}`}
//     >
//       <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
//         {label}
//       </p>
//       <p
//         className={`mt-2 text-2xl font-extrabold ${alert ? "text-amber-700" : "text-slate-900"}`}
//       >
//         {value}
//       </p>
//     </div>
//   );
// }
// function Field({ label, name, ...props }) {
//   return (
//     <label className="text-sm font-semibold text-slate-700">
//       {label}
//       <input name={name} className={inputClass} {...props} />
//     </label>
//   );
// }
// function Submit({ saving }) {
//   return (
//     <button
//       disabled={saving}
//       className="mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50 sm:col-span-2"
//     >
//       {saving && <LoaderCircle size={16} className="animate-spin" />}
//       {saving ? "Saving…" : "Save"}
//     </button>
//   );
// }
// function StockTable({ items, onAdjust, onEdit, onToggle }) {
//   return items.length ? (
//     <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
//       {items.map((item) => {
//         const low = Number(item.quantityOnHand) <= Number(item.reorderLevel);
//         return (
//           <article key={item.id} className={`rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${!item.isActive ? "border-slate-200 opacity-70" : low ? "border-amber-200" : "border-slate-200"}`}>
//             <div className="flex items-start justify-between gap-3">
//               <div className="flex min-w-0 items-center gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${low ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}><Boxes size={20}/></span><div className="min-w-0"><h3 className="truncate font-bold text-slate-900">{item.name}</h3><p className="text-xs text-slate-500">SKU {item.sku}</p></div></div>
//               <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${!item.isActive ? "bg-slate-100 text-slate-600" : low ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{!item.isActive ? "Inactive" : low ? "Low stock" : "In stock"}</span>
//             </div>
//             <div className="mt-4 grid grid-cols-2 gap-2">
//               <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">On hand</p><p className={`mt-1 text-lg font-extrabold ${low ? "text-amber-700" : "text-slate-900"}`}>{Number(item.quantityOnHand).toLocaleString()} <span className="text-xs font-semibold">{item.unit}</span></p></div>
//               <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reorder level</p><p className="mt-1 text-lg font-bold text-slate-800">{Number(item.reorderLevel).toLocaleString()} <span className="text-xs font-semibold">{item.unit}</span></p></div>
//             </div>
//             <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{item.branch?.name || "Selected branch"}</span><span>{money(item.unitCost)}/{item.unit}</span></div>
//             <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
//               <button onClick={() => onEdit(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Edit</button>
//               {item.isActive && <button onClick={() => onAdjust(item)} className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white hover:bg-orange-700">Adjust stock</button>}
//               <button onClick={() => onToggle(item)} className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">{item.isActive ? "Deactivate" : "Reactivate"}</button>
//             </div>
//           </article>
//         );
//       })}
//     </div>
//   ) : (
//     <Empty message="No ingredients recorded for this branch." />
//   );
// }
// function SuppliersList({ suppliers, onEdit, onToggle }) {
//   return suppliers.length ? (
//     <ul className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
//       {suppliers.map((supplier) => (
//         <li key={supplier.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
//           <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><Truck size={20}/></span><div><p className="font-bold text-slate-900">{supplier.name}</p><p className="text-xs text-slate-500">{supplier.contactName || "Supplier contact"}</p></div></div>
//             <span
//               className={`h-fit rounded-full px-2.5 py-1 text-xs font-bold ${supplier.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
//             >
//               {supplier.isActive ? "Active" : "Inactive"}
//             </span>
//           </div>
//           <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{supplier.phone ? <a className="block font-semibold text-slate-800 hover:text-orange-700" href={`tel:${supplier.phone}`}>{supplier.phone}</a> : <p>No mobile number</p>}{supplier.email && <p className="break-all text-xs">{supplier.email}</p>}{supplier.address && <p className="text-xs leading-5">{supplier.address}</p>}</div>
//           <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3"><button onClick={() => onEdit(supplier)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Edit supplier</button><button onClick={() => onToggle(supplier)} className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">{supplier.isActive ? "Deactivate" : "Reactivate"}</button></div>
//         </li>
//       ))}
//     </ul>
//   ) : (
//     <Empty message="No suppliers yet." />
//   );
// }
// function PurchaseList({ orders, onUpdate }) {
//   return orders.length ? (
//     <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
//       {orders.map((order) => (
//         <article
//           key={order.id}
//           className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
//         >
//           <div>
//             <div className="flex flex-wrap items-center gap-2">
//               <h3 className="font-semibold text-slate-900">
//                 {order.reference}
//               </h3>
//               <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${order.status === "received" ? "bg-emerald-50 text-emerald-700" : order.status === "cancelled" ? "bg-rose-50 text-rose-700" : order.status === "ordered" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800"}`}>
//                 {order.status}
//               </span>
//             </div>
//             <p className="mt-2 text-sm font-semibold text-slate-700">{order.supplier?.name || "Supplier unavailable"}</p>
//             <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-3"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Order total</p><p className="mt-0.5 text-lg font-extrabold text-slate-900">{money(order.totalAmount)}</p></div><p className="text-xs font-semibold text-slate-500">{order.items?.length || 0} line(s)</p></div>
//             <ul className="mt-3 space-y-1 text-xs text-slate-600">
//               {order.items?.map((line) => (
//                 <li key={line.id}>
//                   {line.inventoryItem?.name || "Ingredient"}:{" "}
//                   {Number(line.quantity).toLocaleString()}{" "}
//                   {line.inventoryItem?.unit} × {money(line.unitCost)} ={" "}
//                   {money(line.lineTotal)}
//                 </li>
//               ))}
//             </ul>
//           </div>
//           <div className="mt-4 flex shrink-0 flex-wrap gap-2 border-t border-slate-100 pt-3">
//             {order.status === "draft" && (
//               <>
//                 <button
//                   onClick={() => onUpdate(order, "ordered")}
//                   className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"
//                 >
//                   Mark ordered
//                 </button>
//                 <button
//                   onClick={() => onUpdate(order, "cancelled")}
//                   className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700"
//                 >
//                   Cancel
//                 </button>
//               </>
//             )}
//             {order.status === "ordered" && (
//               <button
//                 onClick={() => onUpdate(order, "received")}
//                 className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
//               >
//                 Receive stock
//               </button>
//             )}
//           </div>
//         </article>
//       ))}
//     </div>
//   ) : (
//     <Empty message="No purchase orders for this branch." />
//   );
// }
// function MovementList({ movements }) {
//   return movements.length ? (
//     <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
//       {movements.slice(0, 12).map((movement) => (
//         <div
//           key={movement.id}
//           className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm"
//         >
//           <div>
//             <p className="font-semibold text-slate-800">
//               {movement.item?.name || "Ingredient"}{" "}
//               <span className="font-normal capitalize text-slate-500">
//                 · {movement.movementType.replaceAll("_", " ")}
//               </span>
//             </p>
//             <p className="text-xs text-slate-500">
//               {movement.note || new Date(movement.createdAt).toLocaleString()}
//             </p>
//           </div>
//           <p
//             className={`font-bold ${Number(movement.quantityChange) < 0 ? "text-rose-700" : "text-emerald-700"}`}
//           >
//             {Number(movement.quantityChange) > 0 ? "+" : ""}
//             {Number(movement.quantityChange).toLocaleString()}{" "}
//             {movement.item?.unit || ""}
//           </p>
//         </div>
//       ))}
//     </div>
//   ) : (
//     <p className="mt-2 text-sm text-slate-500">No stock movements recorded.</p>
//   );
// }
// function RecipeList({ menuItems, items, branchId, onEdit, onDeactivate }) {
//   const [selectedId, setSelectedId] = useState("");
//   const [recipe, setRecipe] = useState(null);
//   const [loading, setLoading] = useState(false);
//   useEffect(() => {
//     setSelectedId(menuItems[0]?.id || "");
//   }, [menuItems]);
//   useEffect(() => {
//     let active = true;
//     if (!selectedId || !branchId) {
//       setRecipe(null);
//       return () => {
//         active = false;
//       };
//     }
//     setLoading(true);
//     api
//       .get(`/restaurant/inventory/recipes/${branchId}/${selectedId}`)
//       .then((response) => {
//         if (active) setRecipe(dataOf(response));
//       })
//       .catch(() => {
//         if (active) setRecipe(null);
//       })
//       .finally(() => {
//         if (active) setLoading(false);
//       });
//     return () => {
//       active = false;
//     };
//   }, [selectedId, branchId]);
//   const estimate = recipe?.costEstimate;
//   return (
//     <div className="p-4">
//       <label className="block max-w-lg text-sm font-semibold text-slate-700">
//         Dish
//         <select
//           value={selectedId}
//           onChange={(event) => setSelectedId(event.target.value)}
//           className={inputClass}
//         >
//           {menuItems.map((item) => (
//             <option key={item.id} value={item.id}>
//               {item.name}
//             </option>
//           ))}
//         </select>
//       </label>
//       {loading ? (
//         <p className="mt-4 text-sm text-slate-500">Loading recipe…</p>
//       ) : recipe ? (
//         <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
//           <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-orange-600">Recipe card</p><p className="mt-1 text-xl font-extrabold text-slate-900">{menuItems.find((item) => item.id === selectedId)?.name}</p></div><span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700">Yield · {recipe.yieldQuantity} portions</span></div>
//           <ul className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
//             {recipe.ingredients?.map((line) => (
//               <li key={line.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
//                 {line.inventoryItem?.name}: {line.quantity}{" "}
//                 {line.inventoryItem?.unit}
//               </li>
//             ))}
//           </ul>
//           {estimate && (
//             <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-3">
//               <Metric
//                 label="Ingredient cost / serving"
//                 value={money(estimate.ingredientCostPerServing)}
//               />
//               <Metric
//                 label="Food cost %"
//                 value={
//                   estimate.foodCostPercentage == null
//                     ? "—"
//                     : `${estimate.foodCostPercentage}%`
//                 }
//               />
//               <Metric
//                 label="Gross margin / serving"
//                 value={money(estimate.grossMarginBeforeOtherCosts)}
//               />
//               <p className="text-xs text-slate-500 sm:col-span-3">
//                 Menu price: {money(estimate.menuPrice)}.{" "}
//                 {estimate.estimateDisclaimer}
//               </p>
//             </div>
//           )}
//           <div className="mt-4 flex flex-wrap gap-2">
//             <button
//               type="button"
//               onClick={() => onEdit(recipe)}
//               className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"
//             >
//               Edit recipe
//             </button>
//             <button
//               type="button"
//               onClick={() => onDeactivate(selectedId)}
//               className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700"
//             >
//               Deactivate recipe
//             </button>
//           </div>
//         </div>
//       ) : (
//         <p className="mt-4 text-sm text-slate-500">
//           No recipe saved for this dish and branch.
//         </p>
//       )}
//       {!menuItems.length && (
//         <Empty message="Create menu items before setting recipes." />
//       )}
//       {!items.length && (
//         <Empty message="Add ingredients before setting recipes." />
//       )}
//     </div>
//   );
// }

// function PurchaseForm({ suppliers, items, saving, onSubmit }) {
//   const [lines, setLines] = useState([
//     { itemId: items[0]?.id || "", quantity: "", unitCost: "" },
//   ]);
//   const submit = (event) => {
//     event.preventDefault();
//     const form = new FormData(event.currentTarget);
//     const rows = [
//       ...event.currentTarget.querySelectorAll("[data-po-line]"),
//     ].map((row) => ({
//       itemId: row.querySelector('[name="itemId"]').value,
//       quantity: row.querySelector('[name="quantity"]').value,
//       unitCost: row.querySelector('[name="unitCost"]').value,
//     }));
//     onSubmit({
//       supplierId: form.get("supplierId"),
//       reference: form.get("reference"),
//       items: rows,
//     });
//   };
//   return (
//     <form onSubmit={submit} className="mt-4 grid gap-3">
//       <label className="text-sm font-semibold text-slate-700">
//         Supplier
//         <select name="supplierId" required className={inputClass}>
//           {suppliers
//             .filter((supplier) => supplier.isActive)
//             .map((supplier) => (
//               <option key={supplier.id} value={supplier.id}>
//                 {supplier.name}
//               </option>
//             ))}
//         </select>
//       </label>
//       <Field
//         name="reference"
//         label="Purchase reference"
//         required
//         defaultValue={`PO-${Date.now().toString().slice(-8)}`}
//       />
//       {lines.map((line, index) => (
//         <div
//           data-po-line
//           key={index}
//           className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-3"
//         >
//           <label className="text-xs font-semibold text-slate-600 sm:col-span-3">
//             Ingredient
//             <select
//               name="itemId"
//               required
//               value={line.itemId || items[0]?.id || ""}
//               onChange={(event) =>
//                 setLines((current) =>
//                   current.map((row, i) =>
//                     i === index ? { ...row, itemId: event.target.value } : row,
//                   ),
//                 )
//               }
//               className={inputClass}
//             >
//               {items
//                 .filter((item) => item.isActive)
//                 .map((item) => (
//                   <option key={item.id} value={item.id}>
//                     {item.name} · {item.unit}
//                   </option>
//                 ))}
//             </select>
//           </label>
//           <Field
//             name="quantity"
//             label="Quantity"
//             type="number"
//             min="0.001"
//             step="0.001"
//             required
//             value={line.quantity}
//             onChange={(event) =>
//               setLines((current) =>
//                 current.map((row, i) =>
//                   i === index ? { ...row, quantity: event.target.value } : row,
//                 ),
//               )
//             }
//           />
//           <Field
//             name="unitCost"
//             label="Unit cost (₹)"
//             type="number"
//             min="0"
//             step="0.0001"
//             required
//             value={line.unitCost}
//             onChange={(event) =>
//               setLines((current) =>
//                 current.map((row, i) =>
//                   i === index ? { ...row, unitCost: event.target.value } : row,
//                 ),
//               )
//             }
//           />
//           <button
//             type="button"
//             disabled={lines.length <= 1}
//             onClick={() =>
//               setLines((current) => current.filter((_, i) => i !== index))
//             }
//             className="mt-auto min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold disabled:opacity-40"
//           >
//             Remove line
//           </button>
//         </div>
//       ))}
//       <button
//         type="button"
//         disabled={lines.length >= 100 || !items.length}
//         onClick={() =>
//           setLines((current) => [
//             ...current,
//             { itemId: items[0]?.id || "", quantity: "", unitCost: "" },
//           ])
//         }
//         className="w-fit rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
//       >
//         Add purchase line
//       </button>
//       <Submit saving={saving} />
//     </form>
//   );
// }
// function Empty({ message }) {
//   return (
//     <div className="p-10 text-center text-sm text-slate-500">{message}</div>
//   );
// }

// function RecipeForm({ menuItems, items, saving, onSave, initial }) {
//   const [lines, setLines] = useState(() =>
//     initial?.ingredients?.length
//       ? initial.ingredients.map((line) => ({
//           itemId: line.inventoryItemId,
//           quantity: String(line.quantity),
//         }))
//       : [{ itemId: items[0]?.id || "", quantity: "" }],
//   );
//   const selectedItemId = (line) => line.itemId || items[0]?.id || "";
//   const submit = (event) => {
//     event.preventDefault();
//     const form = new FormData(event.currentTarget);
//     onSave({
//       menuItemId: form.get("menuItemId"),
//       yieldQuantity: form.get("yieldQuantity"),
//       ingredients: lines,
//     });
//   };
//   return (
//     <form onSubmit={submit} className="mt-4 grid gap-3">
//       <label className="text-sm font-semibold text-slate-700">
//         Menu item
//         {initial && (
//           <input type="hidden" name="menuItemId" value={initial.menuItemId} />
//         )}
//         <select
//           name={initial ? undefined : "menuItemId"}
//           required
//           defaultValue={initial?.menuItemId || menuItems[0]?.id}
//           disabled={Boolean(initial)}
//           className={inputClass}
//         >
//           {menuItems.map((item) => (
//             <option key={item.id} value={item.id}>
//               {item.name}
//             </option>
//           ))}
//         </select>
//       </label>
//       <Field
//         name="yieldQuantity"
//         label="Recipe yield (portions)"
//         type="number"
//         min="0.001"
//         step="0.001"
//         defaultValue={initial?.yieldQuantity || 1}
//         required
//       />
//       {lines.map((line, index) => (
//         <div key={index} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
//           <label className="text-sm font-semibold text-slate-700">
//             Ingredient
//             <select
//               required
//               value={selectedItemId(line)}
//               onChange={(event) =>
//                 setLines((current) =>
//                   current.map((row, rowIndex) =>
//                     rowIndex === index
//                       ? { ...row, itemId: event.target.value }
//                       : row,
//                   ),
//                 )
//               }
//               className={inputClass}
//             >
//               {items.map((item) => (
//                 <option key={item.id} value={item.id}>
//                   {item.name} · {item.unit}
//                 </option>
//               ))}
//             </select>
//           </label>
//           <label className="text-sm font-semibold text-slate-700">
//             Quantity
//             <input
//               required
//               type="number"
//               min="0.001"
//               step="0.001"
//               value={line.quantity}
//               onChange={(event) =>
//                 setLines((current) =>
//                   current.map((row, rowIndex) =>
//                     rowIndex === index
//                       ? { ...row, quantity: event.target.value }
//                       : row,
//                   ),
//                 )
//               }
//               className={inputClass}
//             />
//           </label>
//           <button
//             type="button"
//             disabled={lines.length === 1}
//             onClick={() =>
//               setLines((current) =>
//                 current.filter((_, rowIndex) => rowIndex !== index),
//               )
//             }
//             className="mt-auto h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-40"
//           >
//             Remove
//           </button>
//         </div>
//       ))}
//       <button
//         type="button"
//         disabled={lines.length >= 100 || !items.length}
//         onClick={() =>
//           setLines((current) => [
//             ...current,
//             { itemId: items[0].id, quantity: "" },
//           ])
//         }
//         className="w-fit rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
//       >
//         Add ingredient
//       </button>
//       <p className="text-xs text-slate-500">
//         Saved recipes deduct stock when an order enters preparation. Quantities
//         use each ingredient’s recorded unit.
//       </p>
//       <Submit saving={saving} />
//     </form>
//   );
// }

   
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  LoaderCircle,
  Plus,
  RefreshCw,
  Truck,
  Utensils,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../../services/api";

const tabs = [
  { id: "stock", label: "Stock & movements", icon: Boxes },
  { id: "suppliers", label: "Suppliers", icon: Truck },
  { id: "purchases", label: "Purchase orders", icon: ClipboardList },
  { id: "recipes", label: "Recipes", icon: Utensils },
];

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

const dataOf = (response) => response?.data?.data;

const errorMessage = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Unable to complete the request.";

const key = () =>
  globalThis.crypto?.randomUUID?.() ||
  `stock-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Indian mobile number validation
const normalizeIndianMobile = (value = "") => {
  const cleaned = String(value).replace(/[\s-]/g, "");

  if (!/^(?:\+91)?[6-9]\d{9}$/.test(cleaned)) {
    return null;
  }

  return cleaned.replace(/^\+91/, "");
};

export default function RestaurantInventory() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [activeTab, setActiveTab] = useState("stock");

  const [summary, setSummary] = useState({
    itemCount: 0,
    lowStockCount: 0,
    totalValue: 0,
  });

  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const requestSequence = useRef(0);

  const load = useCallback(async (selectedBranch) => {
    const sequence = ++requestSequence.current;

    if (!selectedBranch) {
      setSummary({ itemCount: 0, lowStockCount: 0, totalValue: 0 });
      setItems([]);
      setMovements([]);
      setSuppliers([]);
      setOrders([]);
      setMenuItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    setSummary({ itemCount: 0, lowStockCount: 0, totalValue: 0 });
    setItems([]);
    setMovements([]);
    setSuppliers([]);
    setOrders([]);
    setMenuItems([]);

    try {
      const params = { branchId: selectedBranch };

      const [
        summaryResponse,
        itemsResponse,
        movementResponse,
        supplierResponse,
        orderResponse,
        menuResponse,
      ] = await Promise.all([
        api.get("/restaurant/inventory/summary", { params }),
        api.get("/restaurant/inventory/items", {
          params: { ...params, includeInactive: true },
        }),
        api.get("/restaurant/inventory/movements", { params }),
        api.get("/restaurant/inventory/suppliers"),
        api.get("/restaurant/inventory/purchase-orders", { params }),
        api.get("/restaurant/inventory/menu-items", { params }),
      ]);

      if (sequence !== requestSequence.current) return;

      setSummary(
        dataOf(summaryResponse) || {
          itemCount: 0,
          lowStockCount: 0,
          totalValue: 0,
        }
      );

      setItems(Array.isArray(dataOf(itemsResponse)) ? dataOf(itemsResponse) : []);
      setMovements(
        Array.isArray(dataOf(movementResponse))
          ? dataOf(movementResponse)
          : []
      );
      setSuppliers(
        Array.isArray(dataOf(supplierResponse))
          ? dataOf(supplierResponse)
          : []
      );
      setOrders(
        Array.isArray(dataOf(orderResponse)) ? dataOf(orderResponse) : []
      );
      setMenuItems(
        Array.isArray(dataOf(menuResponse)) ? dataOf(menuResponse) : []
      );
    } catch (loadError) {
      if (sequence === requestSequence.current) {
        setError(errorMessage(loadError));
      }
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;

    const fetchBranches = async () => {
      const first = await api.get("/restaurant/branches", {
        params: { page: 1, limit: 100, status: "all" },
      });

      const firstData = dataOf(first);
      const rows = Array.isArray(firstData?.branches)
        ? firstData.branches
        : [];

      const totalPages = Math.max(
        1,
        Number(firstData?.pagination?.totalPages) || 1
      );

      const remaining = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          api.get("/restaurant/branches", {
            params: {
              page: index + 2,
              limit: 100,
              status: "all",
            },
          })
        )
      );

      return [
        ...rows,
        ...remaining.flatMap((response) => {
          const pageRows = dataOf(response)?.branches;
          return Array.isArray(pageRows) ? pageRows : [];
        }),
      ];
    };

    fetchBranches()
      .then((rows) => {
        if (!alive) return;

        setBranches(rows);

        const firstBranch = rows[0]?.id || "";

        setBranchId((current) =>
          rows.some((branch) => branch.id === current)
            ? current
            : firstBranch
        );

        if (firstBranch) load(firstBranch);
        else setLoading(false);
      })
      .catch((loadError) => {
        if (alive) {
          setError(errorMessage(loadError));
          setLoading(false);
        }
      });

    return () => {
      alive = false;
      requestSequence.current += 1;
    };
  }, [load]);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === branchId),
    [branches, branchId]
  );

  const run = async (callback, success) => {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      await callback();
      setDialog(null);
      setNotice(success);
      await load(branchId);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const saveIngredient = (event) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const values = {
      name: form.get("name"),
      sku: form.get("sku"),
      unit: form.get("unit"),
      reorderLevel: form.get("reorderLevel"),
      unitCost: form.get("unitCost"),
    };

    run(
      () =>
        dialog.item
          ? api.put(
              `/restaurant/inventory/items/${dialog.item.id}`,
              values
            )
          : api.post("/restaurant/inventory/items", {
              ...values,
              branchId,
              openingQuantity: form.get("openingQuantity"),
            }),
      dialog.item ? "Ingredient updated." : "Inventory item saved."
    );
  };

  const adjustStock = (event) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    run(
      () =>
        api.post("/restaurant/inventory/movements", {
          itemId: dialog.item.id,
          branchId,
          movementType: form.get("movementType"),
          quantity: form.get("quantity"),
          idempotencyKey: key(),
          note: form.get("note"),
        }),
      "Stock movement recorded."
    );
  };

  const saveSupplier = (event) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const rawPhone = form.get("phone");
    const phone = normalizeIndianMobile(rawPhone);

    if (rawPhone && !phone) {
      setError(
        "Enter a valid Indian mobile number starting with 6, 7, 8 or 9. Use exactly 10 digits, optionally with +91."
      );
      return;
    }

    const values = {
      name: form.get("name"),
      contactName: form.get("contactName"),
      phone: phone || "",
      email: form.get("email"),
      address: form.get("address"),
    };

    run(
      () =>
        dialog.supplier
          ? api.put(
              `/restaurant/inventory/suppliers/${dialog.supplier.id}`,
              values
            )
          : api.post("/restaurant/inventory/suppliers", values),
      dialog.supplier ? "Supplier updated." : "Supplier saved."
    );
  };

  const createPurchase = (values) =>
    run(
      () =>
        api.post("/restaurant/inventory/purchase-orders", {
          branchId,
          ...values,
        }),
      "Draft purchase order created."
    );

  const saveRecipe = (values) =>
    run(
      () =>
        api.put(
          `/restaurant/inventory/recipes/${branchId}/${values.menuItemId}`,
          {
            yieldQuantity: values.yieldQuantity,
            ingredients: values.ingredients,
          }
        ),
      "Recipe saved."
    );

  const modalTitle =
    dialog?.type === "ingredient"
      ? dialog.item
        ? "Edit inventory item"
        : "Add inventory item"
      : dialog?.type === "movement"
        ? `Adjust ${dialog.item.name}`
        : dialog?.type === "supplier"
          ? dialog.supplier
            ? "Edit supplier"
            : "Add supplier"
          : dialog?.type === "purchase"
            ? "Create purchase order"
            : "Set recipe";

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">
            Restaurant operations
          </p>

          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
            Inventory & purchasing
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Track branch stock, record wastage, manage suppliers and receive
            purchase orders.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="text-xs font-semibold text-slate-500">
            Branch
            <select
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
                load(event.target.value);
              }}
              disabled={!branches.length}
              className="mt-1 block min-w-52 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 disabled:bg-slate-100"
              aria-label="Inventory branch"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => load(branchId)}
            disabled={!branchId || loading}
            className="mt-auto inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      {!branches.length && !loading && !error ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Boxes className="mx-auto text-slate-300" />
          <h2 className="mt-3 font-bold text-slate-800">
            Create a branch to track stock
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Inventory is stored per branch so each location has an accurate
            quantity.
          </p>
          <Link
            to="/restaurant/branches"
            className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700"
          >
            Open Branch Management
          </Link>
        </section>
      ) : (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-3">
            <Metric label="Active ingredients" value={summary.itemCount} />
            <Metric
              label="Low stock alerts"
              value={summary.lowStockCount}
              alert={summary.lowStockCount > 0}
            />
            <Metric
              label="Stock value"
              value={money(summary.totalValue)}
            />
          </section>

          <nav
            className="mt-6 flex gap-2 overflow-x-auto border-b border-slate-200 pb-2"
            aria-label="Inventory sections"
          >
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                  activeTab === id
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold text-slate-900">
                  {activeTab === "stock"
                    ? "Ingredient stock"
                    : activeTab === "suppliers"
                      ? "Suppliers"
                      : activeTab === "purchases"
                        ? "Purchase orders"
                        : "Menu recipes"}
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  {selectedBranch?.name || "Selected branch"} · restaurant data
                  is scoped to your access
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeTab === "stock" && (
                  <button
                    onClick={() => setDialog({ type: "ingredient" })}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-3 text-sm font-bold text-white hover:bg-orange-700"
                  >
                    <Plus size={16} />
                    Add ingredient
                  </button>
                )}

                {activeTab === "suppliers" && (
                  <button
                    onClick={() => setDialog({ type: "supplier" })}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-3 text-sm font-bold text-white"
                  >
                    <Plus size={16} />
                    Add supplier
                  </button>
                )}

                {activeTab === "purchases" && (
                  <button
                    onClick={() => setDialog({ type: "purchase" })}
                    disabled={!suppliers.some((s) => s.isActive) || !items.some((i) => i.isActive)}
                    title={!suppliers.some((s) => s.isActive) ? "Add an active supplier first" : undefined}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <Plus size={16} />
                    New purchase
                  </button>
                )}

                {activeTab === "recipes" && (
                  <button
                    onClick={() => setDialog({ type: "recipe" })}
                    disabled={!items.length || !menuItems.length}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <Plus size={16} />
                    Set recipe
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-56 items-center justify-center text-sm text-slate-500">
                <LoaderCircle className="mr-2 animate-spin" size={18} />
                Loading branch inventory…
              </div>
            ) : activeTab === "stock" ? (
              <>
                <label className="m-4 inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(event) =>
                      setShowInactive(event.target.checked)
                    }
                  />
                  Show inactive ingredients
                </label>

                <StockTable
                  items={items.filter(
                    (item) => showInactive || item.isActive
                  )}
                  onEdit={(item) =>
                    setDialog({ type: "ingredient", item })
                  }
                  onToggle={(item) =>
                    run(
                      () =>
                        api.put(
                          `/restaurant/inventory/items/${item.id}`,
                          { isActive: !item.isActive }
                        ),
                      item.isActive
                        ? "Ingredient deactivated."
                        : "Ingredient reactivated."
                    )
                  }
                  onAdjust={(item) =>
                    setDialog({ type: "movement", item })
                  }
                />
              </>
            ) : activeTab === "suppliers" ? (
              <SuppliersList
                suppliers={suppliers}
                onEdit={(supplier) =>
                  setDialog({ type: "supplier", supplier })
                }
                onToggle={(supplier) =>
                  run(
                    () =>
                      api.put(
                        `/restaurant/inventory/suppliers/${supplier.id}`,
                        { isActive: !supplier.isActive }
                      ),
                    supplier.isActive
                      ? "Supplier deactivated."
                      : "Supplier reactivated."
                  )
                }
              />
            ) : activeTab === "purchases" ? (
              <PurchaseList
                orders={orders}
                onUpdate={(order, status) =>
                  run(
                    () =>
                      status === "received"
                        ? api.post(
                            `/restaurant/inventory/purchase-orders/${order.id}/receive`
                          )
                        : api.patch(
                            `/restaurant/inventory/purchase-orders/${order.id}`,
                            { status, branchId }
                          ),
                    status === "received"
                      ? "Purchase received and stock updated."
                      : "Purchase order updated."
                  )
                }
              />
            ) : (
              <RecipeList
                menuItems={menuItems}
                items={items}
                branchId={branchId}
                onEdit={(recipe) =>
                  setDialog({ type: "recipe", recipe })
                }
                onDeactivate={(menuItemId) =>
                  run(
                    () =>
                      api.delete(
                        `/restaurant/inventory/recipes/${branchId}/${menuItemId}`
                      ),
                    "Recipe deactivated."
                  )
                }
              />
            )}
          </section>

          {activeTab === "stock" && (
            <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="font-bold text-slate-900">
                Recent stock movements
              </h2>
              <MovementList movements={movements} />
            </section>
          )}
        </>
      )}

      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setDialog(null);
              setError("");
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-dialog-title"
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-7"
          >
            <div className="flex items-start justify-between">
              <h2
                id="inventory-dialog-title"
                className="text-lg font-bold text-slate-900"
              >
                {modalTitle}
              </h2>

              <button
                type="button"
                onClick={() => {
                  setDialog(null);
                  setError("");
                }}
                disabled={saving}
                aria-label="Close dialog"
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            {dialog.type === "ingredient" && (
              <form
                onSubmit={saveIngredient}
                className="mt-5 grid gap-4 sm:grid-cols-2"
              >
                <Field name="name" label="Ingredient name" required defaultValue={dialog.item?.name} />
                <Field name="sku" label="SKU" required defaultValue={dialog.item?.sku} />
                <Field name="unit" label="Unit (kg, L, pcs)" required defaultValue={dialog.item?.unit} />

                {!dialog.item && (
                  <Field
                    name="openingQuantity"
                    label="Opening quantity"
                    type="number"
                    min="0"
                    step="0.001"
                    defaultValue="0"
                  />
                )}

                <Field
                  name="reorderLevel"
                  label="Low stock threshold"
                  type="number"
                  min="0"
                  step="0.001"
                  defaultValue={dialog.item?.reorderLevel ?? 0}
                />

                <Field
                  name="unitCost"
                  label="Cost per unit (₹)"
                  type="number"
                  min="0"
                  step="0.0001"
                  defaultValue={dialog.item?.unitCost ?? 0}
                />

                <Submit saving={saving} />
              </form>
            )}

            {dialog.type === "movement" && (
              <form onSubmit={adjustStock} className="mt-5 grid gap-4">
                <label className="text-sm font-semibold text-slate-700">
                  Movement type
                  <select name="movementType" className={inputClass}>
                    <option value="adjustment_in">Stock received (manual)</option>
                    <option value="adjustment_out">Stock correction (out)</option>
                    <option value="wastage">Record wastage</option>
                  </select>
                </label>

                <Field
                  name="quantity"
                  label={`Quantity (${dialog.item.unit})`}
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                />

                <Field name="note" label="Reason / note" />
                <Submit saving={saving} />
              </form>
            )}

            {dialog.type === "supplier" && (
              <form onSubmit={saveSupplier} className="mt-5 grid gap-4">
                <Field
                  name="name"
                  label="Supplier name"
                  required
                  defaultValue={dialog.supplier?.name}
                />

                <Field
                  name="contactName"
                  label="Contact person"
                  defaultValue={dialog.supplier?.contactName}
                />

                <MobileField defaultValue={dialog.supplier?.phone} />

                <Field
                  name="email"
                  label="Email"
                  type="email"
                  defaultValue={dialog.supplier?.email}
                />

                <Field
                  name="address"
                  label="Address"
                  defaultValue={dialog.supplier?.address}
                />

                <Submit saving={saving} />
              </form>
            )}

            {dialog.type === "purchase" && (
              <PurchaseForm
                suppliers={suppliers}
                items={items}
                saving={saving}
                onSubmit={createPurchase}
              />
            )}

            {dialog.type === "recipe" && (
              <RecipeForm
                key={`${dialog.recipe?.menuItemId || "new"}-${branchId}`}
                menuItems={menuItems}
                items={items}
                saving={saving}
                initial={dialog.recipe}
                onSave={saveRecipe}
              />
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function Metric({ label, value, alert }) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm sm:p-6 ${
        alert ? "border-amber-200" : "border-slate-200"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-3 text-2xl font-extrabold ${
          alert ? "text-amber-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Field({ label, name, ...props }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input name={name} className={inputClass} {...props} />
    </label>
  );
}

// Mobile input: only digits and optional +91 are allowed.
function MobileField({ defaultValue }) {
  const [value, setValue] = useState(() => {
    if (!defaultValue) return "";
    const normalized = normalizeIndianMobile(defaultValue);
    return normalized || String(defaultValue);
  });

  const [touched, setTouched] = useState(false);

  const valid = !value || Boolean(normalizeIndianMobile(value));

  const handleChange = (event) => {
    let next = event.target.value.replace(/[^\d+]/g, "");

    // Allow + only at the beginning.
    if (next.includes("+")) {
      next = "+" + next.replace(/\+/g, "").replace(/^\+/, "");
    }

    // Prevent entering more than 10 digits, or 12 with country code.
    if (next.startsWith("+91")) {
      next = "+91" + next.slice(3).replace(/\D/g, "").slice(0, 10);
    } else {
      next = next.replace(/\D/g, "").slice(0, 10);
    }

    setValue(next);
    setTouched(true);
  };

  return (
    <label className="block text-sm font-semibold text-slate-700">
      Mobile number
      <div className="relative mt-1">
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          placeholder="98765 43210"
          maxLength={13}
          className={`${inputClass} ${
            touched && !valid
              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100"
              : ""
          }`}
          aria-invalid={touched && !valid}
          aria-describedby="mobile-help"
        />
      </div>

      <span
        id="mobile-help"
        className={`mt-1.5 block text-xs font-normal ${
          touched && !valid ? "text-rose-600" : "text-slate-500"
        }`}
      >
        {touched && !valid
          ? "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9."
          : "Enter 10 digits or include the +91 country code."}
      </span>
    </label>
  );
}

function Submit({ saving }) {
  return (
    <button
      disabled={saving}
      className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50 sm:col-span-2"
    >
      {saving && <LoaderCircle size={16} className="animate-spin" />}
      {saving ? "Saving…" : "Save"}
    </button>
  );
}

function StockTable({ items, onAdjust, onEdit, onToggle }) {
  return items.length ? (
    <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3 sm:p-6">
      {items.map((item) => {
        const low =
          Number(item.quantityOnHand) <= Number(item.reorderLevel);

        return (
          <article
            key={item.id}
           className={`flex min-h-[360px] flex-col rounded-2xl border bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
  !item.isActive
    ? "border-slate-200 opacity-70"
    : low
      ? "border-amber-200"
      : "border-slate-200"
}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                    low
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  <Boxes size={23} />
                </span>

                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-slate-900">
                    {item.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    SKU {item.sku}
                  </p>
                </div>
              </div>

              <span
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${
                  !item.isActive
                    ? "bg-slate-100 text-slate-600"
                    : low
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {!item.isActive
                  ? "Inactive"
                  : low
                    ? "Low stock"
                    : "In stock"}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  On hand
                </p>
                <p
                  className={`mt-2 text-xl font-extrabold ${
                    low ? "text-amber-700" : "text-slate-900"
                  }`}
                >
                  {Number(item.quantityOnHand).toLocaleString()}
                </p>
                <span className="text-xs font-semibold text-slate-500">
                  {item.unit}
                </span>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Reorder level
                </p>
                <p className="mt-2 text-xl font-bold text-slate-800">
                  {Number(item.reorderLevel).toLocaleString()}
                </p>
                <span className="text-xs font-semibold text-slate-500">
                  {item.unit}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 text-xs text-slate-500">
              <span className="truncate">
                {item.branch?.name || "Selected branch"}
              </span>
              <span className="shrink-0 font-semibold">
                {money(item.unitCost)}/{item.unit}
              </span>
            </div>

            <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button
                onClick={() => onEdit(item)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>

              {item.isActive && (
                <button
                  onClick={() => onAdjust(item)}
                  className="rounded-lg bg-orange-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-orange-700"
                >
                  Adjust stock
                </button>
              )}

              <button
                onClick={() => onToggle(item)}
                className="ml-auto rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                {item.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  ) : (
    <Empty message="No ingredients recorded for this branch." />
  );
}

function SuppliersList({ suppliers, onEdit, onToggle }) {
  return suppliers.length ? (
    <ul className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3 sm:p-6">
      {suppliers.map((supplier) => (
        <li
          key={supplier.id}
          className="flex min-h-[360px] flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
                <Truck size={23} />
              </span>

              <div className="min-w-0">
                <p className="break-words text-base font-bold text-slate-900">
                  {supplier.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {supplier.contactName || "Supplier contact"}
                </p>
              </div>
            </div>

            <span
              className={`h-fit shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                supplier.isActive
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {supplier.isActive ? "Active" : "Inactive"}
            </span>
          </div>

          <div className="mt-5 flex-1 space-y-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            {supplier.phone ? (
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Mobile number
                </p>
                <a
                  className="font-semibold text-slate-800 hover:text-orange-700"
                  href={`tel:${supplier.phone}`}
                >
                  {supplier.phone}
                </a>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No mobile number</p>
            )}

            {supplier.email && (
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Email
                </p>
                <p className="break-all text-sm">{supplier.email}</p>
              </div>
            )}

            {supplier.address && (
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Address
                </p>
                <p className="text-xs leading-5">{supplier.address}</p>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
            <button
              onClick={() => onEdit(supplier)}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold hover:bg-slate-50"
            >
              Edit supplier
            </button>

            <button
              onClick={() => onToggle(supplier)}
              className="ml-auto rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold hover:bg-slate-50"
            >
              {supplier.isActive ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <Empty message="No suppliers yet." />
  );
}

function PurchaseList({ orders, onUpdate }) {
  return orders.length ? (
    <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3 sm:p-6">
      {orders.map((order) => (
        <article
          key={order.id}
          className="flex min-h-[340px] flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-lg"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900">
                {order.reference}
              </h3>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
                  order.status === "received"
                    ? "bg-emerald-50 text-emerald-700"
                    : order.status === "cancelled"
                      ? "bg-rose-50 text-rose-700"
                      : order.status === "ordered"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-800"
                }`}
              >
                {order.status}
              </span>
            </div>

            <p className="mt-2 text-sm font-semibold text-slate-700">
              {order.supplier?.name || "Supplier unavailable"}
            </p>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Order total
                </p>
                <p className="mt-1 text-xl font-extrabold text-slate-900">
                  {money(order.totalAmount)}
                </p>
              </div>

              <p className="text-xs font-semibold text-slate-500">
                {order.items?.length || 0} line(s)
              </p>
            </div>

            <ul className="mt-4 space-y-2 text-xs text-slate-600">
              {order.items?.map((line) => (
                <li key={line.id}>
                  {line.inventoryItem?.name || "Ingredient"}:{" "}
                  {Number(line.quantity).toLocaleString()}{" "}
                  {line.inventoryItem?.unit} × {money(line.unitCost)} ={" "}
                  {money(line.lineTotal)}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-auto flex shrink-0 flex-wrap gap-2 border-t border-slate-100 pt-4">
            {order.status === "draft" && (
              <>
                <button
                  onClick={() => onUpdate(order, "ordered")}
                  className="rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-bold"
                >
                  Mark ordered
                </button>

                <button
                  onClick={() => onUpdate(order, "cancelled")}
                  className="rounded-lg border border-rose-200 px-3 py-2.5 text-xs font-bold text-rose-700"
                >
                  Cancel
                </button>
              </>
            )}

            {order.status === "ordered" && (
              <button
                onClick={() => onUpdate(order, "received")}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white"
              >
                Receive stock
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  ) : (
    <Empty message="No purchase orders for this branch." />
  );
}

function MovementList({ movements }) {
  return movements.length ? (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {movements.slice(0, 12).map((movement) => (
        <div
          key={movement.id}
          className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm"
        >
          <div>
            <p className="font-semibold text-slate-800">
              {movement.item?.name || "Ingredient"}{" "}
              <span className="font-normal capitalize text-slate-500">
                · {movement.movementType.replaceAll("_", " ")}
              </span>
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {movement.note ||
                new Date(movement.createdAt).toLocaleString()}
            </p>
          </div>

          <p
            className={`font-bold ${
              Number(movement.quantityChange) < 0
                ? "text-rose-700"
                : "text-emerald-700"
            }`}
          >
            {Number(movement.quantityChange) > 0 ? "+" : ""}
            {Number(movement.quantityChange).toLocaleString()}{" "}
            {movement.item?.unit || ""}
          </p>
        </div>
      ))}
    </div>
  ) : (
    <p className="mt-2 text-sm text-slate-500">
      No stock movements recorded.
    </p>
  );
}

function RecipeList({ menuItems, items, branchId, onEdit, onDeactivate }) {
  const [selectedId, setSelectedId] = useState("");
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSelectedId(menuItems[0]?.id || "");
  }, [menuItems]);

  useEffect(() => {
    let active = true;

    if (!selectedId || !branchId) {
      setRecipe(null);
      return () => {
        active = false;
      };
    }

    setLoading(true);

    api
      .get(`/restaurant/inventory/recipes/${branchId}/${selectedId}`)
      .then((response) => {
        if (active) setRecipe(dataOf(response));
      })
      .catch(() => {
        if (active) setRecipe(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId, branchId]);

  const estimate = recipe?.costEstimate;

  return (
    <div className="p-5 sm:p-6">
      <label className="block max-w-lg text-sm font-semibold text-slate-700">
        Dish
        <select
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className={inputClass}
        >
          {menuItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading recipe…</p>
      ) : recipe ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-orange-600">
                Recipe card
              </p>

              <p className="mt-1 text-xl font-extrabold text-slate-900">
                {menuItems.find((item) => item.id === selectedId)?.name}
              </p>
            </div>

            <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700">
              Yield · {recipe.yieldQuantity} portions
            </span>
          </div>

          <ul className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
            {recipe.ingredients?.map((line) => (
              <li
                key={line.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"
              >
                {line.inventoryItem?.name}: {line.quantity}{" "}
                {line.inventoryItem?.unit}
              </li>
            ))}
          </ul>

          {estimate && (
            <div className="mt-5 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-3">
              <Metric
                label="Ingredient cost / serving"
                value={money(estimate.ingredientCostPerServing)}
              />

              <Metric
                label="Food cost %"
                value={
                  estimate.foodCostPercentage == null
                    ? "—"
                    : `${estimate.foodCostPercentage}%`
                }
              />

              <Metric
                label="Gross margin / serving"
                value={money(estimate.grossMarginBeforeOtherCosts)}
              />

              <p className="text-xs text-slate-500 sm:col-span-3">
                Menu price: {money(estimate.menuPrice)}.{" "}
                {estimate.estimateDisclaimer}
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onEdit(recipe)}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold"
            >
              Edit recipe
            </button>

            <button
              type="button"
              onClick={() => onDeactivate(selectedId)}
              className="rounded-lg border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700"
            >
              Deactivate recipe
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          No recipe saved for this dish and branch.
        </p>
      )}

      {!menuItems.length && (
        <Empty message="Create menu items before setting recipes." />
      )}

      {!items.length && (
        <Empty message="Add ingredients before setting recipes." />
      )}
    </div>
  );
}

function PurchaseForm({ suppliers, items, saving, onSubmit }) {
  const activeItems = items.filter((item) => item.isActive);
  const activeSuppliers = suppliers.filter((supplier) => supplier.isActive);

  const [lines, setLines] = useState([
    {
      itemId: activeItems[0]?.id || "",
      quantity: "",
      unitCost: "",
    },
  ]);

  const submit = (event) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const validLines = lines.filter(
      (line) =>
        line.itemId &&
        Number(line.quantity) > 0 &&
        Number(line.unitCost) >= 0
    );

    if (!validLines.length) return;

    onSubmit({
      supplierId: form.get("supplierId"),
      reference: form.get("reference"),
      items: validLines,
    });
  };

  return (
    <form onSubmit={submit} className="mt-6 grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          Supplier
          <select name="supplierId" required className={inputClass}>
            {activeSuppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>

        <Field
          name="reference"
          label="Purchase reference"
          required
          defaultValue={`PO-${Date.now().toString().slice(-8)}`}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">
              Purchase items
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Add ingredients and their purchase quantities.
            </p>
          </div>

          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
            {lines.length} items
          </span>
        </div>

        <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(100px,0.8fr)_minmax(120px,0.9fr)_80px] gap-3 px-2 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500 sm:grid">
          <span>Ingredient</span>
          <span>Quantity</span>
          <span>Unit cost (₹)</span>
          <span>Action</span>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid grid-cols-1 items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1.5fr)_minmax(100px,0.8fr)_minmax(120px,0.9fr)_80px] sm:gap-3"
            >
              <label className="min-w-0 text-sm font-semibold text-slate-700">
                <span className="mb-1 block sm:hidden">
                  Ingredient
                </span>

                <select
                  required
                  value={line.itemId}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((row, i) =>
                        i === index
                          ? { ...row, itemId: event.target.value }
                          : row
                      )
                    )
                  }
                  className={inputClass}
                >
                  <option value="">Select ingredient</option>
                  {activeItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.unit}
                    </option>
                  ))}
                </select>
              </label>

              <Field
                name={`quantity-${index}`}
                label="Quantity"
                type="number"
                min="0.001"
                step="0.001"
                required
                value={line.quantity}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((row, i) =>
                      i === index
                        ? { ...row, quantity: event.target.value }
                        : row
                    )
                  )
                }
              />

              <Field
                name={`unitCost-${index}`}
                label="Unit cost (₹)"
                type="number"
                min="0"
                step="0.0001"
                required
                value={line.unitCost}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((row, i) =>
                      i === index
                        ? { ...row, unitCost: event.target.value }
                        : row
                    )
                  )
                }
              />

              <button
                type="button"
                disabled={lines.length === 1}
                onClick={() =>
                  setLines((current) =>
                    current.filter((_, i) => i !== index)
                  )
                }
                className="h-10 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={lines.length >= 100 || !activeItems.length}
          onClick={() =>
            setLines((current) => [
              ...current,
              {
                itemId: activeItems[0]?.id || "",
                quantity: "",
                unitCost: "",
              },
            ])
          }
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-dashed border-orange-300 bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
        >
          <Plus size={16} />
          Add purchase line
        </button>
      </div>

      <Submit saving={saving} />
    </form>
  );
}


function Empty({ message }) {
  return (
    <div className="p-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}


function RecipeForm({ menuItems, items, saving, onSave, initial }) {
  const [lines, setLines] = useState(() =>
    initial?.ingredients?.length
      ? initial.ingredients.map((line) => ({
          itemId: line.inventoryItemId,
          quantity: String(line.quantity),
        }))
      : [{ itemId: items[0]?.id || "", quantity: "" }]
  );

  const submit = (event) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    if (
      lines.some(
        (line) => !line.itemId || Number(line.quantity) <= 0
      )
    ) {
      return;
    }

    onSave({
      menuItemId: form.get("menuItemId"),
      yieldQuantity: form.get("yieldQuantity"),
      ingredients: lines,
    });
  };

  return (
    <form onSubmit={submit} className="mt-5 grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          Menu item

          {initial && (
            <input
              type="hidden"
              name="menuItemId"
              value={initial.menuItemId}
            />
          )}

          <select
            name={initial ? undefined : "menuItemId"}
            required
            defaultValue={initial?.menuItemId || menuItems[0]?.id || ""}
            disabled={Boolean(initial)}
            className={inputClass}
          >
            {menuItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <Field
          name="yieldQuantity"
          label="Recipe yield (portions)"
          type="number"
          min="0.001"
          step="0.001"
          defaultValue={initial?.yieldQuantity || 1}
          required
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">
              Recipe ingredients
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Specify the ingredients and quantity required per recipe.
            </p>
          </div>

          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
            {lines.length} items
          </span>
        </div>

        <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(120px,0.8fr)_90px] gap-3 px-2 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500 sm:grid">
          <span>Ingredient</span>
          <span>Quantity</span>
          <span>Action</span>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(120px,0.8fr)_90px] sm:items-end"
            >
              <label className="min-w-0 text-sm font-semibold text-slate-700">
                <span className="mb-1 block sm:hidden">
                  Ingredient
                </span>

                <select
                  required
                  value={line.itemId || items[0]?.id || ""}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((row, i) =>
                        i === index
                          ? { ...row, itemId: event.target.value }
                          : row
                      )
                    )
                  }
                  className={inputClass}
                >
                  {items
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.unit}
                      </option>
                    ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                <span className="mb-1 block sm:hidden">
                  Quantity
                </span>

                <input
                  required
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((row, i) =>
                        i === index
                          ? { ...row, quantity: event.target.value }
                          : row
                      )
                    )
                  }
                  className={inputClass}
                />
              </label>

              <button
                type="button"
                disabled={lines.length === 1}
                onClick={() =>
                  setLines((current) =>
                    current.filter((_, i) => i !== index)
                  )
                }
                className="h-10 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={lines.length >= 100 || !items.some((item) => item.isActive)}
          onClick={() =>
            setLines((current) => [
              ...current,
              {
                itemId: items.find((item) => item.isActive)?.id || "",
                quantity: "",
              },
            ])
          }
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-dashed border-orange-300 bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
        >
          <Plus size={16} />
          Add ingredient
        </button>
      </div>

      <p className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-700">
        Saved recipes deduct stock when an order enters preparation.
        Quantities use each ingredient’s recorded unit.
      </p>

      <Submit saving={saving} />
    </form>
  );
}
