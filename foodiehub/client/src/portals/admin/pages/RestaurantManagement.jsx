import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Store,
  RefreshCw,
  Eye,
  CheckCircle,
  XCircle,
  Ban,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  X,
  Mail,
  Phone,
  CalendarDays,
  AlertCircle,
  Plus,
  User,
  Building2,
} from "lucide-react";

import { api } from "../../../services/api.js";

const initialForm = {
  restaurantName: "",
  restaurantEmail: "",
  restaurantPhone: "",
  description: "",
  ownerFirstName: "",
  ownerLastName: "",
  ownerEmail: "",
  ownerPhone: "",
};

const statusStyles = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  suspended: "bg-slate-100 text-slate-700 ring-slate-200",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${
        statusStyles[status] || "bg-gray-100 text-gray-600 ring-gray-200"
      }`}
    >
      {status || "Unknown"}
    </span>
  );
}

function formatDate(date) {
  if (!date) return "—";

  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function FormField({
  label,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
    </div>
  );
}

export default function RestaurantManagement() {
  const [restaurants, setRestaurants] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [restaurantBranches, setRestaurantBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState('');
  const [rejectRestaurant, setRejectRestaurant] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processingId, setProcessingId] = useState(null);

  // Registration popup state.
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [creating, setCreating] = useState(false);

  const fetchRestaurants = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/admin/restaurants", {
        params: {
          search: search.trim(),
          approvalStatus: status || undefined,
          page,
          limit: 10,
        },
      });

      setRestaurants(response.data.data || []);
      setPagination(
        response.data.pagination || {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load restaurants. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => {
    fetchRestaurants();
  }, [fetchRestaurants]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleCreateRestaurant = async (e) => {
    e.preventDefault();

    try {
      setCreating(true);
      setError("");
      setSuccess("");

      const payload = {
        ...form,
        restaurantName: form.restaurantName.trim(),
        restaurantEmail: form.restaurantEmail.trim(),
        restaurantPhone: form.restaurantPhone.trim(),
        description: form.description.trim(),
        ownerFirstName: form.ownerFirstName.trim(),
        ownerLastName: form.ownerLastName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        ownerPhone: form.ownerPhone.trim(),
      };

      const response = await api.post("/admin/restaurants", payload);

      setSuccess(
        response.data.message || "Restaurant registered successfully.",
      );

      setForm(initialForm);
      setShowCreateModal(false);
      setStatus("");
      setSearch("");
      setPage(1);

      if (!/^[6-9]\d{9}$/.test(form.restaurantPhone)) {
        setError("Enter a valid 10-digit restaurant mobile number.");
        return;
      }

      if (form.ownerPhone && !/^[6-9]\d{9}$/.test(form.ownerPhone)) {
        setError("Enter a valid 10-digit owner mobile number.");
        return;
      }

      // Refresh the table with the new registration.
      await api
        .get("/admin/restaurants", {
          params: {
            page: 1,
            limit: 10,
          },
        })
        .then((result) => {
          setRestaurants(result.data.data || []);
          setPagination(result.data.pagination);
        });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to register restaurant. Please try again.",
      );
    } finally {
      setCreating(false);
    }
  };

  const updateStatus = async (restaurant, action, extraData = {}) => {
    const messages = {
      approve: "Restaurant approved successfully.",
      reject: "Restaurant rejected successfully.",
      suspend: "Restaurant suspended successfully.",
      reactivate: "Restaurant reactivated successfully.",
    };

    try {
      setProcessingId(restaurant.id);
      setError("");
      setSuccess("");

      await api.patch(
        `/admin/restaurants/${restaurant.id}/${action}`,
        extraData,
      );

      setSuccess(messages[action]);
      setRejectRestaurant(null);
      setRejectReason("");
      setSelectedRestaurant(null);

      await fetchRestaurants();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "The requested action could not be completed.",
      );
    } finally {
      setProcessingId(null);
    }
  };

  const updateListing = async (restaurant) => {
    const listingStatus = restaurant.listingStatus === "published" && restaurant.marketplaceEnabled
      ? "unlisted"
      : "published";
    try {
      setProcessingId(restaurant.id);
      setError("");
      setSuccess("");
      const response = await api.patch(`/admin/restaurants/${restaurant.id}/listing`, { listingStatus });
      setSuccess(response.data.message || "Marketplace listing updated.");
      await fetchRestaurants();
      if (selectedRestaurant?.id === restaurant.id) {
        const detail = await api.get(`/admin/restaurants/${restaurant.id}`);
        setSelectedRestaurant(detail.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || "The marketplace listing could not be updated.");
    } finally {
      setProcessingId(null);
    }
  };

  const openDetails = async (restaurant) => {
    try {
      const response = await api.get(`/admin/restaurants/${restaurant.id}`);

      setSelectedRestaurant(response.data.data);
      setRestaurantBranches([]);
      setBranchesError('');
      setBranchesLoading(true);
      try {
        const branchesResponse = await api.get(`/admin/restaurants/${restaurant.id}/branches`);
        setRestaurantBranches(branchesResponse.data.data || []);
      } catch (branchError) {
        setBranchesError(branchError.response?.data?.message || 'Unable to load branch details.');
      } finally {
        setBranchesLoading(false);
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to load restaurant details.",
      );
    }
  };

  const handleReject = () => {
    if (!rejectReason.trim()) return;

    updateStatus(rejectRestaurant, "reject", {
      reason: rejectReason.trim(),
    });
  };

  const changeFilter = (value) => {
    setStatus(value);
    setPage(1);
  };

  const changeSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  const closeCreateModal = () => {
    if (creating) return;

    setShowCreateModal(false);
    setForm(initialForm);
  };

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
            <span>Workspace</span>
            <span>/</span>
            <span>Management</span>
            <span>/</span>
            <span className="font-medium text-gray-800">Restaurants</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Restaurant Management
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage restaurant registrations, approvals and platform access.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={fetchRestaurants}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={() => {
              setError("");
              setSuccess("");
              setShowCreateModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-700"
          >
            <Plus size={17} />
            Register Restaurant
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total Restaurants",
            value: pagination.total,
            icon: Store,
            color: "text-orange-600",
            bg: "bg-orange-50",
          },
          {
            label: "Pending Approval",
            value: status === "pending" ? pagination.total : "—",
            icon: AlertCircle,
            color: "text-amber-600",
            bg: "bg-amber-50",
          },
          {
            label: "Approved",
            value: status === "approved" ? pagination.total : "—",
            icon: CheckCircle,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
          },
          {
            label: "Suspended",
            value: status === "suspended" ? pagination.total : "—",
            icon: Ban,
            color: "text-slate-600",
            bg: "bg-slate-100",
          },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{item.label}</p>
                  <h3 className="mt-2 text-2xl font-bold text-gray-900">
                    {item.value}
                  </h3>
                </div>

                <div className={`rounded-xl p-3 ${item.bg} ${item.color}`}>
                  <Icon size={22} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <span>{success}</span>
          <button onClick={() => setSuccess("")}>
            <X size={17} />
          </button>
        </div>
      )}

      {/* Restaurant table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-bold text-gray-900">All Restaurants</h2>
            <p className="mt-1 text-sm text-gray-500">
              Review and manage registered restaurants.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={search}
                onChange={(e) => changeSearch(e.target.value)}
                placeholder="Search restaurant..."
                className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 sm:w-64"
              />
            </div>

            <select
              value={status}
              onChange={(e) => changeFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-orange-400"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Restaurant</th>
                <th className="px-6 py-4 font-semibold">Contact</th>
                <th className="px-6 py-4 font-semibold">Approval</th>
                <th className="px-6 py-4 font-semibold">Marketplace</th>
                <th className="px-6 py-4 font-semibold">Registered</th>
                <th className="px-6 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-16 text-center">
                    <RefreshCw
                      className="mx-auto animate-spin text-orange-500"
                      size={25}
                    />
                    <p className="mt-3 text-sm text-gray-500">
                      Loading restaurants...
                    </p>
                  </td>
                </tr>
              ) : restaurants.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-16 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                      <Store size={26} />
                    </div>
                    <h3 className="mt-4 font-semibold text-gray-800">
                      No restaurants found
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Register a restaurant to get started.
                    </p>
                  </td>
                </tr>
              ) : (
                restaurants.map((restaurant) => (
                  <tr key={restaurant.id} className="hover:bg-gray-50/70">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {restaurant.logo ? (
                          <img
                            src={restaurant.logo}
                            alt={restaurant.name}
                            className="h-11 w-11 rounded-xl border border-gray-100 object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                            <Store size={20} />
                          </div>
                        )}

                        <div>
                          <p className="font-semibold text-gray-900">
                            {restaurant.name}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {restaurant.slug}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">
                        {restaurant.email || "—"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {restaurant.phone || "—"}
                      </p>
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge status={restaurant.approvalStatus} />
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`text-sm font-medium ${
                          restaurant.marketplaceEnabled
                            ? "text-emerald-600"
                            : "text-gray-500"
                        }`}
                      >
                        {restaurant.listingStatus === "published" && restaurant.marketplaceEnabled ? "Published" : restaurant.listingStatus || "Draft"}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(restaurant.createdAt)}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          title="View details"
                          onClick={() => openDetails(restaurant)}
                          className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-100"
                        >
                          <Eye size={16} />
                        </button>

                        {restaurant.approvalStatus === "pending" && (
                          <>
                            <button
                              title="Approve"
                              disabled={processingId === restaurant.id}
                              onClick={() =>
                                updateStatus(restaurant, "approve")
                              }
                              className="rounded-lg border border-emerald-200 p-2 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              <CheckCircle size={16} />
                            </button>

                            <button
                              title="Reject"
                              onClick={() => setRejectRestaurant(restaurant)}
                              className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}

                        {restaurant.approvalStatus === "approved" && (
                          <>
                          <button
                            title={restaurant.listingStatus === "published" && restaurant.marketplaceEnabled ? "Unpublish from marketplace" : "Publish to marketplace"}
                            disabled={processingId === restaurant.id}
                            onClick={() => updateListing(restaurant)}
                            className="rounded-lg border border-orange-200 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                          >
                            {restaurant.listingStatus === "published" && restaurant.marketplaceEnabled ? "Unpublish" : "Publish"}
                          </button>
                          <button
                            title="Suspend"
                            disabled={processingId === restaurant.id}
                            onClick={() => {
                              if (
                                window.confirm(`Suspend ${restaurant.name}?`)
                              ) {
                                updateStatus(restaurant, "suspend");
                              }
                            }}
                            className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                          >
                            <Ban size={16} />
                          </button>
                          </>
                        )}

                        {restaurant.approvalStatus === "suspended" && (
                          <button
                            title="Reactivate"
                            disabled={processingId === restaurant.id}
                            onClick={() =>
                              updateStatus(restaurant, "reactivate")
                            }
                            className="rounded-lg border border-emerald-200 p-2 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            Showing {restaurants.length ? (page - 1) * 10 + 1 : 0} to{" "}
            {(page - 1) * 10 + restaurants.length} of {pagination.total}{" "}
            restaurants
          </p>

          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
              className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={17} />
            </button>

            <span className="px-3 text-sm font-medium text-gray-700">
              Page {page} of {Math.max(pagination.totalPages, 1)}
            </span>

            <button
              disabled={page >= pagination.totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>

      {/* Register Restaurant Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Register New Restaurant
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Add restaurant information and its owner account.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creating}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X size={21} />
              </button>
            </div>

            <form onSubmit={handleCreateRestaurant} className="space-y-6 p-6">
              {/* Restaurant information */}
              <section>
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
                    <Building2 size={21} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">
                      Restaurant Information
                    </h3>
                    <p className="text-xs text-gray-500">
                      Basic details of the restaurant.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label="Restaurant Name"
                    name="restaurantName"
                    value={form.restaurantName}
                    onChange={handleFormChange}
                    placeholder="e.g. Pizza House"
                    required
                  />

                  <FormField
                    label="Restaurant Email"
                    name="restaurantEmail"
                    type="email"
                    value={form.restaurantEmail}
                    onChange={handleFormChange}
                    placeholder="restaurant@example.com"
                    required
                  />

                  <FormField
                    label="Restaurant Phone"
                    name="restaurantPhone"
                    type="tel"
                    value={form.restaurantPhone}
                    onChange={(e) => {
                      const value = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 10);
                      setForm((current) => ({
                        ...current,
                        restaurantPhone: value,
                      }));
                    }}
                    placeholder="Enter 10-digit mobile number"
                    required
                  />

                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={handleFormChange}
                      rows={3}
                      placeholder="Write a short description about the restaurant..."
                      className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>
                </div>
              </section>

              <div className="border-t border-gray-100" />

              {/* Owner information */}
              <section>
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                    <User size={21} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">
                      Restaurant Owner
                    </h3>
                    <p className="text-xs text-gray-500">
                      Login account details for the restaurant owner.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label="First Name"
                    name="ownerFirstName"
                    value={form.ownerFirstName}
                    onChange={handleFormChange}
                    placeholder="Owner first name"
                    required
                  />

                  <FormField
                    label="Last Name"
                    name="ownerLastName"
                    value={form.ownerLastName}
                    onChange={handleFormChange}
                    placeholder="Owner last name"
                    required
                  />

                  <FormField
                    label="Owner Email"
                    name="ownerEmail"
                    type="email"
                    value={form.ownerEmail}
                    onChange={handleFormChange}
                    placeholder="owner@example.com"
                    required
                  />

                  <FormField
                    label="Owner Phone"
                    name="ownerPhone"
                    type="tel"
                    value={form.ownerPhone}
                    onChange={(e) => {
                      const value = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 10);
                      setForm((current) => ({
                        ...current,
                        ownerPhone: value,
                      }));
                    }}
                    placeholder="Enter 10-digit mobile number"
                  />
                </div>
              </section>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex gap-3">
                  <AlertCircle size={20} className="shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      Pending approval
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-700">
                      The restaurant will be created with Pending Approval
                      status. The owner's account will remain pending until the
                      secure account setup process is completed.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creating}
                  className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <Plus size={17} />
                      Register Restaurant
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restaurant Details Modal */}
      {selectedRestaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <h2 className="text-lg font-bold text-gray-900">
                Restaurant Details
              </h2>
              <button
                onClick={() => setSelectedRestaurant(null)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="flex items-center gap-4">
                {selectedRestaurant.logo ? (
                  <img
                    src={selectedRestaurant.logo}
                    alt={selectedRestaurant.name}
                    className="h-16 w-16 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                    <Store size={28} />
                  </div>
                )}

                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedRestaurant.name}
                  </h3>
                  <StatusBadge status={selectedRestaurant.approvalStatus} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-gray-50 p-4">
                  <Mail size={17} className="mb-2 text-gray-500" />
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="mt-1 break-all text-sm font-medium">
                    {selectedRestaurant.email || "—"}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <Phone size={17} className="mb-2 text-gray-500" />
                  <p className="text-xs text-gray-500">Phone</p>
                  <p className="mt-1 text-sm font-medium">
                    {selectedRestaurant.phone || "—"}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <CalendarDays size={17} className="mb-2 text-gray-500" />
                  <p className="text-xs text-gray-500">Registration Date</p>
                  <p className="mt-1 text-sm font-medium">
                    {formatDate(selectedRestaurant.createdAt)}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <Store size={17} className="mb-2 text-gray-500" />
                  <p className="text-xs text-gray-500">Marketplace</p>
                  <p className="mt-1 text-sm font-medium">
                    {selectedRestaurant.marketplaceEnabled
                      ? "Enabled"
                      : "Disabled"}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">
                  Description
                </p>
                <p className="mt-2 text-sm leading-6 text-gray-700">
                  {selectedRestaurant.description || "No description provided."}
                </p>
              </div>

              {selectedRestaurant.rejectionReason && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-700">
                    Rejection reason
                  </p>
                  <p className="mt-1 text-sm text-red-600">
                    {selectedRestaurant.rejectionReason}
                  </p>
                </div>
              )}

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Branches</p>
                    <p className="mt-1 text-xs text-gray-400">Read-only location and status information</p>
                  </div>
                  <Building2 size={18} className="text-orange-500" />
                </div>
                {branchesLoading ? (
                  <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">Loading branches…</p>
                ) : branchesError ? (
                  <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{branchesError}</p>
                ) : restaurantBranches.length ? (
                  <div className="space-y-2">
                    {restaurantBranches.map((branch) => (
                      <div key={branch.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-800">{branch.name}</p>
                          <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold text-gray-600">{branch.branchCode}</span>
                          {branch.isPrimary && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">Primary</span>}
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${branch.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{branch.isActive ? 'Active' : 'Inactive'}</span>
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-blue-700">{String(branch.operationalStatus || 'closed').replaceAll('_', ' ')}</span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600">{[branch.addressLine, branch.addressLine2, branch.landmark, branch.city, branch.state, branch.postalCode, branch.country].filter(Boolean).join(', ')}</p>
                        <p className="mt-1 text-xs text-gray-500">{branch.phone}{branch.email ? ` · ${branch.email}` : ''}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">No branches have been added.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectRestaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Reject Restaurant
              </h2>
              <button
                onClick={() => {
                  setRejectRestaurant(null);
                  setRejectReason("");
                }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X size={19} />
              </button>
            </div>

            <p className="mt-2 text-sm text-gray-500">
              Provide a reason for rejecting{" "}
              <strong>{rejectRestaurant.name}</strong>.
            </p>

            <textarea
              rows="4"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="mt-5 w-full resize-none rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  setRejectRestaurant(null);
                  setRejectReason("");
                }}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                disabled={
                  !rejectReason.trim() || processingId === rejectRestaurant.id
                }
                onClick={handleReject}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
