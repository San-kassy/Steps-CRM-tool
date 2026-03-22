import { createContext, useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import apiService from "../services/api";
import { toast } from "react-hot-toast";

const AuthContext = createContext(null);

// Session configuration
const SESSION_CONFIG = {
  rememberMe: false,
  lastActivity: null,
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const storedUser = localStorage.getItem("authUser");
      return storedUser ? JSON.parse(storedUser) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!localStorage.getItem("authToken"),
  );
  const [_sessionConfig, setSessionConfig] = useState(SESSION_CONFIG);

  // Update last activity timestamp
  const updateActivity = useCallback(() => {
    if (isAuthenticated) {
      const now = Date.now();
      setSessionConfig((prev) => ({ ...prev, lastActivity: now }));
      localStorage.setItem("lastActivity", now.toString());
    }
  }, [isAuthenticated]);

  // Track user activity to maintain session
  useEffect(() => {
    if (isAuthenticated) {
      const events = ["mousedown", "keydown", "scroll", "touchstart"];
      events.forEach((event) => {
        document.addEventListener(event, updateActivity);
      });

      return () => {
        events.forEach((event) => {
          document.removeEventListener(event, updateActivity);
        });
      };
    }
  }, [isAuthenticated, updateActivity]);

  // Check if user is already logged in on mount
  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch user permissions every 60 seconds so Admin-granted/revoked access
  // takes effect without requiring the user to re-login.
  useEffect(() => {
    if (!isAuthenticated) return;

    const permissionsInterval = setInterval(async () => {
      try {
        const response = await apiService.get("/api/auth/verify");
        if (response.success && response.data?.user) {
          // Only update the user object — don't touch token or other session state
          setUser((prev) => ({
            ...prev,
            ...response.data.user,
          }));
        }
      } catch (error) {
        // If the server explicitly rejected the token (401) or deactivated the account (403), log out immediately
        if (error.response?.status === 401 || error.response?.status === 403) {
          setUser(null);
          setIsAuthenticated(false);
          localStorage.removeItem("authToken");
          localStorage.removeItem("authUser");
        }
        // Otherwise, silently ignore network blips
      }
    }, 60000); // every 60 seconds

    return () => clearInterval(permissionsInterval);
  }, [isAuthenticated]);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (token) {
        // Get remember me preference
        const rememberMe = localStorage.getItem("rememberMe") === "true";
        const lastActivity = localStorage.getItem("lastActivity");

        setSessionConfig({
          rememberMe,
          lastActivity: lastActivity ? parseInt(lastActivity) : null,
        });

        // Verify token with backend
        const response = await apiService.get("/api/auth/verify");
        if (response.success) {
          setUser(response.data.user);
          setIsAuthenticated(true);
          updateActivity();
        } else {
          // Token invalid but don't auto-logout - let user manually logout or try to use the app
          console.warn("Token verification failed:", response.error);
          setUser(null);
          setIsAuthenticated(false);
          localStorage.removeItem("authToken");
          localStorage.removeItem("authUser");
        }
      }
    } catch (error) {
      // Clear auth on explicit server rejection (401) or deactivated account (403)
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.error("Auth check failed - unauthorized or deactivated:", error);
        setUser(null);
        setIsAuthenticated(false);
        localStorage.removeItem("authToken");
        localStorage.removeItem("authUser");
      } else {
        // Network error or other issue - keep user logged in
        console.warn("Auth check failed (network issue):", error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password, rememberMe = false) => {
    try {
      const response = await apiService.post("/api/auth/login", {
        email,
        password,
      });
      if (response && response.success) {
        // Check if MFA verification is needed
        if (response.mfaRequired) {
          return {
            success: true,
            mfaRequired: true,
            mfaPendingToken: response.data.mfaPendingToken,
          };
        }

        // Check if MFA setup is required by org policy
        if (response.mfaSetupRequired) {
          localStorage.setItem("authToken", response.data.token);
          localStorage.setItem("authUser", JSON.stringify(response.data.user));
          localStorage.setItem("rememberMe", rememberMe.toString());
          setUser(response.data.user);
          setIsAuthenticated(true);
          setSessionConfig((prev) => ({ ...prev, rememberMe }));
          updateActivity();
          return { success: true, mfaSetupRequired: true };
        }

        // Normal login — store token
        localStorage.setItem("authToken", response.data.token);
        localStorage.setItem("authUser", JSON.stringify(response.data.user));
        localStorage.setItem("rememberMe", rememberMe.toString());

        setUser(response.data.user);
        setIsAuthenticated(true);
        setSessionConfig((prev) => ({ ...prev, rememberMe }));
        updateActivity();

        return { success: true };
      }
      return { success: false, error: response?.error || "Login failed" };
    } catch (error) {
      console.error("Login error:", error);
      const serverMsg = error.serverData?.error || error.serverData?.message;
      return {
        success: false,
        error: serverMsg || error.message || "Login failed",
      };
    }
  };

  const verifyMfa = async (mfaPendingToken, code, rememberMe = false) => {
    try {
      const response = await apiService.post("/api/auth/mfa-verify", {
        mfaPendingToken,
        code,
      });
      if (response && response.success) {
        localStorage.setItem("authToken", response.data.token);
        localStorage.setItem("authUser", JSON.stringify(response.data.user));
        localStorage.setItem("rememberMe", rememberMe.toString());
        setUser(response.data.user);
        setIsAuthenticated(true);
        setSessionConfig((prev) => ({ ...prev, rememberMe }));
        updateActivity();
        return {
          success: true,
          usedBackupCode: response.usedBackupCode,
          remainingBackupCodes: response.remainingBackupCodes,
        };
      }
      return {
        success: false,
        error: response?.error || "MFA verification failed",
      };
    } catch (error) {
      console.error("MFA verify error:", error);
      const serverMsg = error.serverData?.error || error.serverData?.message;
      return {
        success: false,
        error: serverMsg || error.message || "MFA verification failed",
      };
    }
  };

  const signup = async (userData) => {
    try {
      const response = await apiService.post("/api/auth/signup", userData);
      // response is now the response body (thanks to interceptor)
      if (response && response.success) {
        localStorage.setItem("authToken", response.data.token);
        localStorage.setItem("authUser", JSON.stringify(response.data.user));
        setUser(response.data.user);
        setIsAuthenticated(true);
        return { success: true };
      }
      return { success: false, error: response?.error || "Signup failed" };
    } catch (error) {
      console.error("Signup error:", error);
      // Prefer server-sent error messages when available
      const serverMsg = error.serverData?.error || error.serverData?.message;
      return {
        success: false,
        error: serverMsg || error.message || "Signup failed",
      };
    }
  };

  const logout = async (_skipConfirmation = false) => {
    try {
      // Notify backend of logout
      await apiService.post("/api/auth/logout");

      toast.success("Logged out successfully");
    } catch (error) {
      console.error("Logout error:", error);
      // Still logout on frontend even if backend call fails
    } finally {
      // Clear all auth data
      localStorage.removeItem("authToken");
      localStorage.removeItem("authUser");
      localStorage.removeItem("rememberMe");
      localStorage.removeItem("lastActivity");
      setUser(null);
      setIsAuthenticated(false);
      setSessionConfig(SESSION_CONFIG);
    }
    return { success: true };
  };

  const resetPassword = async (email) => {
    try {
      const response = await apiService.post("/api/auth/forgot-password", {
        email,
      });
      return response;
    } catch (error) {
      console.error("Reset password error:", error);
      return {
        success: false,
        error: error.message || "Failed to send reset email",
      };
    }
  };

  const updatePassword = async (token, newPassword) => {
    try {
      const response = await apiService.post("/api/auth/reset-password", {
        token,
        newPassword,
      });
      return response;
    } catch (error) {
      console.error("Update password error:", error);
      return {
        success: false,
        error: error.message || "Failed to update password",
      };
    }
  };

  // Force logout without confirmation (for security reasons)
  const forceLogout = async () => {
    console.warn("Force logout triggered");
    await logout(true);
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    verifyMfa,
    signup,
    logout,
    forceLogout,
    resetPassword,
    updatePassword,
    checkAuth,
    updateActivity,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AuthContext;
