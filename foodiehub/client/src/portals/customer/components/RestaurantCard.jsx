// import { Link } from "react-router-dom";
// import { CalendarDays, Clock3, Heart, MapPin, Store } from "lucide-react";

// export default function RestaurantCard({ restaurant, onSave }) {
//   return (
//     <article className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
//       <div className="flex h-48 items-center justify-center overflow-hidden bg-orange-50">
//         {restaurant.logo ? (
//           <img
//             src={restaurant.logo}
//             alt={`${restaurant.name} logo`}
//             className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
//             loading="lazy"
//           />
//         ) : (
//           <Store size={42} className="text-orange-300" />
//         )}
//       </div>
//       <div className="p-5">
//         <div className="flex items-start justify-between gap-3">
//           <h2 className="text-lg font-bold text-slate-900">
//             {restaurant.name}
//           </h2>
//           <span
//             className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${restaurant.isOpen ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
//           >
//             {restaurant.isOpen ? "Open now" : "Closed"}
//           </span>
//         </div>
//         <p className="mt-2 flex min-h-10 items-start gap-1.5 text-sm text-slate-500">
//           <MapPin size={15} className="mt-0.5 shrink-0 text-orange-500" />
//           {restaurant.cities?.length
//             ? restaurant.cities.join(", ")
//             : "Location unavailable"}
//         </p>
//         {restaurant.branches?.some((branch) => branch.approvalStatus === "pending") && (
//           <p className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">
//             Pending Approval · Development Test
//           </p>
//         )}
//         <div className="mt-3 flex min-h-5 items-center justify-between text-xs text-slate-500">
//           <span className="flex items-center gap-1">
//             <Clock3 size={13} />
//             {restaurant.averagePreparationTime
//               ? `~${restaurant.averagePreparationTime} min average prep`
//               : "Prep time unavailable"}
//           </span>
//           <span>
//             {restaurant.rating == null
//               ? "No ratings yet"
//               : `${restaurant.rating} rating`}
//           </span>
//         </div>
//         <p className="mt-2 text-xs text-slate-500">
//           {restaurant.cuisines?.length
//             ? restaurant.cuisines.join(", ")
//             : "Cuisine details unavailable"}
//         </p>
//         <div className="mt-3 flex flex-wrap gap-1.5">
//           {restaurant.deliveryAvailable && (
//             <span className="rounded bg-orange-50 px-2 py-1 text-[10px] font-semibold text-orange-700">
//               Delivery
//             </span>
//           )}
//           {restaurant.takeawayAvailable && (
//             <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
//               Takeaway
//             </span>
//           )}
//           {restaurant.dineInAvailable && (
//             <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
//               Dine-in
//             </span>
//           )}
//         </div>
//         <div className="mt-4 flex flex-wrap gap-2">
//           <Link
//             to={`/restaurants/${restaurant.slug}`}
//             className="min-w-28 flex-1 rounded-xl bg-orange-500 px-3 py-2.5 text-center text-sm font-bold text-white transition hover:bg-orange-600"
//           >
//             View menu
//           </Link>
//           {restaurant.dineInAvailable && <Link
//             to={`/restaurants/${restaurant.slug}?book=1${restaurant.branches?.find((branch) => branch.isPrimary)?.id ? `&branchId=${encodeURIComponent(restaurant.branches.find((branch) => branch.isPrimary).id)}` : ''}`}
//             className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-100"
//           ><CalendarDays size={15}/>Book a Table</Link>}
//           {onSave && (
//             <button
//               onClick={() => onSave(restaurant)}
//               title="Add restaurant to wishlist"
//               aria-label={`Save ${restaurant.name}`}
//               className="rounded-xl border border-slate-200 px-3 text-slate-500 hover:border-pink-200 hover:text-pink-600"
//             >
//               <Heart size={17} />
//             </button>
//           )}
//         </div>
//       </div>
//     </article>
//   );
// }


