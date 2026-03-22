import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  Suspense,
  lazy,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useAppContext } from "../context/useAppContext";
import Navbar from "../components/Navbar";
import Breadcrumb from "../components/Breadcrumb";
import { apiService } from "../services/api";
import Footer from "../components/Footer";
import PurchaseOrders from "../components/modules/PurchaseOrders";
import Finance from "../components/modules/Finance";
import ModuleLoader from "../components/common/ModuleLoader";

const ModuleLoadingState = ({ moduleName = "Module", subtitle }) => {
  return <ModuleLoader moduleName={moduleName} subtitle={subtitle} />;
};

const ModuleEntryGate = ({ moduleId, moduleName, children }) => {
  const [isEntering, setIsEntering] = useState(true);

  useEffect(() => {
    setIsEntering(true);
    const timer = setTimeout(() => setIsEntering(false), 220);
    return () => clearTimeout(timer);
  }, [moduleId, moduleName]);

  if (isEntering) {
    return <ModuleLoadingState moduleName={moduleName} />;
  }

  return children;
};

// Custom Error Boundary for Module Loading
class ModuleErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, reloadAttempted: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Module loading error:", error, errorInfo);

    // Auto-reload once if not already attempted
    if (!this.state.reloadAttempted) {
      this.setState({ reloadAttempted: true });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  }

  render() {
    if (this.state.hasError) {
      if (!this.state.reloadAttempted) {
        return (
          <ModuleLoadingState
            moduleName={this.props.moduleName || "Module"}
            subtitle="Recovering from a loading error..."
          />
        );
      }

      return this.props.fallback;
    }

    return this.props.children;
  }
}

// Dynamically load module components with fallback mapping for renamed modules
const loadModuleComponent = (componentName) => {
  if (!componentName) return null;

  const normalizedComponentName = String(componentName)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  // Aliases keep old DB module names working after component renames.
  const componentAliasMap = {
    financereports: "Finance",
    admincontrols: "Admin",
    admincontrol: "Admin",
    signaturemanagement: "DocSign",
    security: "PhysicalSecurity",
  };

  const finalComponentName =
    componentAliasMap[normalizedComponentName] || componentName;

  const eagerComponents = {
    PurchaseOrders,
    Finance,
  };

  if (eagerComponents[finalComponentName]) {
    return eagerComponents[finalComponentName];
  }

  try {
    return lazy(() =>
      import(`../components/modules/${finalComponentName}.jsx`).catch(
        (error) => {
          console.error(
            `Failed to load component: ${finalComponentName}`,
            error,
          );
          throw error; // Re-throw to trigger Suspense error boundary
        },
      ),
    );
  } catch (error) {
    console.error(`Failed to load component: ${finalComponentName}`, error);
    return null;
  }
};

// Tailwind-powered Home screen (no external CSS)
const iconMap = {
  Finance: { icon: "fa-university", color: "purple" },
  Accounting: { icon: "fa-receipt", color: "purple" },
  FM: { icon: "fa-building", color: "blue" },
  Approval: { icon: "fa-check-circle", color: "orange" },
  "Material Requests": { icon: "fa-boxes", color: "green" },
  "Purchase Orders": { icon: "fa-cart-shopping", color: "indigo" },
  Inventory: { icon: "fa-warehouse", color: "teal" },
  Analytics: { icon: "fa-chart-line", color: "cyan" },
  Attendance: { icon: "fa-id-badge", color: "emerald" },
  HRM: { icon: "fa-people-group", color: "rose" },
  Security: { icon: "fa-lock", color: "red" },
  "Incident Reporting": { icon: "fa-triangle-exclamation", color: "red" },
  DocSign: { icon: "fa-pen-fancy", color: "pink" },
  // "": { icon: "fa-pen-fancy", color: "pink" },
  Admin: { icon: "fa-sliders", color: "gray" },
  Policy: { icon: "fa-file-shield", color: "gray" },
  Budget: { icon: "fa-wallet", color: "blue" },
};

const normalizeModuleKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const legacyModuleKeysById = {
  5: ["finance"],
  9: ["docsign"],
  11: ["purchaseorders", "purchaseordersmodule"],
};

