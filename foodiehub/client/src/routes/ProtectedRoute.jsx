
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, getUserRoles } from '../context/AuthContext';

export default function ProtectedRoute({
  children,
  allowedRoles = [],
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />

          <p className="text-sm text-slate-500">
            Loading FoodieHub...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  const userRoles = getUserRoles(user);

  const hasAccess =
    allowedRoles.length === 0 ||
    allowedRoles.some((role) => userRoles.includes(role));

  if (!hasAccess) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