import { Link } from "react-router-dom";
import {
  CalendarDays,
  Clock3,
  Heart,
  MapPin,
  Store,
  Star,
  ArrowUpRight,
  Bike,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";

export default function RestaurantCard({ restaurant, onSave }) {
  const primaryBranch = restaurant.branches?.find(
    (branch) => branch.isPrimary
  );

  const cuisines = restaurant.cuisines?.length
    ? restaurant.cuisines.join(" · ")
    : "Cuisine not specified";

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition-all duration-300 hover:-translate-y-1 hover:border-orange-200 hover:shadow-[0_16px_40px_rgba(15,23,42,0.10)]">

      {/* Restaurant Image */}
      <div className="relative h-56 overflow-hidden bg-slate-100">
        {restaurant.logo ? (
          <img
            src={restaurant.logo}
            alt={`${restaurant.name} restaurant`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100">
            <Store size={52} className="text-orange-300" />
          </div>
        )}

        {/* Image Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />

        {/* Open / Closed */}
        <div className="absolute left-4 top-4">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur-md ${
              restaurant.isOpen
                ? "bg-white/95 text-emerald-700"
                : "bg-white/95 text-slate-600"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                restaurant.isOpen ? "bg-emerald-500" : "bg-slate-400"
              }`}
            />
            {restaurant.isOpen ? "Open now" : "Currently closed"}
          </span>
        </div>

        {/* Wishlist */}
        {onSave && (
          <button
            type="button"
            onClick={() => onSave(restaurant)}
            title="Add restaurant to wishlist"
            aria-label={`Save ${restaurant.name}`}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-600 shadow-md backdrop-blur transition hover:scale-110 hover:text-rose-500"
          >
            <Heart size={19} />
          </button>
        )}

        {/* Restaurant Name Overlay */}
        <div className="absolute bottom-4 left-4 right-4">
          <p className="mb-1 text-xs font-medium tracking-wide text-white/80">
            RESTAURANT
          </p>
          <h2 className="text-xl font-bold tracking-tight text-white">
            {restaurant.name}
          </h2>
        </div>
      </div>

      {/* Restaurant Details */}
      <div className="p-5">

        {/* Cuisine */}
        <p className="truncate text-sm font-medium text-slate-600">
          {cuisines}
        </p>

        {/* Location */}
        <div className="mt-3 flex min-h-5 items-start gap-2 text-sm text-slate-500">
          <MapPin size={16} className="mt-0.5 shrink-0 text-orange-500" />
          <span className="line-clamp-2">
            {restaurant.cities?.length
              ? restaurant.cities.join(", ")
              : "Location unavailable"}
          </span>
        </div>

        {/* Pending Approval */}
        {restaurant.branches?.some(
          (branch) => branch.approvalStatus === "pending"
        ) && (
          <div className="mt-3">
            <span className="inline-flex rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
              Pending approval
            </span>
          </div>
        )}

        {/* Divider */}
        <div className="my-4 border-t border-slate-100" />

        {/* Restaurant Information */}
        <div className="grid grid-cols-2 gap-3">

          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Clock3 size={17} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Preparation</p>
              <p className="truncate text-sm font-semibold text-slate-800">
                {restaurant.averagePreparationTime
                  ? `${restaurant.averagePreparationTime} mins`
                  : "Not available"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
              <Star size={17} fill="currentColor" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Customer rating</p>
              <p className="truncate text-sm font-semibold text-slate-800">
                {restaurant.rating == null
                  ? "Not rated"
                  : `${restaurant.rating} / 5`}
              </p>
            </div>
          </div>

        </div>

        {/* Services */}
        <div className="mt-4 flex flex-wrap gap-2">
          {restaurant.deliveryAvailable && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs font-medium text-orange-700">
              <Bike size={14} />
              Delivery
            </span>
          )}

          {restaurant.takeawayAvailable && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600">
              <ShoppingBag size={14} />
              Takeaway
            </span>
          )}

          {restaurant.dineInAvailable && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600">
              <UtensilsCrossed size={14} />
              Dine-in
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex gap-2">
          <Link
            to={`/restaurants/${restaurant.slug}`}
            className="group/btn flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            View Menu
            <ArrowUpRight
              size={16}
              className="transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5"
            />
          </Link>

          {restaurant.dineInAvailable && (
            <Link
              to={`/restaurants/${restaurant.slug}?book=1${
                primaryBranch?.id
                  ? `&branchId=${encodeURIComponent(primaryBranch.id)}`
                  : ""
              }`}
              aria-label={`Book a table at ${restaurant.name}`}
              title="Book a Table"
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3 text-xs font-semibold text-orange-600 transition hover:border-orange-500 hover:bg-orange-50"
            >
              <CalendarDays size={17} />
              <span className="hidden sm:inline">Book Table</span>
              <span className="sm:hidden">Book</span>
            </Link>
          )}
        </div>

      </div>
    </article>
  );
}
