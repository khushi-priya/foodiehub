import { Truck } from 'lucide-react';

export default function RestaurantDeliveryPlaceholder({ title, description }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
        <Truck size={23} />
      </div>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Delivery Management</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">This section will be enabled as its delivery management features are implemented.</p>
    </section>
  );
}
