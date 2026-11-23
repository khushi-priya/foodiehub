import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  LoaderCircle,
  MapPinned,
  RefreshCw,
} from "lucide-react";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";

export default function RestaurantDeliveryLiveMap() {
  const { user } = useAuth();
  const membership = (user?.restaurantMemberships || []).find(
    (item) =>
      item.status === "active" && item.role?.code === "restaurant_owner",
  );
  const [locations, setLocations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!membership?.restaurantId) return;
    setLoading(true);
    setError("");
    try {
      const [pointResponse, branchResponse] = await Promise.all([
        api.get("/restaurant/delivery/live-locations", {
          params: {
            restaurantId: membership.restaurantId,
            branchId: branchId || undefined,
          },
        }),
        api.get("/restaurant/delivery/orders/branches", {
          params: { restaurantId: membership.restaurantId },
        }),
      ]);
      setLocations(pointResponse.data.locations || []);
      setBranches(branchResponse.data.branches || []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not load active delivery locations.",
      );
    } finally {
      setLoading(false);
    }
  }, [membership?.restaurantId, branchId]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(load, 20_000);
    return () => window.clearInterval(timer);
  }, [load]);
  if (!membership)
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Restaurant owner access is required to view branch delivery locations.
      </div>
    );
  const mapUrl = (point) => {
    const delta = 0.01;
    const bbox = [
      point.longitude - delta,
      point.latitude - delta,
      point.longitude + delta,
      point.latitude + delta,
    ].join("%2C");
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${point.latitude}%2C${point.longitude}`;
  };
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-orange-600">
            Delivery Management
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">
            Live Delivery Map
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Active location points shared by delivery employees. Updates refresh
            every 20 seconds.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700"
        >
          {loading ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="grid gap-1 text-xs font-bold text-slate-600">
          Branch
          <select
            className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-sm text-slate-500">
          {locations.length} active{" "}
          {locations.length === 1 ? "delivery" : "deliveries"}
        </span>
      </div>
      {!loading && locations.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <MapPinned className="mx-auto text-slate-400" size={28} />
          <h2 className="mt-3 font-bold text-slate-800">
            No active location shares
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            A delivery employee’s point appears here while location sharing is
            enabled and their update is current.
          </p>
        </div>
      )}
      <section className="grid gap-5 md:grid-cols-2">
        {locations.map((point) => (
          <article
            key={point.assignmentId}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <iframe
              title={`Live location for order ${point.orderNumber}`}
              src={mapUrl(point)}
              className="h-64 w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <div className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-extrabold text-slate-900">
                    Order {point.orderNumber}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {point.employee} · {point.branch}
                  </p>
                </div>
                <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold capitalize text-orange-700">
                  {point.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Customer: {point.customerName} · Updated{" "}
                {new Date(point.capturedAt).toLocaleTimeString()}
              </p>
              <p className="font-mono text-xs text-slate-500">
                {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                {point.accuracyMeters != null
                  ? ` · ±${Math.round(point.accuracyMeters)} m`
                  : ""}
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <a
                  className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:underline"
                  href={`https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=16/${point.latitude}/${point.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in OpenStreetMap <ExternalLink size={13} />
                </a>
                <span className="text-xs text-slate-400">
                  Point expires {new Date(point.expiresAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </article>
        ))}
      </section>
      {loading && locations.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <LoaderCircle className="animate-spin" size={18} />
          Loading live locations…
        </div>
      )}
      <p className="text-xs text-slate-500">
        Map tiles are provided by OpenStreetMap. Coordinates are shown only to
        users authorized for this restaurant and branch.
      </p>
    </div>
  );
}
