
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { api } from '../services/api';
import { hasDeliveryEmployeeAccess } from '../portals/restaurant/deliveryAccess';

const AuthContext = createContext(null);

/**
 * Get all roles assigned to a user.
 * Includes global roles and active restaurant membership roles.
 */
export function getUserRoles(user) {
  const globalRoles =
    user?.roles?.map((role) =>
      typeof role === 'string' ? role : role?.code
    ).filter(Boolean) || [];

  const membershipRoles =
    user?.restaurantMemberships
      ?.filter((membership) => membership.status === 'active')
      ?.map((membership) => {
        const role = membership.role;

        return typeof role === 'string' ? role : role?.code;
      })
      ?.filter(Boolean) || [];

  return [...new Set([...globalRoles, ...membershipRoles])];
}

/**
 * Determine the correct dashboard based on actual user roles.
 */
export function homePath(user) {
  const roles = getUserRoles(user);

  if (roles.includes('super_admin')) {
    return '/admin/dashboard';
  }

  if (roles.includes('restaurant_owner')) {
    return '/restaurant/dashboard';
  }

  if (hasDeliveryEmployeeAccess(user)) {
    return '/restaurant/delivery/dashboard';
  }

  if (roles.includes('manager')) {
    return '/restaurant/manager';
  }

  if (roles.includes('waiter')) {
    return '/restaurant/waiter';
  }

  if (roles.includes('kitchen_staff')) {
    return '/restaurant/kitchen';
  }

  if (roles.includes('cashier')) {
    const membership = user?.restaurantMemberships?.find((item) => item.status === 'active');
    const permissions = (membership?.role?.permissions || []).map((permission) => typeof permission === 'string' ? permission : permission?.code);
    return permissions.includes('pos.access') ? '/restaurant/pos' : '/restaurant/orders';
  }

  if (roles.includes('delivery_partner')) {
    return '/delivery/dashboard';
  }

  if (roles.includes('customer')) {
    return '/customer/dashboard';
  }

  return '/unauthorized';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * Fetch authenticated user from existing backend session.
   */
  const fetchUser = useCallback(async () => {
    try {
      const response = await api.get('/auth/me');

      const authenticatedUser = response.data?.user;

      if (!authenticatedUser) {
        setUser(null);
        return null;
      }

      setUser(authenticatedUser);

      return authenticatedUser;
    } catch (error) {
      setUser(null);
      return null;
    }
  }, []);

  /**
   * Initialize authentication when application loads.
   */
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        await fetchUser();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
    };
  }, [fetchUser]);

  /**
   * Existing login API.
   */
  const login = async (email, password, options = {}) => {
    await api.post('/auth/login', {
      email,
      password,
      ...(options.portal ? { portal: options.portal } : {}),
    });

    const authenticatedUser = await fetchUser();

    if (!authenticatedUser) {
      throw new Error(
        'Login succeeded, but your session could not be verified.'
      );
    }

    return authenticatedUser;
  };

  /**
   * Logout using existing backend session.
   */
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used inside AuthProvider.'
    );
  }

  return context;
}
