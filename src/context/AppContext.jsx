import React, { createContext, useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { useAuth } from "./useAuth";
import { apiService } from "../services/api";

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [userRole, setUserRole] = useState("user");
  const [notifications, setNotifications] = useState([]);
  const [searchHistory, setSearchHistory] = useState(() => {
    const saved = localStorage.getItem("searchHistory");
    return saved ? JSON.parse(saved) : [];
  });

  // Retirement page header state (persisted)
  const [monthYear, setMonthYear] = useState(() => {
    const stored = localStorage.getItem("retirement.monthYear");
    if (stored) return stored;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`; // default to current month
  });
  const [previousClosingBalance, setPreviousClosingBalance] = useState(() => {
    const v = localStorage.getItem("retirement.previousClosingBalance");
    return v !== null ? v : "";
  });
  const [inflowAmount, setInflowAmount] = useState(() => {
    const v = localStorage.getItem("retirement.inflowAmount");
    return v !== null ? v : "";
  });

  // No theme support: removed theme state and DOM data-theme manipulation.

  // Add to search history
  const addSearchHistory = (query) => {
    if (!query.trim()) return;

    const newHistory = [
      query,
      ...searchHistory.filter((q) => q !== query),
    ].slice(0, 10);
    setSearchHistory(newHistory);
    localStorage.setItem("searchHistory", JSON.stringify(newHistory));
  };

  const { user, isAuthenticated, loading } = useAuth();

  const normalizeRole = (role) => {
    const raw = (role || "").toString().trim().toLowerCase();
    if (!raw) return "user";
    if (raw === "admin" || raw === "security admin") return "admin";
    if (raw === "editor") return "manager";
    if (raw === "viewer" || raw === "security analyst" || raw === "user")
      return "user";
    return "user";
  };

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      return;
    }

    try {
      const response = await apiService.get("/api/notifications?limit=50");
      const list = Array.isArray(response?.notifications)
        ? response.notifications.map((n) => ({
            id: n._id,
            title: n.title,
            message: n.message,
            type: n.type || "info",
            timestamp: n.createdAt || new Date().toISOString(),
            read: !!n.read,
            category: n.category || "general",
            metadata: n.metadata || {},
          }))
        : [];
      setNotifications(list);
    } catch {
      // Keep UI usable even when notifications API is temporarily unavailable.
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated || !user) {
      setUserRole("user");
      return;
    }

    setUserRole(normalizeRole(user.role));
  }, [loading, isAuthenticated, user]);

  useEffect(() => {
    if (loading) return;
    fetchNotifications();

    if (!isAuthenticated) return;
    const intervalId = setInterval(fetchNotifications, 60000);
    return () => clearInterval(intervalId);
  }, [loading, isAuthenticated, fetchNotifications]);

  // Persist retirement header values
  useEffect(() => {
    localStorage.setItem("retirement.monthYear", monthYear || "");
  }, [monthYear]);

  useEffect(() => {
    localStorage.setItem(
      "retirement.previousClosingBalance",
      previousClosingBalance === "" ? "" : String(previousClosingBalance),
    );
  }, [previousClosingBalance]);

  useEffect(() => {
    localStorage.setItem(
      "retirement.inflowAmount",
      inflowAmount === "" ? "" : String(inflowAmount),
    );
  }, [inflowAmount]);

  // Clear search history
  const clearSearchHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem("searchHistory");
  };

  // Add notification
  const addNotification = (notification) => {
    const newNotification = {
      id: Date.now(),
      timestamp: new Date(),
      read: false,
      ...notification,
    };
    setNotifications((prev) => [newNotification, ...prev].slice(0, 50));
  };

  // Mark notification as read
  const markAsRead = (id) => {
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === id ? { ...notif, read: true } : notif)),
    );

    if (!isAuthenticated || !id) return;
    apiService.patch(`/api/notifications/${id}/read`).catch(() => {
      // No-op: optimistic UI should not break on transient network issues.
    });
  };

  // Clear all notifications
  const clearNotifications = () => {
    setNotifications([]);

    if (!isAuthenticated) return;
    apiService.post("/api/notifications/clear-all").catch(() => {
      // No-op: local clear is still useful when offline.
    });
  };

  // Check module access: per-user grants first, then role-based defaults
  const hasModuleAccess = (moduleName) => {
    // Admins always have full access
    const normalizedRole = (user?.role || "").toLowerCase();
    if (normalizedRole === "admin" || normalizedRole === "security admin") return true;

    // Check per-user module grants (set by Admin in user management)
    const userModules = user?.permissions?.modules;
    if (Array.isArray(userModules) && userModules.length > 0) {
      // If explicit per-user modules are set, use them exclusively
      return userModules.some(
        (m) => m.access === true && (
          m.moduleName === moduleName ||
          String(m.moduleName).toLowerCase() === String(moduleName).toLowerCase()
        )
      );
    }

    // Fall back to role-based defaults when no per-user overrides exist
    const rolePermissions = {
      user: [
        "Accounting",
        "Inventory",
        "Attendance",
        "Analytics",
        "Incident Reporting",
      ],
      manager: [
        "Accounting",
        "Inventory",
        "HR Management",
        "Attendance",
        "Finance",
        "Analytics",
        "Incident Reporting",
      ],
    };

    const allowedModules = rolePermissions[userRole] || [];
    return allowedModules.includes("*") || allowedModules.includes(moduleName);
  };

  const value = {
    userRole,
    setUserRole,
    notifications,
    addNotification,
    markAsRead,
    clearNotifications,
    searchHistory,
    addSearchHistory,
    clearSearchHistory,
    hasModuleAccess,
    // Retirement header values
    monthYear,
    setMonthYear,
    previousClosingBalance,
    setPreviousClosingBalance,
    inflowAmount,
    setInflowAmount,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

AppProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AppContext;
