import React, { useEffect, useMemo, useRef, useState } from "react";
import Breadcrumb from "../Breadcrumb";
import { apiService } from "../../services/api";
import toast from "react-hot-toast";
import { useAuth } from "../../context/useAuth";
import { useDepartments } from "../../context/useDepartments";
import Payroll from "./Payroll";
import EmployeeProfile from "./EmployeeProfile";
import BulkEditModal from "./BulkEditModal";
import DataTable from "../common/DataTable";

const StatCard = ({ label, icon, value, trend, trendType }) => (
  <div className="flex flex-col gap-1 rounded-xl p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
    <div className="flex justify-between items-start">
      <p className="text-slate-500 text-sm font-medium">{label}</p>
      <div
        className={`p-1.5 rounded ${
          trendType === "rose"
            ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
            : "bg-blue-50 dark:bg-blue-900/30 text-primary"
        }`}
      >
        <i className={`fa-solid fa-${icon} text-[20px]`}></i>
      </div>
    </div>
    <div className="flex items-end gap-2 mt-2">
      <p className="text-slate-900 dark:text-white text-2xl font-bold leading-tight">
        {value}
      </p>
      {trend !== undefined && (
        <span
          className={`text-xs font-bold mb-1 flex items-center px-1.5 py-0.5 rounded ${
            trend >= 0
              ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30"
              : "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30"
          }`}
        >
          <i
            className={`fa-solid ${
              trend >= 0 ? "fa-arrow-trend-up" : "fa-arrow-trend-down"
            } text-[14px]`}
          ></i>{" "}
          {Math.abs(trend)}%
        </span>
      )}
    </div>
  </div>
);