const legacyModuleLabelById = {
  5: "Finance",
  9: "DocSign",
  11: "Purchase Orders",
};

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id } = useParams();
  const { hasModuleAccess } = useAppContext();

  const [search, setSearch] = useState("");
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Removed unused statCards state

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const modsRes = await apiService.get("/api/modules");
        if (!mounted) return;
        // apiService interceptor already returns response body, not { data: ... }
        const mods = modsRes || [];
        setModules(mods);
      } catch (err) {
        if (mounted) setError(err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return modules.filter((m) => m.name.toLowerCase().includes(q));
  }, [modules, search]);

  const getModuleRouteId = useCallback((module) => {
    if (!module) return "";
    return String(module.id ?? module._id ?? "");
  }, []);

  const handleOpenModule = (moduleId) => {
    navigate(`/home/${moduleId}`);
  };

  // Memoize module component to prevent remount on parent re-render
  const moduleRouteId = id ? String(id) : "";
  const found = useMemo(() => {
    if (!moduleRouteId) return null;

    const matchedModule = (modules || []).find(
      (m) => getModuleRouteId(m) === moduleRouteId,
    );
    if (matchedModule) return matchedModule;

    const legacyKeys = legacyModuleKeysById[moduleRouteId] || [];
    if (legacyKeys.length === 0) return null;

    return (
      (modules || []).find((m) => {
        const componentKey = normalizeModuleKey(m.componentName);
        const nameKey = normalizeModuleKey(m.name);
        return (
          legacyKeys.includes(componentKey) || legacyKeys.includes(nameKey)
        );
      }) || null
    );
  }, [moduleRouteId, modules, getModuleRouteId]);

  const ModuleComp = useMemo(() => {
    if (!found) return null;
    return loadModuleComponent(found.componentName || found.name);
  }, [found]);

  const requestedModuleName = useMemo(() => {
    if (found?.name) return found.name;
    if (moduleRouteId && legacyModuleLabelById[moduleRouteId]) {
      return legacyModuleLabelById[moduleRouteId];
    }

    const matchedModule = (modules || []).find(
      (m) => getModuleRouteId(m) === moduleRouteId,
    );
    return matchedModule?.name || "Module";
  }, [found, moduleRouteId, modules, getModuleRouteId]);

  // Auto-retry fetching modules when server comes back online
  useEffect(() => {
    if (!error || !id) return;
    const interval = setInterval(async () => {
      try {
        const modsRes = await apiService.get("/api/modules");
        const mods = modsRes || [];
        if (mods.length > 0) {
          setModules(mods);
          setError(null);
          setLoading(false);
        }
      } catch {
        // Still offline, keep retrying
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [error, id]);

  // ===== MODULE DETAIL VIEW =====
  if (id) {
    // Still loading or server error — show spinner instead of "not found"
    if (loading || (error && modules.length === 0)) {
      return (
        <div className="min-h-screen flex flex-col">
          <Navbar user={user} />
          <div className="flex-1 relative">
            <ModuleLoadingState
              moduleName={requestedModuleName}
              subtitle={
                error ? "Waiting for server connection..." : "Please wait"
              }
            />
          </div>
        </div>
      );
    }

    // Module genuinely not found (modules loaded but ID doesn't match)
    if (!found) {
      return (
        <div className="min-h-screen flex flex-col">
          <Navbar user={user} />
          <div className="flex-1 flex items-center justify-center px-4 py-10">
            <div className="text-center">
              <h3 className="text-xl font-bold mb-2 text-[#111418]">
                Module Not Found
              </h3>
              <p className="text-sm text-[#617589] mb-6">
                No module with id {id}
              </p>
              <button
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-md border border-blue-600 text-blue-700 hover:bg-blue-50"
                onClick={() => navigate("/home")}
              >
                <i className="fa-solid fa-home text-base"></i>
                Back to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Check access permission
    if (!hasModuleAccess(found.name)) {
      return (
        <div className="min-h-screen flex flex-col">
          <Navbar user={user} />
          <div className="flex-1 flex items-center justify-center px-4 py-10">
            <div className="inline-block rounded-md border border-yellow-300 bg-yellow-50 text-yellow-800 px-6 py-4 text-center">
              <h3 className="text-lg font-bold mb-2">🔒 Access Denied</h3>
              <p className="text-sm mb-3 text-[#617589]">
                You do not have permission to access the{" "}
                <strong>{found.name}</strong> module.
              </p>
              <button
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-md border border-blue-600 text-blue-700 hover:bg-blue-50"
                onClick={() => navigate("/home")}
              >
                <i className="fa-solid fa-home text-base"></i>
                Back to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Render module with memoized component to prevent reload on parent re-render
    if (ModuleComp) {
      return (
        <div className="min-h-screen flex flex-col">
          <Navbar user={user} />
          <div className="flex-1">
            <ModuleErrorBoundary
              moduleName={found.name}
              fallback={
                <div className="flex-1 flex items-center justify-center px-4 py-10">
                  <div className="text-center max-w-md">
                    <h3 className="text-xl font-bold mb-2 text-[#111418]">
                      ⚠️ Module Not Available
                    </h3>
                    <p className="text-sm text-[#617589] mb-4">
                      The <strong>{found.name}</strong> module could not be
                      loaded. This may be because the component file is missing
                      or there's a build issue.
                    </p>
                    <div className="flex gap-3 justify-center">
                      <button
                        className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() => window.location.reload()}
                      >
                        <i className="fa-solid fa-rotate-right text-base"></i>
                        Try Again
                      </button>
                      <button
                        className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-md border border-blue-600 text-blue-700 hover:bg-blue-50"
                        onClick={() => navigate("/home")}
                      >
                        <i className="fa-solid fa-home text-base"></i>
                        Back to Home
                      </button>
                    </div>
                  </div>
                </div>
              }
            >
              <Suspense
                key={id}
                fallback={<ModuleLoadingState moduleName={found.name} />}
              >
                <ModuleEntryGate moduleId={id} moduleName={found.name}>
                  <ModuleComp />
                </ModuleEntryGate>
              </Suspense>
            </ModuleErrorBoundary>
          </div>
        </div>
      );
    }

    // Module not available
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar user={user} />
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="inline-block rounded-md border border-yellow-300 bg-yellow-50 text-yellow-800 px-6 py-4 text-center">
            <h3 className="text-lg font-bold mb-2">⚠️ Module Not Available</h3>
            <p className="text-sm mb-3 text-[#617589]">
              The <strong>{found.name}</strong> module is currently under
              development.
            </p>
            <button
              className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-md border border-blue-600 text-blue-700 hover:bg-blue-50"
              onClick={() => navigate("/home")}
            >
              <i className="fa-solid fa-home text-base"></i>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== HOME LIST VIEW =====
  return (
    <div className="min-h-screen flex flex-col bg-background-light text-[#111418] font-display">
      {/* Navbar */}
      <Navbar user={user} />

      {/* Main */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col items-center justify-center">
        <div className="text-center max-w-2xl mx-auto mb-16 w-full flex flex-col items-center">
          {/* Search */}
          <div className="relative w-full max-w-lg mb-10 group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <i className="fa-solid fa-magnifying-glass text-gray-400 group-focus-within:text-primary transition-colors"></i>
            </div>
            <input
              aria-label="Search"
              className="block w-full pl-12 pr-4 py-4 rounded-full border border-[#dbe0e6] bg-white text-[#111418] placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-primary shadow-sm hover:shadow-md transition-all duration-200"
              placeholder="Search modules, documents, or tasks..."
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-[#111418] mb-4 tracking-tight">
            Welcome{user?.firstName ? `, ${user.firstName}` : ""}
          </h1>
          <p className="text-lg text-[#617589]">
            Select a module to launch your workspace.
          </p>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl rounded-xl border border-[#dbe0e6] p-6 bg-white shadow-sm">
          {loading &&
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="relative flex flex-col items-center p-8 bg-transparent rounded-2xl border border-[#dbe0e6] shadow-sm h-[260px]"
              >
                <div className="size-24 rounded-full bg-gray-100 mb-6" />
                <div className="h-4 w-40 bg-gray-200 rounded-full mb-2" />
                <div className="h-3 w-24 bg-gray-200 rounded-full" />
              </div>
            ))}

          {!loading && error && (
            <div className="col-span-full text-center text-red-600">
              Failed to load modules. Please try again.
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="col-span-full text-center text-gray-600">
              No modules match your search.
            </div>
          )}

          {!loading &&
            !error &&
            filtered.length > 0 &&
            filtered.map((m) => {
              const icon = iconMap[m.name] || {
                icon: "fa-cube",
                color: "gray",
              };
              const colorClass =
                {
                  blue: "from-blue-50 to-blue-100 text-blue-600 border-blue-100",
                  orange:
                    "from-orange-50 to-orange-100 text-orange-600 border-orange-100",
                  green:
                    "from-green-50 to-green-100 text-green-600 border-green-100",
                  purple:
                    "from-purple-50 to-purple-100 text-purple-600 border-purple-100",
                  indigo:
                    "from-indigo-50 to-indigo-100 text-indigo-600 border-indigo-100",
                  teal: "from-teal-50 to-teal-100 text-teal-600 border-teal-100",
                  cyan: "from-cyan-50 to-cyan-100 text-cyan-600 border-cyan-100",
                  emerald:
                    "from-emerald-50 to-emerald-100 text-emerald-600 border-emerald-100",
                  rose: "from-rose-50 to-rose-100 text-rose-600 border-rose-100",
                  red: "from-red-50 to-red-100 text-red-600 border-red-100",
                  pink: "from-pink-50 to-pink-100 text-pink-600 border-pink-100",
                  gray: "from-gray-50 to-gray-100 text-gray-600 border-gray-100",
                }[icon.color] ||
                "from-gray-50 to-gray-100 text-gray-600 border-gray-100";

              return (
                <button
                  key={getModuleRouteId(m) || m.name}
                  onClick={() => handleOpenModule(getModuleRouteId(m))}
                  aria-label={`Open ${m.name} module`}
                  className="group relative flex flex-col items-center p-2 bg-transparent rounded-2xl border border-[#dbe0e6] shadow-sm h-[200px] hover:shadow-xl transition-shadow"
                >
                  <div
                    className={`size-20 bg-gradient-to-br ${colorClass} flex items-center justify-center mb-6 shadow-sm border rounded-full border-transparent group-hover:border-current transition-colors`}
                  >
                    <i className={`fa-solid ${icon.icon} text-5xl p-3`}></i>
                  </div>
                  <h3 className="text-xl font-bold text-[#111418] mb-2">
                    {m.name}
                  </h3>
                  <p className="text-sm text-[#617589] text-center">
                    {/* Click to access this module */}
                  </p>
                  <div className="mt-4 py-1 px-3 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                    Explore
                  </div>
                </button>
              );
            })}
        </div>
      </main>

      <Footer variant="default" company="Ladeil Innovataion Ltd" />
    </div>
  );
}