const HRM = () => {
  const { user } = useAuth();
  const {
    departments,
    loading: departmentsLoading,
    refresh: refreshDepartments,
  } = useDepartments();
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Department management state
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptModalMode, setDeptModalMode] = useState("add"); // "add" | "edit"
  const [editingDept, setEditingDept] = useState(null);
  const [deptForm, setDeptForm] = useState({
    name: "",
    code: "",
    icon: "fa-building",
    color: "#3B82F6",
  });
  const [deptSubmitting, setDeptSubmitting] = useState(false);
  const [deptDeleting, setDeptDeleting] = useState(null);

  const [requisitions, setRequisitions] = useState([]);
  const [analytics, setAnalytics] = useState({
    turnoverRates: [],
    months: [],
    newHires: 0,
  });
  const [range, setRange] = useState("6m");

  const [leaveRequests, setLeaveRequests] = useState([]);
  const [performance, setPerformance] = useState({
    q3CompletedPct: 0,
    pending: { selfReviews: 0, managerReviews: 0 },
  });
  const [training, setTraining] = useState([]);
  const [payrollNext, setPayrollNext] = useState({
    date: "",
    runApproved: false,
  });

  // Modal states
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [showCreateJobModal, setShowCreateJobModal] = useState(false);
  const [employeeFormLoading, setEmployeeFormLoading] = useState(false);
  const [jobFormLoading, setJobFormLoading] = useState(false);
  const [showLeaveAllocationModal, setShowLeaveAllocationModal] =
    useState(false);
  const [leaveAllocationLoading, setLeaveAllocationLoading] = useState(false);
  const [showPayroll, setShowPayroll] = useState(false);
  const [showEmployeeProfile, setShowEmployeeProfile] = useState(false);
  const [showEmployeeDirectoryPage, setShowEmployeeDirectoryPage] =
    useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const failureToastShownRef = useRef(false);
  const [startEmployeeInEditMode, setStartEmployeeInEditMode] = useState(false);

  // Leave allocations state
  const [leaveAllocations, setLeaveAllocations] = useState([]);

  // Employee form state
  const [employeeForm, setEmployeeForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    department: "",
    jobTitle: "",
    startDate: "",
  });

  // Job form state
  const [jobForm, setJobForm] = useState({
    title: "",
    department: "",
    status: "draft",
    experienceLevel: "",
    description: "",
  });

  // Leave allocation form state
  const [leaveAllocationForm, setLeaveAllocationForm] = useState({
    employeeId: "",
    employeeName: "",
    annualLeave: 20,
    sickLeave: 10,
    personalLeave: 5,
    unpaidLeave: 0,
    year: new Date().getFullYear(),
    managerId: "",
    managerName: "",
  });

  const totalEmployees = employees.length;
  const openRequisitions = requisitions.length;
  // newHires provided in analytics
  const pendingApprovals = leaveRequests.filter(
    (l) => l.status === "pending",
  ).length;

  const formattedPayrollDate = useMemo(() => {
    if (!payrollNext.date) return "";
    try {
      const d = new Date(payrollNext.date);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return payrollNext.date;
    }
  }, [payrollNext]);

  const displayName = useMemo(() => {
    if (!user) return "";
    return (
      user.firstName ||
      user.username ||
      (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress) ||
      ""
    );
  }, [user]);

  const fetchAll = async () => {
    try {
      setEmployeesLoading(true);

      const unwrapPayload = (payload) => {
        if (
          payload &&
          typeof payload === "object" &&
          payload.data !== undefined
        ) {
          return payload.data;
        }
        return payload;
      };

      const toArrayPayload = (payload) => {
        const unwrapped = unwrapPayload(payload);
        if (Array.isArray(unwrapped)) return unwrapped;
        if (Array.isArray(unwrapped?.data)) return unwrapped.data;
        return [];
      };

      const toObjectPayload = (payload, fallback = {}) => {
        const unwrapped = unwrapPayload(payload);
        if (
          unwrapped &&
          typeof unwrapped === "object" &&
          !Array.isArray(unwrapped)
        ) {
          return unwrapped;
        }
        return fallback;
      };

      const [
        empRes,
        reqRes,
        anaRes,
        leaveRes,
        perfRes,
        trainRes,
        payRes,
        allocRes,
      ] = await Promise.allSettled([
        apiService.get(
          `/api/hr/employees${
            search ? `?search=${encodeURIComponent(search)}` : ""
          }`,
        ),
        apiService.get("/api/hr/requisitions"),
        apiService.get(`/api/hr/analytics?range=${range}`),
        apiService.get("/api/hr/leave-requests"),
        apiService.get("/api/hr/performance"),
        apiService.get("/api/hr/training"),
        apiService.get("/api/hr/payroll-next"),
        apiService.get("/api/hr/leave-allocations"),
      ]);

      setEmployees(
        empRes.status === "fulfilled" ? toArrayPayload(empRes.value) : [],
      );
      setRequisitions(
        reqRes.status === "fulfilled" ? toArrayPayload(reqRes.value) : [],
      );
      setAnalytics(
        anaRes.status === "fulfilled"
          ? {
              turnoverRates: [],
              months: [],
              newHires: 0,
              ...toObjectPayload(anaRes.value, {}),
            }
          : { turnoverRates: [], months: [], newHires: 0 },
      );
      setLeaveRequests(
        leaveRes.status === "fulfilled" ? toArrayPayload(leaveRes.value) : [],
      );
      setLeaveAllocations(
        allocRes.status === "fulfilled" ? toArrayPayload(allocRes.value) : [],
      );
      setPerformance(
        perfRes.status === "fulfilled"
          ? {
              q3CompletedPct: 0,
              pending: { selfReviews: 0, managerReviews: 0 },
              ...toObjectPayload(perfRes.value, {}),
            }
          : {
              q3CompletedPct: 0,
              pending: { selfReviews: 0, managerReviews: 0 },
            },
      );
      setTraining(
        trainRes.status === "fulfilled" ? toArrayPayload(trainRes.value) : [],
      );
      setPayrollNext(
        payRes.status === "fulfilled"
          ? {
              date: "",
              runApproved: false,
              ...toObjectPayload(payRes.value, {}),
            }
          : { date: "", runApproved: false },
      );

      // Check for failures and log them
      const failures = [
        empRes.status === "rejected" ? "Employees" : null,
        reqRes.status === "rejected" ? "Requisitions" : null,
        anaRes.status === "rejected" ? "Analytics" : null,
        leaveRes.status === "rejected" ? "Leave Requests" : null,
        perfRes.status === "rejected" ? "Performance" : null,
        trainRes.status === "rejected" ? "Training" : null,
        payRes.status === "rejected" ? "Payroll" : null,
        allocRes.status === "rejected" ? "Leave Allocations" : null,
      ].filter(Boolean);

      if (failures.length > 0) {
        console.warn("Failed to load:", failures.join(", "));
        // Only show error if critical endpoints failed
        if (failures.includes("Employees") || failures.includes("Analytics")) {
          if (!failureToastShownRef.current) {
            toast.error(`Failed to load: ${failures.join(", ")}`);
            failureToastShownRef.current = true;
          }
        }
      } else {
        // Reset so future failures can surface a toast again
        failureToastShownRef.current = false;
      }
    } catch (error) {
      console.error("Error in fetchAll:", error);
      toast.error("Failed to load HR dashboard data");
    } finally {
      setEmployeesLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchAll(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const approveLeave = async (id) => {
    try {
      const response = await apiService.post(
        `/api/hr/leave-requests/${id}/approve`,
      );
      setLeaveRequests((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: "approved" } : l)),
      );
      toast.success(response?.message || "Leave approved");
      fetchAll();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to approve");
    }
  };

  const rejectLeave = async (id) => {
    try {
      const response = await apiService.post(
        `/api/hr/leave-requests/${id}/reject`,
      );
      setLeaveRequests((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: "rejected" } : l)),
      );
      toast.success(response?.message || "Leave rejected");
      fetchAll();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to reject");
    }
  };

  const employeeColumns = useMemo(
    () => [
      {
        header: (
          <input
            type="checkbox"
            checked={
              selectedEmployees.length === employees.length &&
              employees.length > 0
            }
            onChange={(e) => {
              if (e.target.checked) setSelectedEmployees([...employees]);
              else setSelectedEmployees([]);
            }}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
          />
        ),
        accessorKey: "select",
        className: "w-12 px-5 py-3",
        cellClassName: "px-5 py-3",
        cell: (e) => (
          <input
            type="checkbox"
            checked={selectedEmployees.some((emp) => emp.id === e.id)}
            onChange={(ev) => {
              ev.stopPropagation();
              if (ev.target.checked)
                setSelectedEmployees([...selectedEmployees, e]);
              else
                setSelectedEmployees(
                  selectedEmployees.filter((emp) => emp.id !== e.id),
                );
            }}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
          />
        ),
      },
      {
        header: "Employee",
        accessorKey: "employee",
        className: "px-5 py-3",
        cellClassName: "px-5 py-3 cursor-pointer",
        cell: (e) => (
          <div
            className="flex items-center gap-3"
            onClick={() => {
              setSelectedEmployee(e);
              setStartEmployeeInEditMode(false);
              setShowEmployeeProfile(true);
            }}
          >
            <div
              className={`size-10 rounded-full border border-slate-200 dark:border-slate-700 bg-center bg-cover flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-200 ${
                e.avatar ? "" : "bg-slate-100 dark:bg-slate-700"
              }`}
              style={{
                backgroundImage: e.avatar ? `url('${e.avatar}')` : "none",
              }}
              aria-label={e.name ? `${e.name} avatar` : "Avatar"}
            >
              {!e.avatar && (e.name ? e.name.charAt(0) : "?")}
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">
                {e.name}
              </p>
              <p className="text-xs text-slate-500">{e.email}</p>
            </div>
          </div>
        ),
      },
      {
        header: "Role",
        accessorKey: "role",
        className: "px-5 py-3",
        cellClassName: "px-5 py-3 text-slate-600 dark:text-slate-300",
      },
      {
        header: "Department",
        accessorKey: "department",
        className: "px-5 py-3 hidden sm:table-cell",
        cellClassName:
          "px-5 py-3 text-slate-600 dark:text-slate-300 hidden sm:table-cell",
      },
      {
        header: "Status",
        accessorKey: "status",
        className: "px-5 py-3",
        cellClassName: "px-5 py-3",
        cell: (e) => (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
              e.status === "Active"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                e.status === "Active" ? "bg-emerald-500" : "bg-amber-500"
              }`}
            ></span>{" "}
            {e.status}
          </span>
        ),
      },
      {
        header: "Action",
        accessorKey: "action",
        className: "px-5 py-3 text-right w-28",
        cellClassName: "px-5 py-3 text-right",
        cell: (e) => (
          <div
            className="inline-flex items-center gap-1"
            onClick={(ev) => ev.stopPropagation()}
          >
            <button
              onClick={() => {
                setSelectedEmployee(e);
                setStartEmployeeInEditMode(false);
                setShowEmployeeProfile(true);
              }}
              className="inline-flex items-center justify-center w-8 h-8 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="View Profile"
              aria-label="View Profile"
            >
              <i className="fa-solid fa-eye"></i>
            </button>
            <button
              onClick={() => {
                setSelectedEmployee(e);
                setStartEmployeeInEditMode(true);
                setShowEmployeeProfile(true);
              }}
              className="inline-flex items-center justify-center w-8 h-8 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="Edit Employee"
              aria-label="Edit Employee"
            >
              <i className="fa-solid fa-pen-to-square"></i>
            </button>
          </div>
        ),
      },
    ],
    [selectedEmployees, employees],
  );

  // Department CRUD handlers
  const handleOpenDeptModal = (mode, dept = null) => {
    setDeptModalMode(mode);
    setEditingDept(dept);
    if (mode === "add") {
      setDeptForm({
        name: "",
        code: "",
        icon: "fa-building",
        color: "#3B82F6",
      });
    } else if (dept) {
      setDeptForm({
        name: dept.name || "",
        code: dept.code || "",
        icon: dept.icon || "fa-building",
        color: dept.color || "#3B82F6",
      });
    }
    setShowDeptModal(true);
  };

  const handleDeptSubmit = async (e) => {
    e.preventDefault();
    setDeptSubmitting(true);
    try {
      if (deptModalMode === "add") {
        await apiService.post("/api/departments", deptForm);
        toast.success("Department created successfully");
      } else {
        await apiService.put(`/api/departments/${editingDept._id}`, deptForm);
        toast.success("Department updated successfully");
      }
      setShowDeptModal(false);
      refreshDepartments();
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          err?.serverData?.message ||
          `Failed to ${deptModalMode === "add" ? "create" : "update"} department`,
      );
    } finally {
      setDeptSubmitting(false);
    }
  };

  const handleDeleteDept = async (dept) => {
    if (
      !window.confirm(
        `Delete department "${dept.name}"? This cannot be undone.`,
      )
    )
      return;
    setDeptDeleting(dept._id);
    try {
      await apiService.delete(`/api/departments/${dept._id}`);
      toast.success("Department deleted");
      refreshDepartments();
    } catch (_err) {
      toast.error("Failed to delete department");
    } finally {
      setDeptDeleting(null);
    }
  };

  const deptIconOptions = [
    "fa-building",
    "fa-users",
    "fa-dollar-sign",
    "fa-cogs",
    "fa-bullhorn",
    "fa-gavel",
    "fa-shield-halved",
    "fa-laptop-code",
    "fa-chart-line",
    "fa-headset",
    "fa-project-diagram",
    "fa-truck",
    "fa-flask",
    "fa-graduation-cap",
    "fa-heart-pulse",
    "fa-scale-balanced",
  ];

  if (showPayroll) {
    return <Payroll onBack={() => setShowPayroll(false)} />;
  }

  if (showEmployeeProfile && selectedEmployee) {
    return (
      <EmployeeProfile
        onBack={() => {
          setShowEmployeeProfile(false);
          setSelectedEmployee(null);
          setStartEmployeeInEditMode(false);
        }}
        employeeData={selectedEmployee}
        initialEditMode={startEmployeeInEditMode}
      />
    );
  }

  const renderEmployeeDirectorySection = ({ fullPage = false } = {}) => (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
      <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <h3 className="text-slate-900 dark:text-white font-bold text-lg flex items-center gap-2">
          <i className="fa-solid fa-people-group text-slate-400"></i>
          Employee Directory
          {selectedEmployees.length > 0 && (
            <span className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-semibold rounded">
              {selectedEmployees.length} selected
            </span>
          )}
        </h3>
        <div className="flex gap-3">
          {selectedEmployees.length > 0 && (
            <>
              <button
                onClick={() => {
                  if (selectedEmployees.length === 1) {
                    setSelectedEmployee(selectedEmployees[0]);
                    setStartEmployeeInEditMode(true);
                    setShowEmployeeProfile(true);
                  } else {
                    setShowBulkEditModal(true);
                  }
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <i className="fa-solid fa-pen-to-square mr-2"></i>
                {selectedEmployees.length === 1 ? "Edit Employee" : "Bulk Edit"}
              </button>
              <button
                onClick={() => setSelectedEmployees([])}
                className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-sm font-semibold rounded-lg transition-colors"
              >
                Clear
              </button>
            </>
          )}
          {fullPage ? (
            <button
              onClick={() => setShowEmployeeDirectoryPage(false)}
              className="text-primary text-sm font-bold hover:underline"
            >
              Back to Dashboard
            </button>
          ) : (
            <button
              onClick={() => {
                setSearch("");
                setShowEmployeeDirectoryPage(true);
              }}
              className="text-primary text-sm font-bold hover:underline"
            >
              View All
            </button>
          )}
        </div>
      </div>
      <div className="px-5 py-2 border-b border-slate-100 dark:border-slate-700">
        <div className="relative">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
          <input
            type="text"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="overflow-x-auto overflow-y-visible">
        <DataTable
          columns={employeeColumns}
          data={employees}
          isLoading={employeesLoading}
          emptyMessage="No employees found."
          keyExtractor={(item) => item.id || item._id?.toString()}
        />
      </div>
    </div>
  );

  if (showEmployeeDirectoryPage) {
    return (
      <div className="w-full min-h-screen bg-gray-50 px-1">
        <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden">
          <div className="flex h-full grow flex-col w-full">
            <Breadcrumb
              items={[
                { label: "Home", href: "/home", icon: "fa-house" },
                {
                  label: "Dashboard",
                  icon: "fa-user-tie",
                  onClick: () => setShowEmployeeDirectoryPage(false),
                },
                { label: "Employee Directory", icon: "fa-people-group" },
              ]}
            />
            <div className="p-2">
              {renderEmployeeDirectorySection({ fullPage: true })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-50 px-1">
      <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden">
        <div className="flex h-full grow flex-col w-full">
          {/* Breadcrumb */}
          <Breadcrumb
            items={[
              { label: "Home", href: "/home", icon: "fa-house" },
              { label: "Dashboard", icon: "fa-user-tie" },
            ]}
          />
          <div className="p-2">
            {/* Page Header & Actions */}
            <div className="flex flex-col md:flex-row justify-between gap-6 mb-8 items-start md:items-end">
              <div className="flex flex-col gap-2">
                <h1 className="text-slate-900 dark:text-white text-3xl mt-3 md:text-4xl font-black leading-tight tracking-[-0.033em]">
                  {displayName ? `${displayName}'s ` : ""} Dashboard
                </h1>
                <p className="text-slate-500 text-base font-normal leading-normal max-w-2xl">
                  Overview of organization workforce, recruitment pipeline, and
                  performance metrics.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setShowPayroll(true)}
                  className="flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-md shadow-emerald-600/20 transition-colors"
                >
                  <i className="fa-solid fa-money-bill-wave text-[16px]"></i>
                  <span className="truncate">Payroll Processing</span>
                </button>
                <button
                  onClick={() => setShowCreateJobModal(true)}
                  className="flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-white border border-slate-200 text-slate-700 text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors"
                >
                  <i className="fa-solid fa-plus text-[16px]"></i>
                  <span className="truncate">Create Job</span>
                </button>
                <button
                  onClick={() => setShowAddEmployeeModal(true)}
                  className="flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold shadow-md shadow-primary/20 hover:bg-blue-700 transition-colors"
                >
                  <i className="fa-solid fa-user-plus text-[16px]"></i>
                  <span className="truncate">Add Employee</span>
                </button>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Total Employees"
                icon="group"
                value={employeesLoading ? "…" : totalEmployees}
              />
              <StatCard
                label="Open Requisitions"
                icon="work"
                value={openRequisitions}
              />
              <StatCard
                label="New Hires (Mo)"
                icon="badge"
                value={analytics.newHires}
              />
              <StatCard
                label="Pending Approvals"
                icon="pending_actions"
                value={pendingApprovals}
                trendType="rose"
              />
            </div>

            {/* Bento Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
              {/* Main Column */}
              <div className="lg:col-span-2 xl:col-span-3 flex flex-col gap-6">
                {/* Employee Directory */}
                {renderEmployeeDirectorySection()}

                {/* Recruitment */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-slate-900 dark:text-white font-bold text-lg flex items-center gap-2">
                      <i className="fa-solid fa-user-group text-purple-500"></i>
                      Recruitment
                    </h3>
                  </div>
                  {requisitions.slice(0, 2).map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-col gap-2 border-b border-slate-100 dark:border-slate-700 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex justify-between">
                        <span className="font-medium text-slate-900 dark:text-white text-sm">
                          {r.title}
                        </span>
                        <span className="text-xs font-bold text-primary bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                          {r.candidates} Candidates
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-purple-500 h-full rounded-full"
                          style={{ width: `${r.progressPct}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500 font-medium uppercase tracking-wide">
                        <span>Screening</span>
                        <span>Interview</span>
                        <span>Offer</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Side Column */}
              <div className="lg:col-span-1 xl:col-span-1 flex flex-col gap-6">
                {/* Leave Allocations */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <h3 className="text-slate-900 dark:text-white font-bold text-base flex items-center gap-2">
                      <i className="fa-solid fa-calendar-days text-purple-500"></i>
                      Leave Allocations
                    </h3>
                    <button
                      onClick={() => setShowLeaveAllocationModal(true)}
                      className="text-xs text-primary hover:underline font-semibold"
                    >
                      + Allocate
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-64 overflow-y-auto">
                    {leaveAllocations.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-sm">
                        No leave allocations yet
                      </div>
                    ) : (
                      leaveAllocations.map((allocation, index) => (
                        <div
                          key={
                            allocation.id ||
                            allocation._id ||
                            `${allocation.employeeId || allocation.employeeName || "allocation"}-${allocation.year || index}`
                          }
                          className="p-4 flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {allocation.employeeName}
                            </p>
                            <span className="text-xs text-slate-500">
                              {allocation.year}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Annual:</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {allocation.annualLeave} days
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Sick:</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {allocation.sickLeave} days
                              </span>
                            </div>
                          </div>
                          {allocation.managerName && (
                            <div className="text-xs text-slate-500">
                              Manager:{" "}
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {allocation.managerName}
                              </span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Analytics */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-slate-900 dark:text-white font-bold text-lg flex items-center gap-2">
                      <i className="fa-solid fa-chart-line text-blue-500"></i>
                      Analytics
                    </h3>
                    <select
                      value={range}
                      onChange={(e) => setRange(e.target.value)}
                      className="bg-slate-50 dark:bg-slate-900 border-none text-xs rounded text-slate-500 font-medium focus:ring-0 cursor-pointer"
                    >
                      <option value="6m">Last 6 Months</option>
                      <option value="ytd">Year to Date</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-slate-500">Turnover Rate</p>
                    <div className="flex items-end gap-2 h-32 w-full justify-between pt-4 px-2">
                      {analytics.turnoverRates.map((v, idx) => (
                        <div
                          key={idx}
                          className={`w-1/${
                            analytics.turnoverRates.length
                          } bg-blue-${
                            100 + idx * 100
                          } dark:bg-blue-900/40 rounded-t relative group`}
                          style={{
                            height: `${Math.max(10, Math.min(100, v * 20))}%`,
                          }}
                        >
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded">
                            {v.toFixed(1)}%
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 px-2">
                      {analytics.months
                        .slice(0, analytics.turnoverRates.length)
                        .map((m) => (
                          <span key={m}>{m}</span>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Leave Requests */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800">
                    <h3 className="text-slate-900 dark:text-white font-bold text-base flex items-center gap-2">
                      <i className="fa-solid fa-calendar-xmark text-rose-500"></i>
                      Leave Requests
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {leaveRequests.map((lr, index) => (
                      <div
                        key={
                          lr.id ||
                          lr._id ||
                          `${lr.name || "leave"}-${lr.range || index}`
                        }
                        className="p-4 flex flex-col gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {lr.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {lr.type} • {lr.range}
                            </p>
                            {(lr.currentApprover || lr.currentApproverRole) && (
                              <p className="text-[11px] text-blue-600 mt-0.5">
                                Awaiting: {lr.currentApprover || "Approver"}
                                {lr.currentApproverRole
                                  ? ` (${lr.currentApproverRole})`
                                  : ""}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 w-full">
                          <button
                            onClick={() => rejectLeave(lr.id)}
                            disabled={!lr.canAct}
                            className="flex-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold py-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => approveLeave(lr.id)}
                            disabled={!lr.canAct}
                            className="flex-1 bg-primary hover:bg-blue-600 text-white text-xs font-bold py-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Performance */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-slate-900 dark:text-white font-bold text-base flex items-center gap-2">
                      <i className="fa-solid fa-star text-amber-500"></i>
                      Performance
                    </h3>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">
                        Q3 Reviews
                      </p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">
                        {performance.q3CompletedPct}%{" "}
                        <span className="text-xs font-normal text-slate-500">
                          Completed
                        </span>
                      </p>
                    </div>
                    <div className="size-10 rounded-full border-4 border-slate-200 dark:border-slate-600 border-t-amber-500 dark:border-t-amber-500 transform -rotate-45"></div>
                  </div>
                  <div className="space-y-3 mt-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">
                        Self-Reviews
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {performance.pending.selfReviews} Pending
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">
                        Manager Reviews
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {performance.pending.managerReviews} Pending
                      </span>
                    </div>
                  </div>
                </div>

                {/* Training */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-slate-900 dark:text-white font-bold text-base flex items-center gap-2">
                      <i className="fa-solid fa-graduation-cap text-emerald-500"></i>
                      Training
                    </h3>
                  </div>
                  {training.map((t, index) => (
                    <div
                      key={
                        t.id ||
                        t._id ||
                        `${t.title || t.name || "training"}-${index}`
                      }
                      className="flex gap-3 items-center"
                    >
                      <div className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 p-2 rounded-lg">
                        <i className={`fa-solid fa-${t.icon}`}></i>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {t.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Due in {t.dueInDays} days
                        </p>
                      </div>
                      <div className="text-xs font-bold text-slate-400">
                        {t.completionPercent}%
                      </div>
                    </div>
                  ))}
                </div>

                {/* Benefits Snapshot */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl shadow-sm p-5 text-white flex flex-col gap-2 relative overflow-hidden">
                  <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
                    <i className="fa-solid fa-money-bill-wave text-[120px]"></i>
                  </div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider z-10">
                    Next Payroll
                  </p>
                  <p className="text-2xl font-bold z-10">
                    {formattedPayrollDate}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 text-xs text-emerald-400 font-medium z-10">
                    <i
                      className={`fa-solid ${
                        payrollNext.runApproved
                          ? "fa-check-circle"
                          : "fa-exclamation-circle"
                      } text-[16px]`}
                    ></i>
                    {payrollNext.runApproved
                      ? "Run Approved"
                      : "Approval Pending"}
                  </div>
                </div>
              </div>
            </div>

            {/* Department Management Section */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden mb-8">
              <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 className="text-slate-900 dark:text-white font-bold text-lg flex items-center gap-2">
                  <i className="fa-solid fa-sitemap text-blue-500"></i>
                  Department Management
                </h3>
                <button
                  onClick={() => handleOpenDeptModal("add")}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                >
                  <i className="fa-solid fa-plus text-xs"></i>
                  Add Department
                </button>
              </div>
              <div className="p-5">
                {departmentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <i className="fa-solid fa-spinner fa-spin text-blue-500 text-xl mr-3"></i>
                    <span className="text-slate-500">
                      Loading departments...
                    </span>
                  </div>
                ) : departments.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <i className="fa-solid fa-building text-4xl text-slate-300 mb-3"></i>
                    <p className="text-sm">
                      No departments yet. Create one to get started.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {departments.map((dept) => (
                      <div
                        key={dept._id}
                        className="group relative flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:shadow-md transition-all bg-white dark:bg-slate-800"
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: (dept.color || "#3B82F6") + "20",
                          }}
                        >
                          <i
                            className={`fa-solid ${dept.icon || "fa-building"}`}
                            style={{ color: dept.color || "#3B82F6" }}
                          ></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {dept.name}
                          </p>
                          {dept.code && (
                            <p className="text-xs text-slate-500 truncate">
                              {dept.code}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleOpenDeptModal("edit", dept)}
                            disabled={deptDeleting === dept._id}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                            title="Edit"
                          >
                            <i className="fa-solid fa-pen text-xs"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteDept(dept)}
                            disabled={deptDeleting === dept._id}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            {deptDeleting === dept._id ? (
                              <i className="fa-solid fa-spinner fa-spin text-xs"></i>
                            ) : (
                              <i className="fa-solid fa-trash-can text-xs"></i>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Department Add/Edit Modal */}
            {showDeptModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 transition-opacity duration-300">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-black/5">
                  <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-900">
                      {deptModalMode === "add"
                        ? "Add Department"
                        : "Edit Department"}
                    </h3>
                    <button
                      onClick={() => setShowDeptModal(false)}
                      className="rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      <i className="fa-solid fa-times"></i>
                    </button>
                  </div>
                  <form onSubmit={handleDeptSubmit} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Department Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={deptForm.name}
                        onChange={(e) =>
                          setDeptForm({ ...deptForm, name: e.target.value })
                        }
                        placeholder="e.g. Engineering"
                        className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-10 px-3 focus:outline-0 focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Department Code
                      </label>
                      <input
                        type="text"
                        value={deptForm.code}
                        onChange={(e) =>
                          setDeptForm({
                            ...deptForm,
                            code: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="e.g. ENG"
                        maxLength={10}
                        className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-10 px-3 focus:outline-0 focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Color
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={deptForm.color}
                          onChange={(e) =>
                            setDeptForm({ ...deptForm, color: e.target.value })
                          }
                          className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                        />
                        <span className="text-sm text-slate-500">
                          {deptForm.color}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Icon
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {deptIconOptions.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            onClick={() => setDeptForm({ ...deptForm, icon })}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all ${
                              deptForm.icon === icon
                                ? "border-blue-500 bg-blue-50 text-blue-600 ring-2 ring-blue-500/30"
                                : "border-slate-200 text-slate-500 hover:border-blue-300 hover:bg-blue-50"
                            }`}
                          >
                            <i className={`fa-solid ${icon} text-sm`}></i>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowDeptModal(false)}
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={deptSubmitting}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {deptSubmitting ? (
                          <>
                            <i className="fa-solid fa-spinner fa-spin"></i>
                            {deptModalMode === "add"
                              ? "Creating..."
                              : "Saving..."}
                          </>
                        ) : deptModalMode === "add" ? (
                          "Create Department"
                        ) : (
                          "Save Changes"
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Add Employee Modal */}
            {showAddEmployeeModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6 transition-opacity duration-300">
                <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col bg-white shadow-2xl rounded-xl overflow-hidden ring-1 ring-black/5">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 bg-white z-10">
                    <div>
                      <h3 className="text-slate-900 tracking-tight text-xl font-bold leading-tight">
                        Add New Employee
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Fill in the information below to onboard a new team
                        member.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowAddEmployeeModal(false)}
                      className="rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      <i className="fa-solid fa-times text-xl"></i>
                    </button>
                  </div>

                  {/* Content */}
                  <div className="modal-content flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                    <form
                      className="space-y-6"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setEmployeeFormLoading(true);
                        try {
                          const fullName =
                            `${employeeForm.firstName} ${employeeForm.lastName}`.trim();
                          const response = await apiService.post(
                            "/api/hr/employees",
                            {
                              name: fullName,
                              email: employeeForm.email,
                              phone: employeeForm.phone,
                              dateOfBirth: employeeForm.dateOfBirth,
                              department: employeeForm.department,
                              jobTitle: employeeForm.jobTitle,
                              startDate: employeeForm.startDate,
                            },
                          );

                          console.log("Employee creation response:", response);
                          toast.success("Employee added successfully");

                          setShowAddEmployeeModal(false);
                          setEmployeeForm({
                            firstName: "",
                            lastName: "",
                            email: "",
                            phone: "",
                            dateOfBirth: "",
                            department: "",
                            jobTitle: "",
                            startDate: "",
                          });

                          // Refresh employee list
                          await fetchAll();
                        } catch (error) {
                          console.error("Error adding employee:", error);
                          toast.error(
                            error.response?.data?.message ||
                              error.message ||
                              "Failed to add employee",
                          );
                        } finally {
                          setEmployeeFormLoading(false);
                        }
                      }}
                    >
                      {/* Personal Information */}
                      <div>
                        <h2 className="text-slate-900 text-lg font-bold pb-4 border-b border-slate-200 mb-6">
                          Personal Information
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <label className="flex flex-col w-full">
                            <p className="text-slate-700 text-sm font-medium pb-2">
                              First Name <span className="text-red-500">*</span>
                            </p>
                            <input
                              type="text"
                              placeholder="e.g. Jane"
                              required
                              value={employeeForm.firstName}
                              onChange={(e) =>
                                setEmployeeForm({
                                  ...employeeForm,
                                  firstName: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 placeholder:text-slate-400 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                          </label>
                          <label className="flex flex-col w-full">
                            <p className="text-slate-700 text-sm font-medium pb-2">
                              Last Name <span className="text-red-500">*</span>
                            </p>
                            <input
                              type="text"
                              placeholder="e.g. Doe"
                              required
                              value={employeeForm.lastName}
                              onChange={(e) =>
                                setEmployeeForm({
                                  ...employeeForm,
                                  lastName: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 placeholder:text-slate-400 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                          </label>
                          <label className="flex flex-col w-full">
                            <p className="text-slate-700 text-sm font-medium pb-2">
                              Email Address{" "}
                              <span className="text-red-500">*</span>
                            </p>
                            <input
                              type="email"
                              placeholder="jane.doe@company.com"
                              required
                              value={employeeForm.email}
                              onChange={(e) =>
                                setEmployeeForm({
                                  ...employeeForm,
                                  email: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 placeholder:text-slate-400 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                          </label>
                          <label className="flex flex-col w-full">
                            <p className="text-slate-700 text-sm font-medium pb-2">
                              Phone Number
                            </p>
                            <input
                              type="tel"
                              placeholder="+1 (555) 000-0000"
                              value={employeeForm.phone}
                              onChange={(e) =>
                                setEmployeeForm({
                                  ...employeeForm,
                                  phone: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 placeholder:text-slate-400 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                          </label>
                          <label className="flex flex-col w-full">
                            <p className="text-slate-700 text-sm font-medium pb-2">
                              Date of Birth
                            </p>
                            <input
                              type="date"
                              value={employeeForm.dateOfBirth}
                              onChange={(e) =>
                                setEmployeeForm({
                                  ...employeeForm,
                                  dateOfBirth: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Employment Details */}
                      <div>
                        <h2 className="text-slate-900 text-lg font-bold pb-4 border-b border-slate-200 mb-6">
                          Employment Details
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <label className="flex flex-col w-full">
                            <p className="text-slate-700 text-sm font-medium pb-2">
                              Department <span className="text-red-500">*</span>
                            </p>
                            <select
                              required
                              value={employeeForm.department}
                              onChange={(e) =>
                                setEmployeeForm({
                                  ...employeeForm,
                                  department: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 appearance-none focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                            >
                              <option value="">Select Department</option>
                              {departmentsLoading ? (
                                <option disabled>Loading departments...</option>
                              ) : (
                                departments.map((dept) => (
                                  <option
                                    key={dept._id || dept.id}
                                    value={dept.name}
                                  >
                                    {dept.name}
                                  </option>
                                ))
                              )}
                            </select>
                          </label>
                          <label className="flex flex-col w-full">
                            <p className="text-slate-700 text-sm font-medium pb-2">
                              Job Title <span className="text-red-500">*</span>
                            </p>
                            <input
                              type="text"
                              placeholder="e.g. Senior Product Designer"
                              required
                              value={employeeForm.jobTitle}
                              onChange={(e) =>
                                setEmployeeForm({
                                  ...employeeForm,
                                  jobTitle: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 placeholder:text-slate-400 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                          </label>
                          <label className="flex flex-col w-full">
                            <p className="text-slate-700 text-sm font-medium pb-2">
                              Start Date <span className="text-red-500">*</span>
                            </p>
                            <input
                              type="date"
                              required
                              value={employeeForm.startDate}
                              onChange={(e) =>
                                setEmployeeForm({
                                  ...employeeForm,
                                  startDate: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                          </label>
                        </div>
                      </div>
                    </form>
                  </div>

                  {/* Footer */}
                  <div className="border-t border-slate-200 p-6 bg-slate-50 flex flex-col-reverse sm:flex-row justify-end gap-3 z-10">
                    <button
                      onClick={() => setShowAddEmployeeModal(false)}
                      disabled={employeeFormLoading}
                      className="flex items-center justify-center px-6 py-3 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-white hover:shadow-sm transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const form = document.querySelector("form");
                        form?.dispatchEvent(
                          new Event("submit", { bubbles: true }),
                        );
                      }}
                      disabled={employeeFormLoading}
                      className="flex items-center justify-center px-6 py-3 rounded-lg text-sm font-medium bg-primary text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all gap-2 disabled:opacity-50"
                    >
                      <i className="fa-solid fa-check text-lg"></i>
                      {employeeFormLoading ? "Adding..." : "Add Employee"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Create Job Modal */}
            {showCreateJobModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6 transition-opacity duration-300">
                <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col bg-white shadow-2xl rounded-xl overflow-hidden ring-1 ring-black/5">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 bg-white z-10">
                    <div>
                      <h3 className="text-slate-900 tracking-tight text-xl font-bold leading-tight">
                        Create Job Posting
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Draft a new position to find your next team member.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowCreateJobModal(false)}
                      className="rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      <i className="fa-solid fa-times text-xl"></i>
                    </button>
                  </div>

                  {/* Content */}
                  <div className="modal-content flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                    <form
                      className="space-y-6"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setJobFormLoading(true);
                        try {
                          await apiService.post("/api/hr/requisitions", {
                            title: jobForm.title,
                            department: jobForm.department,
                            status: jobForm.status,
                            experienceLevel: jobForm.experienceLevel,
                            description: jobForm.description,
                          });
                          toast.success("Job posting created successfully");
                          setShowCreateJobModal(false);
                          setJobForm({
                            title: "",
                            department: "",
                            status: "draft",
                            experienceLevel: "",
                            description: "",
                          });
                          fetchAll();
                        } catch (error) {
                          toast.error(error.message || "Failed to create job");
                        } finally {
                          setJobFormLoading(false);
                        }
                      }}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <label className="flex flex-col w-full">
                          <p className="text-slate-700 text-sm font-medium pb-2">
                            Job Title <span className="text-red-500">*</span>
                          </p>
                          <input
                            type="text"
                            placeholder="e.g. Senior Product Designer"
                            required
                            value={jobForm.title}
                            onChange={(e) =>
                              setJobForm({ ...jobForm, title: e.target.value })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 placeholder:text-slate-400 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                          />
                        </label>
                        <label className="flex flex-col w-full">
                          <p className="text-slate-700 text-sm font-medium pb-2">
                            Department <span className="text-red-500">*</span>
                          </p>
                          <select
                            required
                            value={jobForm.department}
                            onChange={(e) =>
                              setJobForm({
                                ...jobForm,
                                department: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 appearance-none focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                          >
                            <option value="">Select Department</option>
                            {departmentsLoading ? (
                              <option disabled>Loading departments...</option>
                            ) : (
                              departments.map((dept) => (
                                <option
                                  key={dept._id || dept.id}
                                  value={dept.name}
                                >
                                  {dept.name}
                                </option>
                              ))
                            )}
                          </select>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <label className="flex flex-col w-full">
                          <p className="text-slate-700 text-sm font-medium pb-2">
                            Job Status
                          </p>
                          <select
                            value={jobForm.status}
                            onChange={(e) =>
                              setJobForm({ ...jobForm, status: e.target.value })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 appearance-none focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                          >
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="closed">Closed</option>
                          </select>
                        </label>
                        <label className="flex flex-col w-full">
                          <p className="text-slate-700 text-sm font-medium pb-2">
                            Experience Level
                          </p>
                          <select
                            value={jobForm.experienceLevel}
                            onChange={(e) =>
                              setJobForm({
                                ...jobForm,
                                experienceLevel: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 appearance-none focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                          >
                            <option value="">Select Level</option>
                            <option value="entry">Entry Level</option>
                            <option value="mid">Mid Level</option>
                            <option value="senior">Senior Level</option>
                          </select>
                        </label>
                      </div>

                      <label className="flex flex-col w-full">
                        <p className="text-slate-700 text-sm font-medium pb-2">
                          Job Description{" "}
                          <span className="text-red-500">*</span>
                        </p>
                        <textarea
                          placeholder="Describe the role, responsibilities, and requirements..."
                          required
                          value={jobForm.description}
                          onChange={(e) =>
                            setJobForm({
                              ...jobForm,
                              description: e.target.value,
                            })
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 min-h-[150px] px-4 py-3 placeholder:text-slate-400 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                        ></textarea>
                      </label>
                    </form>
                  </div>

                  {/* Footer */}
                  <div className="border-t border-slate-200 p-6 bg-slate-50 flex flex-col-reverse sm:flex-row justify-end gap-3 z-10">
                    <button
                      onClick={() => setShowCreateJobModal(false)}
                      disabled={jobFormLoading}
                      className="flex items-center justify-center px-6 py-3 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-white hover:shadow-sm transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const form = document.querySelector("form");
                        form?.dispatchEvent(
                          new Event("submit", { bubbles: true }),
                        );
                      }}
                      disabled={jobFormLoading}
                      className="flex items-center justify-center px-6 py-3 rounded-lg text-sm font-medium bg-primary text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all gap-2 disabled:opacity-50"
                    >
                      <i className="fa-solid fa-check text-lg"></i>
                      {jobFormLoading ? "Creating..." : "Create Job"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Leave Allocation Modal */}
            {showLeaveAllocationModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6 transition-opacity duration-300">
                <div className="flex h-full max-h-[90vh] w-full max-w-2xl flex-col bg-white shadow-2xl rounded-xl overflow-hidden ring-1 ring-black/5">
                  <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 bg-white z-10">
                    <div>
                      <h3 className="text-slate-900 tracking-tight text-xl font-bold leading-tight">
                        Allocate Leave
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Set leave allocation and assign manager for employee
                      </p>
                    </div>
                    <button
                      onClick={() => setShowLeaveAllocationModal(false)}
                      className="rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      <i className="fa-solid fa-times text-xl"></i>
                    </button>
                  </div>

                  <div className="modal-content flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                    <form
                      id="leave-allocation-form"
                      className="space-y-6"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setLeaveAllocationLoading(true);
                        try {
                          await apiService.post(
                            "/api/hr/leave-allocations",
                            leaveAllocationForm,
                          );
                          toast.success("Leave allocation saved successfully");
                          setShowLeaveAllocationModal(false);
                          setLeaveAllocationForm({
                            employeeId: "",
                            employeeName: "",
                            annualLeave: 20,
                            sickLeave: 10,
                            personalLeave: 5,
                            unpaidLeave: 0,
                            year: new Date().getFullYear(),
                            managerId: "",
                            managerName: "",
                          });
                          fetchAll();
                        } catch (error) {
                          const serverMessage =
                            error?.serverData?.error ||
                            error?.response?.data?.error ||
                            error?.response?.data?.message;
                          toast.error(
                            serverMessage ||
                              error.message ||
                              "Failed to allocate leave",
                          );
                        } finally {
                          setLeaveAllocationLoading(false);
                        }
                      }}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <label className="flex flex-col w-full md:col-span-2">
                          <p className="text-slate-700 text-sm font-medium pb-2">
                            Employee <span className="text-red-500">*</span>
                          </p>
                          <select
                            required
                            value={leaveAllocationForm.employeeId}
                            onChange={(e) => {
                              const selectedEmp = employees.find(
                                (emp) => emp.id === e.target.value,
                              );
                              setLeaveAllocationForm({
                                ...leaveAllocationForm,
                                employeeId: e.target.value,
                                employeeName: selectedEmp?.name || "",
                              });
                            }}
                            className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 appearance-none focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                          >
                            <option value="">Select Employee</option>
                            {employees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.name} - {emp.department}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="flex flex-col w-full">
                          <p className="text-slate-700 text-sm font-medium pb-2">
                            Annual Leave (days){" "}
                            <span className="text-red-500">*</span>
                          </p>
                          <input
                            type="number"
                            min="0"
                            required
                            value={leaveAllocationForm.annualLeave}
                            onChange={(e) =>
                              setLeaveAllocationForm({
                                ...leaveAllocationForm,
                                annualLeave: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                          />
                        </label>

                        <label className="flex flex-col w-full">
                          <p className="text-slate-700 text-sm font-medium pb-2">
                            Sick Leave (days){" "}
                            <span className="text-red-500">*</span>
                          </p>
                          <input
                            type="number"
                            min="0"
                            required
                            value={leaveAllocationForm.sickLeave}
                            onChange={(e) =>
                              setLeaveAllocationForm({
                                ...leaveAllocationForm,
                                sickLeave: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                          />
                        </label>

                        <label className="flex flex-col w-full">
                          <p className="text-slate-700 text-sm font-medium pb-2">
                            Personal Leave (days)
                          </p>
                          <input
                            type="number"
                            min="0"
                            value={leaveAllocationForm.personalLeave}
                            onChange={(e) =>
                              setLeaveAllocationForm({
                                ...leaveAllocationForm,
                                personalLeave: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                          />
                        </label>

                        <label className="flex flex-col w-full">
                          <p className="text-slate-700 text-sm font-medium pb-2">
                            Year <span className="text-red-500">*</span>
                          </p>
                          <input
                            type="number"
                            min="2020"
                            max="2030"
                            required
                            value={leaveAllocationForm.year}
                            onChange={(e) =>
                              setLeaveAllocationForm({
                                ...leaveAllocationForm,
                                year:
                                  parseInt(e.target.value) ||
                                  new Date().getFullYear(),
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                          />
                        </label>

                        <label className="flex flex-col w-full md:col-span-2">
                          <p className="text-slate-700 text-sm font-medium pb-2">
                            Assign Manager{" "}
                            <span className="text-red-500">*</span>
                          </p>
                          <select
                            required
                            value={leaveAllocationForm.managerId}
                            onChange={(e) => {
                              const selectedManager = employees.find(
                                (emp) => emp.id === e.target.value,
                              );
                              setLeaveAllocationForm({
                                ...leaveAllocationForm,
                                managerId: e.target.value,
                                managerName: selectedManager?.name || "",
                              });
                            }}
                            className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 appearance-none focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                          >
                            <option value="">Select Manager</option>
                            {employees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.name} - {emp.role}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </form>
                  </div>

                  <div className="border-t border-slate-200 p-6 bg-slate-50 flex flex-col-reverse sm:flex-row justify-end gap-3 z-10">
                    <button
                      onClick={() => setShowLeaveAllocationModal(false)}
                      disabled={leaveAllocationLoading}
                      className="flex items-center justify-center px-6 py-3 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-white hover:shadow-sm transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const form = document.getElementById(
                          "leave-allocation-form",
                        );
                        form?.dispatchEvent(
                          new Event("submit", { bubbles: true }),
                        );
                      }}
                      disabled={leaveAllocationLoading}
                      className="flex items-center justify-center px-6 py-3 rounded-lg text-sm font-medium bg-primary text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all gap-2 disabled:opacity-50"
                    >
                      <i className="fa-solid fa-check text-lg"></i>
                      {leaveAllocationLoading ? "Saving..." : "Save Allocation"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bulk Edit Modal */}
            {showBulkEditModal && (
              <BulkEditModal
                selectedEmployees={selectedEmployees}
                onClose={() => setShowBulkEditModal(false)}
                onSuccess={() => {
                  setSelectedEmployees([]);
                  // Refetch employees
                  setEmployeesLoading(true);
                  apiService
                    .get("/api/hr/employees")
                    .then((res) => {
                      if (res && res.data) {
                        setEmployees(res.data);
                      }
                      setEmployeesLoading(false);
                    })
                    .catch((err) => {
                      console.error("Error refetching employees:", err);
                      setEmployeesLoading(false);
                    });
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HRM;
