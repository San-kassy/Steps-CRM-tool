import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/useAuth";
import { apiService } from "../../services/api";
import toast from "react-hot-toast";
import Breadcrumb from "../Breadcrumb";
import { formatCurrency } from "../../services/currency";
import RetirementManagement from "./RetirementManagement";

const Approval = () => {
  const { user } = useAuth();
  const [advanceRequests, setAdvanceRequests] = useState([]);
  const [refundRequests, setRefundRequests] = useState([]);
  const [retirementBreakdowns, setRetirementBreakdowns] = useState([]);
  const [leaveRequests, _setLeaveRequests] = useState([]);
  const [travelRequests, _setTravelRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [showRetirementManagement, setShowRetirementManagement] =
    useState(false);
  const [showRetirementHistory, setShowRetirementHistory] = useState(false);
  const [showMonthDetails, setShowMonthDetails] = useState(false);
  const [showLeaveHistory, setShowLeaveHistory] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showTravelHistory, setShowTravelHistory] = useState(false);
  const [showTravelForm, setShowTravelForm] = useState(false);
  const [selectedMonthYear, setSelectedMonthYear] = useState(null);
  const [editingLineItems, setEditingLineItems] = useState({});

  // Leave form state
  const [leaveFormData, setLeaveFormData] = useState({
    leaveType: "",
    fromDate: "",
    toDate: "",
    reason: "",
    managerId: "",
    managerName: "",
    managerEmail: "",
  });
  const [leaveAllocation, setLeaveAllocation] = useState(null);
  const [calculatedDays, setCalculatedDays] = useState(0);
  const [remainingLeave, setRemainingLeave] = useState(null);

  // Travel form state
  const [travelFormData, setTravelFormData] = useState({
    currentLocation: "",
    destination: "",
    purpose: "",
    fromDate: "",
    toDate: "",
    numberOfDays: 0,
    numberOfNights: 0,
    accommodationRequired: false,
    budget: "",
    description: "",
    managerId: "",
    managerName: "",
    managerEmail: "",
  });
  const [travelFormLoading, setTravelFormLoading] = useState(false);

  const [_staffList, _setStaffList] = useState([]);
  const [approverSuggestions, _setApproverSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [advanceFormData, setAdvanceFormData] = useState({
    amount: "",
    reason: "",
    approver: "",
    approverEmail: "",
    currency: "USD",
    purpose: "",
  });
  const [refundFormData, setRefundFormData] = useState({
    amount: "",
    reason: "",
    category: "",
    receiptNumber: "",
    transactionDate: "",
    approver: "",
    approverEmail: "",
    currency: "USD",
  });

  // Get current user's info
  const currentUserName = user?.fullName || "Current User";
  const currentUserId = user?.id || user?._id || user?.userId || "";
  const currentEmployeeId = user?.publicMetadata?.employeeId || "EMP999";
  const currentDepartment = user?.publicMetadata?.department || "General";
  const hasFetchedStaffRef = useRef(false);

  const extractList = (response) => {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.employees)) return response.employees;
    return [];
  };

  // Fetch staff list for approver selection
  useEffect(() => {
    const fetchStaffList = async () => {
      try {
        const response = await apiService.get("/api/hr/employees", {
          timeout: 20000,
        });
        const employees = extractList(response);
        if (employees.length > 0) {
          _setStaffList(
            employees.map((emp) => ({
              id: emp._id || emp.id,
              name: emp.fullName || emp.name,
              email: emp.email,
              role: emp.role || emp.department || "Employee",
            })),
          );
        }
      } catch (error) {
        console.error("Error fetching staff list:", error);
      }
    };

    if (hasFetchedStaffRef.current) return;
    hasFetchedStaffRef.current = true;
    fetchStaffList();
  }, []);

  // Fetch leave allocation for current user
  useEffect(() => {
    const fetchLeaveAllocation = async () => {
      try {
        const response = await apiService.get(
          `/api/hr/leave-allocations?employeeId=${currentEmployeeId}&year=${new Date().getFullYear()}`,
        );
        if (response && Array.isArray(response) && response.length > 0) {
          setLeaveAllocation(response[0]);
          // Set manager info if available for both leave and travel forms
          if (response[0].managerId) {
            const managerInfo = {
              managerId: response[0].managerId,
              managerName: response[0].managerName,
              managerEmail: response[0].managerEmail || "",
            };

            setLeaveFormData((prev) => ({
              ...prev,
              ...managerInfo,
            }));

            setTravelFormData((prev) => ({
              ...prev,
              ...managerInfo,
            }));
          }
        }
      } catch (error) {
        console.error("Error fetching leave allocation:", error);
      }
    };

    if (currentEmployeeId) {
      fetchLeaveAllocation();
    }
  }, [currentEmployeeId]);

  // Calculate days and remaining leave when dates or leave type changes
  useEffect(() => {
    if (
      leaveFormData.fromDate &&
      leaveFormData.toDate &&
      leaveFormData.leaveType &&
      leaveAllocation
    ) {
      const from = new Date(leaveFormData.fromDate);
      const to = new Date(leaveFormData.toDate);

      if (to >= from) {
        // Calculate business days (excluding weekends)
        let days = 0;
        const current = new Date(from);
        while (current <= to) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            // Not Sunday or Saturday
            days++;
          }
          current.setDate(current.getDate() + 1);
        }
        setCalculatedDays(days);

        // Calculate remaining leave based on type
        let allocated = 0;
        let used = 0;

        switch (leaveFormData.leaveType) {
          case "annual":
            allocated = leaveAllocation.annualLeave || 0;
            used = leaveAllocation.annualLeaveUsed || 0;
            break;
          case "sick":
            allocated = leaveAllocation.sickLeave || 0;
            used = leaveAllocation.sickLeaveUsed || 0;
            break;
          case "personal":
            allocated = leaveAllocation.personalLeave || 0;
            used = leaveAllocation.personalLeaveUsed || 0;
            break;
          case "unpaid":
            allocated = 999; // Unlimited unpaid leave
            used = 0;
            break;
          default:
            allocated = 0;
            used = 0;
        }

        const remaining = allocated - used - days;
        setRemainingLeave({
          allocated,
          used,
          requested: days,
          remaining,
        });
      }
    }
  }, [
    leaveFormData.fromDate,
    leaveFormData.toDate,
    leaveFormData.leaveType,
    leaveAllocation,
  ]);

  // Calculate travel days and nights when dates change
  useEffect(() => {
    if (travelFormData.fromDate && travelFormData.toDate) {
      const from = new Date(travelFormData.fromDate);
      const to = new Date(travelFormData.toDate);

      if (to >= from) {
        // Calculate total days (inclusive)
        const timeDiff = to.getTime() - from.getTime();
        const days = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end days
        const nights = Math.max(0, days - 1); // Nights are typically one less than days

        setTravelFormData((prev) => ({
          ...prev,
          numberOfDays: days,
          numberOfNights: nights,
        }));
      }
    }
  }, [travelFormData.fromDate, travelFormData.toDate]);

  // Fetch data from MongoDB
  const fetchData = async () => {
    if (!currentUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [advanceRes, refundRes, retirementRes] = await Promise.allSettled([
        apiService.get(`/api/advance-requests?userId=${currentUserId}`, {
          timeout: 20000,
        }),
        apiService.get(`/api/refund-requests?userId=${currentUserId}`, {
          timeout: 20000,
        }),
        apiService.get(`/api/retirement-breakdown?userId=${currentUserId}`, {
          timeout: 20000,
        }),
      ]);

      const nextAdvance =
        advanceRes.status === "fulfilled" ? extractList(advanceRes.value) : [];
      const nextRefund =
        refundRes.status === "fulfilled" ? extractList(refundRes.value) : [];
      const nextRetirement =
        retirementRes.status === "fulfilled"
          ? extractList(retirementRes.value)
          : [];

      setAdvanceRequests(nextAdvance);
      setRefundRequests(nextRefund);
      setRetirementBreakdowns(nextRetirement);

      if (
        advanceRes.status === "rejected" ||
        refundRes.status === "rejected" ||
        retirementRes.status === "rejected"
      ) {
        toast.error("Some approval data failed to load");
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const handleAdvanceSubmit = async (e) => {
    e.preventDefault();

    // Approver will be auto-assigned by backend based on approval rules

    // Validate amount
    if (!advanceFormData.amount || parseFloat(advanceFormData.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const newRequest = {
      employeeName: currentUserName,
      employeeId: currentEmployeeId,
      department: currentDepartment,
      userId: currentUserId,
      amount: parseFloat(advanceFormData.amount),
      reason: advanceFormData.reason,
      approver: advanceFormData.approver,
      approverEmail: advanceFormData.approverEmail,
      currency: advanceFormData.currency,
      purpose: advanceFormData.purpose,
      status: "pending",
      requestDate: new Date().toISOString().split("T")[0],
      hasRetirement: false,
    };

    try {
      // Save to database
      const response = await apiService.post(
        "/api/advance-requests",
        newRequest,
      );

      if (!response) {
        throw new Error("Failed to save request to database");
      }

      // Send email to approver
      try {
        await apiService.post("/api/send-approval-email", {
          to: advanceFormData.approverEmail,
          employeeName: currentUserName,
          employeeId: currentEmployeeId,
          department: currentDepartment,
          amount: advanceFormData.amount,
          currency: advanceFormData.currency,
          reason: advanceFormData.reason,
          purpose: advanceFormData.purpose,
          approver: advanceFormData.approver,
          requestType: "advance",
          repaymentPeriod: "N/A",
        });
      } catch (emailError) {
        console.warn("Email notification failed:", emailError);
        toast.warning("Request saved but email notification failed");
      }

      setShowAdvanceForm(false);
      setAdvanceFormData({
        amount: "",
        reason: "",
        approver: "",
        approverEmail: "",
        currency: "USD",
        purpose: "",
      });
      toast.success("Request submitted successfully");
      fetchData(); // Refresh data
    } catch (error) {
      console.error("Error submitting advance request:", error);
      toast.error(error.message || "Failed to submit request");
    }
  };

  const handleRefundSubmit = async (e) => {
    e.preventDefault();

    // Approver will be auto-assigned by backend based on approval rules

    // Validate amount
    if (!refundFormData.amount || parseFloat(refundFormData.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    // Validate category
    if (!refundFormData.category) {
      toast.error("Please select a category");
      return;
    }

    const newRequest = {
      employeeName: currentUserName,
      employeeId: currentEmployeeId,
      department: currentDepartment,
      userId: currentUserId,
      amount: parseFloat(refundFormData.amount),
      reason: refundFormData.reason,
      category: refundFormData.category,
      receiptNumber: refundFormData.receiptNumber,
      transactionDate: refundFormData.transactionDate,
      approver: refundFormData.approver,
      approverEmail: refundFormData.approverEmail,
      currency: refundFormData.currency,
      status: "pending",
      requestDate: new Date().toISOString().split("T")[0],
    };

    try {
      // Save to database
      const response = await apiService.post(
        "/api/refund-requests",
        newRequest,
      );

      if (!response) {
        throw new Error("Failed to save refund request to database");
      }

      setShowRefundForm(false);
      setRefundFormData({
        amount: "",
        reason: "",
        category: "",
        receiptNumber: "",
        transactionDate: "",
        approver: "",
        approverEmail: "",
        currency: "USD",
      });
      toast.success("Refund request submitted successfully");
      fetchData(); // Refresh data
    } catch (error) {
      console.error("Error submitting refund request:", error);
      toast.error(error.message || "Failed to submit refund request");
    }
  };

  const handleLeaveSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!leaveFormData.leaveType) {
      toast.error("Please select leave type");
      return;
    }

    if (!leaveFormData.fromDate || !leaveFormData.toDate) {
      toast.error("Please select dates");
      return;
    }

    // Manager will be auto-assigned by backend based on approval rules

    // Check if enough leave balance
    if (
      remainingLeave &&
      remainingLeave.remaining < 0 &&
      leaveFormData.leaveType !== "unpaid"
    ) {
      toast.error(`Insufficient ${leaveFormData.leaveType} leave balance`);
      return;
    }

    const newRequest = {
      employeeName: currentUserName,
      employeeId: currentEmployeeId,
      department: currentDepartment,
      userId: currentUserId,
      leaveType: leaveFormData.leaveType,
      fromDate: leaveFormData.fromDate,
      toDate: leaveFormData.toDate,
      days: calculatedDays,
      reason: leaveFormData.reason,
      managerId: leaveFormData.managerId,
      managerName: leaveFormData.managerName,
      managerEmail: leaveFormData.managerEmail,
      status: "pending_manager",
      requestDate: new Date().toISOString().split("T")[0],
    };

    try {
      // Save to database
      const response = await apiService.post(
        "/api/approval/leave-requests",
        newRequest,
      );

      if (!response) {
        throw new Error("Failed to save leave request");
      }

      // Send email to manager
      try {
        await apiService.post("/api/send-leave-approval-email", {
          to: leaveFormData.managerEmail,
          employeeName: currentUserName,
          employeeId: currentEmployeeId,
          leaveType: leaveFormData.leaveType,
          fromDate: leaveFormData.fromDate,
          toDate: leaveFormData.toDate,
          days: calculatedDays,
          reason: leaveFormData.reason,
          managerName: leaveFormData.managerName,
          approvalStage: "manager",
        });
      } catch (emailError) {
        console.warn("Email notification failed:", emailError);
      }

      setShowLeaveForm(false);
      setLeaveFormData({
        leaveType: "",
        fromDate: "",
        toDate: "",
        reason: "",
        managerId: leaveAllocation?.managerId || "",
        managerName: leaveAllocation?.managerName || "",
        managerEmail: leaveAllocation?.managerEmail || "",
      });
      setCalculatedDays(0);
      setRemainingLeave(null);
      toast.success("Leave request submitted to manager for approval");
      fetchData();
    } catch (error) {
      console.error("Error submitting leave request:", error);
      toast.error(error.message || "Failed to submit leave request");
    }
  };

  const handleTravelSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!travelFormData.currentLocation) {
      toast.error("Please enter your current location");
      return;
    }

    if (!travelFormData.destination) {
      toast.error("Please enter destination");
      return;
    }

    if (!travelFormData.purpose) {
      toast.error("Please select purpose");
      return;
    }

    if (!travelFormData.fromDate || !travelFormData.toDate) {
      toast.error("Please select travel dates");
      return;
    }

    if (!travelFormData.managerId || !travelFormData.managerEmail) {
      toast.error(
        "Manager information is required. Please contact HR to assign a manager.",
      );
      return;
    }

    if (!travelFormData.budget || parseFloat(travelFormData.budget) <= 0) {
      toast.error("Please enter a valid budget");
      return;
    }

    const newRequest = {
      employeeName: currentUserName,
      employeeId: currentEmployeeId,
      department: currentDepartment,
      userId: currentUserId,
      currentLocation: travelFormData.currentLocation,
      destination: travelFormData.destination,
      purpose: travelFormData.purpose,
      fromDate: travelFormData.fromDate,
      toDate: travelFormData.toDate,
      numberOfDays: travelFormData.numberOfDays,
      numberOfNights: travelFormData.numberOfNights,
      accommodationRequired: travelFormData.accommodationRequired,
      budget: parseFloat(travelFormData.budget),
      description: travelFormData.description,
      managerId: travelFormData.managerId,
      managerName: travelFormData.managerName,
      managerEmail: travelFormData.managerEmail,
      status: "pending_manager",
      requestDate: new Date().toISOString().split("T")[0],
    };

    try {
      setTravelFormLoading(true);

      // Save to database
      const response = await apiService.post(
        "/api/approval/travel-requests",
        newRequest,
      );

      if (!response) {
        throw new Error("Failed to save travel request");
      }

      // Send email to manager
      try {
        await apiService.post("/api/send-travel-approval-email", {
          to: travelFormData.managerEmail,
          employeeName: currentUserName,
          employeeId: currentEmployeeId,
          currentLocation: travelFormData.currentLocation,
          destination: travelFormData.destination,
          purpose: travelFormData.purpose,
          fromDate: travelFormData.fromDate,
          toDate: travelFormData.toDate,
          numberOfDays: travelFormData.numberOfDays,
          numberOfNights: travelFormData.numberOfNights,
          accommodationRequired: travelFormData.accommodationRequired,
          budget: travelFormData.budget,
          managerName: travelFormData.managerName,
          approvalStage: "manager",
        });
      } catch (emailError) {
        console.warn("Email notification failed:", emailError);
      }

      setShowTravelForm(false);
      setTravelFormData({
        currentLocation: "",
        destination: "",
        purpose: "",
        fromDate: "",
        toDate: "",
        numberOfDays: 0,
        numberOfNights: 0,
        accommodationRequired: false,
        budget: "",
        description: "",
        managerId: leaveAllocation?.managerId || "",
        managerName: leaveAllocation?.managerName || "",
        managerEmail: leaveAllocation?.managerEmail || "",
      });
      toast.success("Travel request submitted to manager for approval");
      fetchData();
    } catch (error) {
      console.error("Error submitting travel request:", error);
      toast.error(error.message || "Failed to submit travel request");
    } finally {
      setTravelFormLoading(false);
    }
  };

  // Show retirement management view if user clicks "Retire" button
  if (showRetirementManagement) {
    return (
      <RetirementManagement onBack={() => setShowRetirementManagement(false)} />
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-50 px-1">
      <Breadcrumb
        items={[
          { label: "Home", href: "/home", icon: "fa-house" },
          { label: "Approval", icon: "fa-clipboard-check" },
        ]}
      />
      <div className="space-y-6 p-3">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-[#dbe0e6] shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <i className="fa-solid fa-wallet text-blue-600 text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-[#617589]">Advance Requests</p>
                <p className="text-2xl font-bold text-[#111418]">
                  {advanceRequests.length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-[#dbe0e6] shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                <i className="fa-solid fa-money-bill-transfer text-green-600 text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-[#617589]">Refund Requests</p>
                <p className="text-2xl font-bold text-[#111418]">
                  {refundRequests.length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-[#dbe0e6] shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                <i className="fa-solid fa-history text-orange-600 text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-[#617589]">Total Records</p>
                <p className="text-2xl font-bold text-[#111418]">
                  {advanceRequests.length + refundRequests.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Request Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Advance Expense Request Card */}
          <div className="bg-white rounded-xl border border-[#dbe0e6] shadow-lg p-6 hover:shadow-xl transition-shadow flex flex-col items-center justify-center min-h-64">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <i className="fa-solid fa-wallet text-blue-600 text-3xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-[#111418] mb-2">
                Advance Expense
              </h3>
              <p className="text-sm text-[#617589] mb-6">
                Request an advance for expenses
              </p>
              <button
                onClick={() => setShowAdvanceForm(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center gap-2 mx-auto"
              >
                <i className="fa-solid fa-plus text-lg"></i>
                New Request
              </button>
            </div>
          </div>

          {/* Refund Request Card */}
          <div className="bg-white rounded-xl border border-[#dbe0e6] shadow-lg p-6 hover:shadow-xl transition-shadow flex flex-col items-center justify-center min-h-64">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <i className="fa-solid fa-money-bill-transfer text-green-600 text-3xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-[#111418] mb-2">
                Refund Request
              </h3>
              <p className="text-sm text-[#617589] mb-6">
                Request a refund for expenses
              </p>
              <button
                onClick={() => setShowRefundForm(true)}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center gap-2 mx-auto"
              >
                <i className="fa-solid fa-plus text-lg"></i>
                New Request
              </button>
            </div>
          </div>

          {/* Retirement Card */}
          <div className="bg-white rounded-xl border border-[#dbe0e6] shadow-lg p-6 hover:shadow-xl transition-shadow flex flex-col items-center justify-center min-h-64">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
                <i className="fa-solid fa-history text-purple-600 text-3xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-[#111418] mb-2">
                Retirement History
              </h3>
              <p className="text-sm text-[#617589] mb-6">
                View retirement breakdown history
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowRetirementHistory(true)}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center gap-2 mx-auto"
                >
                  <i className="fa-solid fa-list text-lg"></i>
                  View History
                </button>
                <button
                  onClick={() => setShowRetirementManagement(true)}
                  className="px-6 py-2 border-2 border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition-all font-semibold flex items-center gap-2 mx-auto"
                >
                  <i className="fa-solid fa-plus text-sm"></i>
                  New Request
                </button>
              </div>
            </div>
          </div>

          {/* Leave Request Card */}
          <div className="bg-white rounded-xl border border-[#dbe0e6] shadow-lg p-6 hover:shadow-xl transition-shadow flex flex-col items-center justify-center min-h-64">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                <i className="fa-solid fa-calendar-days text-orange-600 text-3xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-[#111418] mb-2">
                Leave Request
              </h3>
              <p className="text-sm text-[#617589] mb-6">
                Manage your leave and vacation days
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowLeaveHistory(true)}
                  className="px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center gap-2 mx-auto"
                >
                  <i className="fa-solid fa-history text-lg"></i>
                  View History
                </button>
                <button
                  onClick={() => setShowLeaveForm(true)}
                  className="px-6 py-2 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold flex items-center gap-2 mx-auto"
                >
                  <i className="fa-solid fa-plus text-sm"></i>
                  Request Leave
                </button>
              </div>
            </div>
          </div>

          {/* Travel Request Card */}
          <div className="bg-white rounded-xl border border-[#dbe0e6] shadow-lg p-6 hover:shadow-xl transition-shadow flex flex-col items-center justify-center min-h-64">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <i className="fa-solid fa-plane text-blue-600 text-3xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-[#111418] mb-2">
                Travel Request
              </h3>
              <p className="text-sm text-[#617589] mb-6">
                Manage business travel and trip requests
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowTravelHistory(true)}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center gap-2 mx-auto"
                >
                  <i className="fa-solid fa-history text-lg"></i>
                  View History
                </button>
                <button
                  onClick={() => setShowTravelForm(true)}
                  className="px-6 py-2 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-all font-semibold flex items-center gap-2 mx-auto"
                >
                  <i className="fa-solid fa-plus text-sm"></i>
                  New Request
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* History Table - Full Screen */}
        <div>
          <div className="bg-white rounded-xl border border-[#dbe0e6] shadow-lg">
            <div className="p-6 border-b border-[#dbe0e6]">
              <h3 className="text-2xl font-bold text-[#111418] flex items-center gap-2">
                <i className="fa-solid fa-history text-orange-600 text-2xl"></i>
                Request History
              </h3>
            </div>

            {loading ? (
              <div className="p-8 text-center text-[#617589]">
                <i className="fa-solid fa-spinner fa-spin text-2xl mb-2"></i>
                <p>Loading requests...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Purpose/Category
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Approver
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {[...advanceRequests, ...refundRequests].length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-12 text-center text-[#617589]"
                        >
                          <i className="fa-solid fa-inbox text-4xl mb-3 opacity-50"></i>
                          <p className="text-lg">No requests found</p>
                          <p className="text-sm mt-1">
                            Create a new advance or refund request to get
                            started
                          </p>
                        </td>
                      </tr>
                    ) : (
                      [...advanceRequests, ...refundRequests]
                        .sort(
                          (a, b) =>
                            new Date(b.requestDate) - new Date(a.requestDate),
                        )
                        .map((record, idx) => (
                          <tr
                            key={idx}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
                                  record.purpose
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-green-100 text-green-800"
                                }`}
                              >
                                <i
                                  className={`fa-solid ${
                                    record.purpose
                                      ? "fa-wallet"
                                      : "fa-money-bill-transfer"
                                  }`}
                                ></i>
                                {record.purpose ? "Advance" : "Refund"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-[#111418]">
                              {record.requestDate}
                            </td>
                            <td className="px-6 py-4 text-sm text-[#111418] font-medium">
                              {record.purpose || record.category}
                            </td>
                            <td className="px-6 py-4 text-sm font-semibold text-[#111418]">
                              {formatCurrency(record.amount)}
                            </td>
                            <td className="px-6 py-4 text-sm text-[#617589]">
                              {record.approver}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                                  record.status === "approved"
                                    ? "bg-green-100 text-green-800"
                                    : record.status === "rejected"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-yellow-100 text-yellow-800"
                                }`}
                              >
                                {record.status.charAt(0).toUpperCase() +
                                  record.status.slice(1)}
                              </span>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modals */}
        {/* Advance Expense Modal */}
        {showAdvanceForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between rounded-t-xl flex-shrink-0">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <i className="fa-solid fa-wallet"></i>
                  New Advance Request
                </h2>
                <button
                  onClick={() => setShowAdvanceForm(false)}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors flex-shrink-0"
                >
                  <i className="fa-solid fa-times text-lg"></i>
                </button>
              </div>

              <form
                onSubmit={handleAdvanceSubmit}
                className="flex-1 overflow-y-auto p-6 space-y-5"
              >
                <div>
                  <label className="block text-sm font-medium text-[#111418] mb-2">
                    Amount <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    className="w-full px-4 py-2 border border-[#dbe0e6] rounded-lg bg-white text-[#111418] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={advanceFormData.amount}
                    onChange={(e) =>
                      setAdvanceFormData({
                        ...advanceFormData,
                        amount: e.target.value,
                      })
                    }
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#111418] mb-2">
                    Reason <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    className="w-full px-4 py-2 border border-[#dbe0e6] rounded-lg bg-white text-[#111418] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={advanceFormData.reason}
                    onChange={(e) =>
                      setAdvanceFormData({
                        ...advanceFormData,
                        reason: e.target.value,
                      })
                    }
                    rows="4"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#111418] mb-2">
                      Currency <span className="text-red-600">*</span>
                    </label>
                    <select
                      className="w-full px-4 py-2 border border-[#dbe0e6] rounded-lg bg-white text-[#111418] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={advanceFormData.currency}
                      onChange={(e) =>
                        setAdvanceFormData({
                          ...advanceFormData,
                          currency: e.target.value,
                        })
                      }
                      required
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="JPY">JPY</option>
                      <option value="INR">INR</option>
                      <option value="AUD">AUD</option>
                      <option value="CAD">CAD</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#111418] mb-2">
                      Purpose <span className="text-red-600">*</span>
                    </label>
                    <select
                      className="w-full px-4 py-2 border border-[#dbe0e6] rounded-lg bg-white text-[#111418] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={advanceFormData.purpose}
                      onChange={(e) =>
                        setAdvanceFormData({
                          ...advanceFormData,
                          purpose: e.target.value,
                        })
                      }
                      required
                    >
                      <option value="">Select purpose...</option>
                      <option value="Medical Emergency">
                        Medical Emergency
                      </option>
                      <option value="Home Repair">Home Repair</option>
                      <option value="Education">Education</option>
                      <option value="Vehicle Purchase">Vehicle Purchase</option>
                      <option value="Family Emergency">Family Emergency</option>
                      <option value="Debt Repayment">Debt Repayment</option>
                      <option value="Business Investment">
                        Business Investment
                      </option>
                      <option value="Travel">Travel</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Auto-Approval Routing Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <i className="fa-solid fa-info-circle text-blue-600 text-lg mt-0.5"></i>
                    <div>
                      <h4 className="text-sm font-semibold text-blue-900 mb-1">
                        Auto-Approval Routing
                      </h4>
                      <p className="text-xs text-blue-700">
                        This request will be automatically routed through the
                        approval chain based on configured rules. Approvers will
                        be assigned according to the request amount and approval
                        workflow settings.
                      </p>
                    </div>
                  </div>
                </div>

                <div style={{ display: "none" }}>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-[#dbe0e6] rounded-lg bg-white text-[#111418]"
                      value={advanceFormData.approver}
                      onChange={(e) => {
                        setAdvanceFormData({
                          ...advanceFormData,
                          approver: e.target.value,
                        });
                      }}
                    />
                    {showSuggestions && approverSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#dbe0e6] rounded-lg shadow-lg max-h-40 overflow-y-auto z-10">
                        {approverSuggestions.map((staff, idx) => (
                          <div
                            key={idx}
                            className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-[#111418] text-sm border-b border-[#dbe0e6] last:border-b-0"
                            onClick={() => {
                              setAdvanceFormData({
                                ...advanceFormData,
                                approver: staff.name,
                                approverEmail: staff.email,
                              });
                              setShowSuggestions(false);
                            }}
                          >
                            <div className="font-medium">{staff.name}</div>
                            <div className="text-xs text-[#617589]">
                              {staff.email}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-6">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-check"></i>
                    Submit Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAdvanceForm(false)}
                    className="flex-1 px-4 py-3 bg-gray-200 text-[#111418] font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Refund Request Modal */}
        {showRefundForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 flex items-center justify-between rounded-t-xl flex-shrink-0">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <i className="fa-solid fa-money-bill-transfer"></i>
                  New Refund Request
                </h2>
                <button
                  onClick={() => setShowRefundForm(false)}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors flex-shrink-0"
                >
                  <i className="fa-solid fa-times text-lg"></i>
                </button>
              </div>

              <form
                onSubmit={handleRefundSubmit}
                className="flex-1 overflow-y-auto p-6 space-y-5"
              >
                <div>
                  <label className="block text-sm font-medium text-[#111418] mb-2">
                    Amount <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    className="w-full px-4 py-2 border border-[#dbe0e6] rounded-lg bg-white text-[#111418] focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    value={refundFormData.amount}
                    onChange={(e) =>
                      setRefundFormData({
                        ...refundFormData,
                        amount: e.target.value,
                      })
                    }
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#111418] mb-2">
                      Currency <span className="text-red-600">*</span>
                    </label>
                    <select
                      className="w-full px-4 py-2 border border-[#dbe0e6] rounded-lg bg-white text-[#111418] focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={refundFormData.currency}
                      onChange={(e) =>
                        setRefundFormData({
                          ...refundFormData,
                          currency: e.target.value,
                        })
                      }
                      required
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="JPY">JPY</option>
                      <option value="INR">INR</option>
                      <option value="AUD">AUD</option>
                      <option value="CAD">CAD</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#111418] mb-2">
                      Category <span className="text-red-600">*</span>
                    </label>
                    <select
                      className="w-full px-4 py-2 border border-[#dbe0e6] rounded-lg bg-white text-[#111418] focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={refundFormData.category}
                      onChange={(e) =>
                        setRefundFormData({
                          ...refundFormData,
                          category: e.target.value,
                        })
                      }
                      required
                    >
                      <option value="">Select category...</option>
                      <option value="Travel">Travel</option>
                      <option value="Office Supplies">Office Supplies</option>
                      <option value="Equipment">Equipment</option>
                      <option value="Training">Training</option>
                      <option value="Entertainment">Entertainment</option>
                      <option value="Meals">Meals</option>
                      <option value="Accommodation">Accommodation</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#111418] mb-2">
                      Receipt Number
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-[#dbe0e6] rounded-lg bg-white text-[#111418] focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={refundFormData.receiptNumber}
                      onChange={(e) =>
                        setRefundFormData({
                          ...refundFormData,
                          receiptNumber: e.target.value,
                        })
                      }
                      placeholder="e.g., RCP-12345"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#111418] mb-2">
                      Transaction Date <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="date"
                      className="w-full px-4 py-2 border border-[#dbe0e6] rounded-lg bg-white text-[#111418] focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={refundFormData.transactionDate}
                      onChange={(e) =>
                        setRefundFormData({
                          ...refundFormData,
                          transactionDate: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#111418] mb-2">
                    Reason <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    className="w-full px-4 py-2 border border-[#dbe0e6] rounded-lg bg-white text-[#111418] focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    value={refundFormData.reason}
                    onChange={(e) =>
                      setRefundFormData({
                        ...refundFormData,
                        reason: e.target.value,
                      })
                    }
                    rows="4"
                    placeholder="Describe the expense and why refund is needed..."
                    required
                  />
                </div>

                {/* Auto-Approval Routing Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <i className="fa-solid fa-info-circle text-blue-600 text-lg mt-0.5"></i>
                    <div>
                      <h4 className="text-sm font-semibold text-blue-900 mb-1">
                        Auto-Approval Routing
                      </h4>
                      <p className="text-xs text-blue-700">
                        This request will be automatically routed through the
                        approval chain based on configured rules. Approvers will
                        be assigned according to the request amount and approval
                        workflow settings.
                      </p>
                    </div>
                  </div>
                </div>

                <div style={{ display: "none" }}>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-[#dbe0e6] rounded-lg bg-white text-[#111418]"
                      value={refundFormData.approver}
                      onChange={(e) => {
                        setRefundFormData({
                          ...refundFormData,
                          approver: e.target.value,
                        });
                      }}
                    />
                    {showSuggestions && approverSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#dbe0e6] rounded-lg shadow-lg max-h-40 overflow-y-auto z-10">
                        {approverSuggestions.map((staff, idx) => (
                          <div
                            key={idx}
                            className="px-4 py-2 hover:bg-green-50 cursor-pointer text-[#111418] text-sm border-b border-[#dbe0e6] last:border-b-0"
                            onClick={() => {
                              setRefundFormData({
                                ...refundFormData,
                                approver: staff.name,
                                approverEmail: staff.email,
                              });
                              setShowSuggestions(false);
                            }}
                          >
                            <div className="font-medium">{staff.name}</div>
                            <div className="text-xs text-[#617589]">
                              {staff.email}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-6">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-check"></i>
                    Submit Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRefundForm(false)}
                    className="flex-1 px-4 py-3 bg-gray-200 text-[#111418] font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Retirement History Modal */}
        {showRetirementHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
              <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4 flex items-center justify-between rounded-t-xl flex-shrink-0">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <i className="fa-solid fa-history"></i>
                  Retirement Breakdown History
                </h2>
                <button
                  onClick={() => setShowRetirementHistory(false)}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors flex-shrink-0"
                >
                  <i className="fa-solid fa-times text-lg"></i>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {retirementBreakdowns.length === 0 ? (
                  <div className="text-center py-12">
                    <i className="fa-solid fa-inbox text-6xl text-gray-300 mb-4"></i>
                    <p className="text-lg text-[#617589] mb-2">
                      No retirement breakdowns found
                    </p>
                    <p className="text-sm text-[#617589] mb-6">
                      Create a new retirement breakdown to get started
                    </p>
                    <button
                      onClick={() => {
                        setShowRetirementHistory(false);
                        setShowRetirementManagement(true);
                      }}
                      className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:shadow-lg transition-all font-semibold inline-flex items-center gap-2"
                    >
                      <i className="fa-solid fa-plus"></i>
                      Create New Breakdown
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Month
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Previous Balance
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Total Inflow
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Total Expenses
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Closing Balance
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Total Items
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Submissions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(() => {
                          // Group breakdowns by month
                          const monthlyData = {};
                          retirementBreakdowns.forEach((breakdown) => {
                            const monthKey = breakdown.monthYear;
                            if (!monthlyData[monthKey]) {
                              monthlyData[monthKey] = {
                                monthYear: monthKey,
                                previousClosingBalance:
                                  breakdown.previousClosingBalance || 0,
                                totalInflow: 0,
                                totalExpenses: 0,
                                totalItems: 0,
                                submissions: 0,
                                latestBalance: 0,
                              };
                            }
                            monthlyData[monthKey].totalInflow +=
                              breakdown.inflowAmount || 0;
                            monthlyData[monthKey].totalExpenses +=
                              breakdown.totalExpenses || 0;
                            monthlyData[monthKey].totalItems +=
                              breakdown.lineItems?.length || 0;
                            monthlyData[monthKey].submissions += 1;
                            monthlyData[monthKey].latestBalance =
                              breakdown.newOpeningBalance || 0;
                          });

                          // Convert to array and sort by month (most recent first)
                          const monthlyArray = Object.values(monthlyData).sort(
                            (a, b) => {
                              return b.monthYear.localeCompare(a.monthYear);
                            },
                          );

                          return monthlyArray.map((monthData, idx) => {
                            const [year, month] = (
                              monthData.monthYear || ""
                            ).split("-");
                            const monthName = month
                              ? new Date(
                                  year,
                                  parseInt(month) - 1,
                                  1,
                                ).toLocaleString("en-US", {
                                  month: "long",
                                  year: "numeric",
                                })
                              : monthData.monthYear;

                            return (
                              <tr
                                key={idx}
                                className="hover:bg-gray-50 transition-colors"
                              >
                                <td
                                  className="px-6 py-4 text-sm font-medium text-blue-600 cursor-pointer hover:underline"
                                  onClick={() => {
                                    setSelectedMonthYear(monthData.monthYear);
                                    setShowMonthDetails(true);
                                  }}
                                >
                                  {monthName}
                                </td>
                                <td className="px-6 py-4 text-sm font-semibold text-gray-600">
                                  {formatCurrency(
                                    monthData.previousClosingBalance || 0,
                                  )}
                                </td>
                                <td className="px-6 py-4 text-sm font-semibold text-green-600">
                                  {formatCurrency(monthData.totalInflow || 0)}
                                </td>
                                <td className="px-6 py-4 text-sm font-semibold text-red-600">
                                  {formatCurrency(monthData.totalExpenses || 0)}
                                </td>
                                <td className="px-6 py-4 text-sm font-semibold text-blue-600">
                                  {formatCurrency(monthData.latestBalance || 0)}
                                </td>
                                <td className="px-6 py-4 text-sm text-[#617589]">
                                  {monthData.totalItems} items
                                </td>
                                <td className="px-6 py-4 text-sm text-[#617589]">
                                  {monthData.submissions} submission
                                  {monthData.submissions > 1 ? "s" : ""}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex justify-between items-center flex-shrink-0">
                <button
                  onClick={() => setShowRetirementHistory(false)}
                  className="px-4 py-2 bg-gray-200 text-[#111418] font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    // Prepare monthly aggregated data for export
                    const monthlyData = {};
                    retirementBreakdowns.forEach((breakdown) => {
                      const monthKey = breakdown.monthYear;
                      if (!monthlyData[monthKey]) {
                        monthlyData[monthKey] = {
                          monthYear: monthKey,
                          previousClosingBalance:
                            breakdown.previousClosingBalance || 0,
                          totalInflow: 0,
                          totalExpenses: 0,
                          totalItems: 0,
                          submissions: 0,
                          latestBalance: 0,
                        };
                      }
                      monthlyData[monthKey].totalInflow +=
                        breakdown.inflowAmount || 0;
                      monthlyData[monthKey].totalExpenses +=
                        breakdown.totalExpenses || 0;
                      monthlyData[monthKey].totalItems +=
                        breakdown.lineItems?.length || 0;
                      monthlyData[monthKey].submissions += 1;
                      monthlyData[monthKey].latestBalance =
                        breakdown.newOpeningBalance || 0;
                    });

                    // Convert to CSV
                    const monthlyArray = Object.values(monthlyData).sort(
                      (a, b) => {
                        return b.monthYear.localeCompare(a.monthYear);
                      },
                    );

                    const headers = [
                      "Month",
                      "Previous Balance",
                      "Total Inflow",
                      "Total Expenses",
                      "Closing Balance",
                      "Total Items",
                      "Submissions",
                    ];

                    const rows = monthlyArray.map((monthData) => {
                      const [year, month] = (monthData.monthYear || "").split(
                        "-",
                      );
                      const monthName = month
                        ? new Date(year, parseInt(month) - 1, 1).toLocaleString(
                            "en-US",
                            {
                              month: "long",
                              year: "numeric",
                            },
                          )
                        : monthData.monthYear;

                      return [
                        monthName,
                        monthData.previousClosingBalance,
                        monthData.totalInflow,
                        monthData.totalExpenses,
                        monthData.latestBalance,
                        monthData.totalItems,
                        monthData.submissions,
                      ];
                    });

                    // Create CSV content
                    const csvContent = [
                      headers.join(","),
                      ...rows.map((row) => row.join(",")),
                    ].join("\n");

                    // Download CSV
                    const blob = new Blob([csvContent], {
                      type: "text/csv;charset=utf-8;",
                    });
                    const link = document.createElement("a");
                    const url = URL.createObjectURL(blob);
                    link.setAttribute("href", url);
                    link.setAttribute(
                      "download",
                      `retirement_history_${
                        new Date().toISOString().split("T")[0]
                      }.csv`,
                    );
                    link.style.visibility = "hidden";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast.success("Data exported successfully");
                  }}
                  className="px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-lg hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <i className="fa-solid fa-download"></i>
                  Export Data
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Month Details Modal */}
        {showMonthDetails && selectedMonthYear && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
              {/* Header */}
              <div className="px-8 py-6 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setShowMonthDetails(false);
                        setSelectedMonthYear(null);
                      }}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <i className="fa-solid fa-arrow-left text-gray-600"></i>
                    </button>
                    <div>
                      <h2 className="text-2xl font-bold text-[#111418]">
                        {(() => {
                          const [year, month] = (selectedMonthYear || "").split(
                            "-",
                          );
                          const monthName = month
                            ? new Date(
                                year,
                                parseInt(month) - 1,
                                1,
                              ).toLocaleString("en-US", {
                                month: "long",
                                year: "numeric",
                              })
                            : selectedMonthYear;
                          return `${monthName} - Detailed Breakdown`;
                        })()}
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                        All submissions and line items for this month
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const monthBreakdowns = retirementBreakdowns.filter(
                        (breakdown) =>
                          breakdown.monthYear === selectedMonthYear,
                      );

                      const openingBalance =
                        monthBreakdowns[0]?.previousClosingBalance || 0;
                      const closingBalance =
                        monthBreakdowns[monthBreakdowns.length - 1]
                          ?.newOpeningBalance || 0;
                      const totalInflow = monthBreakdowns.reduce(
                        (sum, breakdown) => sum + (breakdown.inflowAmount || 0),
                        0,
                      );
                      const totalExpenses = monthBreakdowns.reduce(
                        (sum, breakdown) =>
                          sum + (breakdown.totalExpenses || 0),
                        0,
                      );

                      const allLineItems = [];
                      monthBreakdowns.forEach((breakdown) => {
                        if (
                          breakdown.lineItems &&
                          breakdown.lineItems.length > 0
                        ) {
                          allLineItems.push(...breakdown.lineItems);
                        }
                      });

                      const [year, month] = (selectedMonthYear || "").split(
                        "-",
                      );
                      const monthName = month
                        ? new Date(year, parseInt(month) - 1, 1).toLocaleString(
                            "en-US",
                            { month: "long", year: "numeric" },
                          )
                        : selectedMonthYear;

                      // Create CSV content
                      const headers = [
                        "Date",
                        "Description",
                        "Quantity",
                        "Amount",
                      ];
                      const rows = allLineItems.map((item) => [
                        item.date || "N/A",
                        item.description || "No description",
                        item.quantity || 0,
                        item.amount || 0,
                      ]);

                      const csvContent = [
                        `Retirement Breakdown - ${monthName}`,
                        "",
                        "Financial Summary",
                        `Opening Balance,${formatCurrency(openingBalance)}`,
                        `Total Inflow,${formatCurrency(totalInflow)}`,
                        `Total Expenses,${formatCurrency(totalExpenses)}`,
                        `Closing Balance,${formatCurrency(closingBalance)}`,
                        "",
                        "Line Items",
                        headers.join(","),
                        ...rows.map((row) => row.join(",")),
                        "",
                        `Total,${formatCurrency(totalExpenses)}`,
                      ].join("\n");

                      const blob = new Blob([csvContent], {
                        type: "text/csv;charset=utf-8;",
                      });
                      const link = document.createElement("a");
                      const url = URL.createObjectURL(blob);
                      link.setAttribute("href", url);
                      link.setAttribute(
                        "download",
                        `retirement_${monthName.replace(/ /g, "_")}_${
                          new Date().toISOString().split("T")[0]
                        }.csv`,
                      );
                      link.style.visibility = "hidden";
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      toast.success("Data exported successfully");
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-lg hover:shadow-lg transition-all flex items-center gap-2"
                  >
                    <i className="fa-solid fa-download"></i>
                    Export
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                {(() => {
                  const monthBreakdowns = retirementBreakdowns.filter(
                    (breakdown) => breakdown.monthYear === selectedMonthYear,
                  );

                  if (monthBreakdowns.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center h-full">
                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                          <i className="fa-solid fa-inbox text-4xl text-gray-400"></i>
                        </div>
                        <p className="text-lg font-semibold text-gray-600">
                          No submissions found for this month
                        </p>
                      </div>
                    );
                  }

                  // Calculate aggregated financial data
                  const openingBalance =
                    monthBreakdowns[0]?.previousClosingBalance || 0;
                  const closingBalance =
                    monthBreakdowns[monthBreakdowns.length - 1]
                      ?.newOpeningBalance || 0;
                  const totalInflow = monthBreakdowns.reduce(
                    (sum, breakdown) => sum + (breakdown.inflowAmount || 0),
                    0,
                  );
                  const totalExpenses = monthBreakdowns.reduce(
                    (sum, breakdown) => sum + (breakdown.totalExpenses || 0),
                    0,
                  );

                  // Combine all line items from all submissions
                  const allLineItems = [];
                  monthBreakdowns.forEach((breakdown) => {
                    if (breakdown.lineItems && breakdown.lineItems.length > 0) {
                      allLineItems.push(...breakdown.lineItems);
                    }
                  });

                  return (
                    <div className="space-y-6">
                      {/* Financial Summary Cards */}
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                              <i className="fa-solid fa-wallet text-gray-600"></i>
                            </div>
                            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                              Opening Balance
                            </p>
                          </div>
                          <p className="text-2xl font-bold text-[#111418]">
                            {formatCurrency(openingBalance)}
                          </p>
                        </div>

                        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-green-200 rounded-lg flex items-center justify-center">
                              <i className="fa-solid fa-arrow-trend-up text-green-700"></i>
                            </div>
                            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                              Total Inflow
                            </p>
                          </div>
                          <p className="text-2xl font-bold text-green-700">
                            {formatCurrency(totalInflow)}
                          </p>
                        </div>

                        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-6 border border-red-200">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-red-200 rounded-lg flex items-center justify-center">
                              <i className="fa-solid fa-arrow-trend-down text-red-700"></i>
                            </div>
                            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                              Total Expenses
                            </p>
                          </div>
                          <p className="text-2xl font-bold text-red-700">
                            {formatCurrency(totalExpenses)}
                          </p>
                        </div>

                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-blue-200 rounded-lg flex items-center justify-center">
                              <i className="fa-solid fa-coins text-blue-700"></i>
                            </div>
                            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                              Closing Balance
                            </p>
                          </div>
                          <p className="text-2xl font-bold text-blue-700">
                            {formatCurrency(closingBalance)}
                          </p>
                        </div>
                      </div>

                      {/* All Line Items Table */}
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <i className="fa-solid fa-list-check"></i>
                            All Expense Line Items ({allLineItems.length} total
                            items)
                          </h3>
                        </div>

                        {allLineItems.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    #
                                  </th>
                                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Date
                                  </th>
                                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Description
                                  </th>
                                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Quantity
                                  </th>
                                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Amount
                                  </th>
                                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Total
                                  </th>
                                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {allLineItems.map((item, itemIdx) => {
                                  const itemKey = `${itemIdx}`;
                                  const isEditing = editingLineItems[itemKey];
                                  const editedItem =
                                    editingLineItems[itemKey] || item;
                                  const itemQuantity =
                                    parseFloat(editedItem.quantity) || 0;
                                  const itemAmount =
                                    parseFloat(editedItem.amount) || 0;
                                  const itemTotal = itemQuantity * itemAmount;

                                  return (
                                    <tr
                                      key={itemIdx}
                                      className="hover:bg-gray-50 transition-colors"
                                    >
                                      <td className="px-6 py-4 text-sm font-medium text-gray-500">
                                        {itemIdx + 1}
                                      </td>
                                      <td className="px-6 py-4 text-sm text-[#111418] whitespace-nowrap">
                                        {isEditing ? (
                                          <input
                                            type="date"
                                            value={editedItem.date || ""}
                                            onChange={(e) =>
                                              setEditingLineItems({
                                                ...editingLineItems,
                                                [itemKey]: {
                                                  ...editedItem,
                                                  date: e.target.value,
                                                },
                                              })
                                            }
                                            className="w-full px-2 py-1 border border-gray-300 rounded bg-white text-[#111418] text-sm"
                                          />
                                        ) : (
                                          item.date || "N/A"
                                        )}
                                      </td>
                                      <td className="px-6 py-4 text-sm text-[#111418]">
                                        {isEditing ? (
                                          <input
                                            type="text"
                                            value={editedItem.description || ""}
                                            onChange={(e) =>
                                              setEditingLineItems({
                                                ...editingLineItems,
                                                [itemKey]: {
                                                  ...editedItem,
                                                  description: e.target.value,
                                                },
                                              })
                                            }
                                            className="w-full px-2 py-1 border border-gray-300 rounded bg-white text-[#111418] text-sm"
                                          />
                                        ) : (
                                          editedItem.description ||
                                          "No description"
                                        )}
                                      </td>
                                      <td className="px-6 py-4 text-sm text-gray-600">
                                        {isEditing ? (
                                          <input
                                            type="number"
                                            value={editedItem.quantity || ""}
                                            onChange={(e) =>
                                              setEditingLineItems({
                                                ...editingLineItems,
                                                [itemKey]: {
                                                  ...editedItem,
                                                  quantity: e.target.value,
                                                },
                                              })
                                            }
                                            className="w-full px-2 py-1 border border-gray-300 rounded bg-white text-[#111418] text-sm"
                                            step="0.01"
                                            min="0"
                                          />
                                        ) : (
                                          itemQuantity
                                        )}
                                      </td>
                                      <td className="px-6 py-4 text-sm font-bold text-[#111418] text-right">
                                        {isEditing ? (
                                          <input
                                            type="number"
                                            value={editedItem.amount || ""}
                                            onChange={(e) =>
                                              setEditingLineItems({
                                                ...editingLineItems,
                                                [itemKey]: {
                                                  ...editedItem,
                                                  amount: e.target.value,
                                                },
                                              })
                                            }
                                            className="w-full px-2 py-1 border border-gray-300 rounded bg-white text-[#111418] text-sm text-right"
                                            step="0.01"
                                            min="0"
                                          />
                                        ) : (
                                          formatCurrency(itemAmount)
                                        )}
                                      </td>
                                      <td className="px-6 py-4 text-sm font-bold text-blue-600 text-right">
                                        {formatCurrency(itemTotal)}
                                      </td>
                                      <td className="px-6 py-4 text-sm text-center">
                                        {isEditing ? (
                                          <div className="flex gap-2 justify-center">
                                            <button
                                              onClick={() => {
                                                const updated = [
                                                  ...allLineItems,
                                                ];
                                                updated[itemIdx] = editedItem;
                                                setEditingLineItems({
                                                  ...editingLineItems,
                                                  [itemKey]: null,
                                                });
                                                toast.success("Item updated");
                                              }}
                                              className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                                            >
                                              <i className="fa-solid fa-check"></i>
                                            </button>
                                            <button
                                              onClick={() => {
                                                setEditingLineItems({
                                                  ...editingLineItems,
                                                  [itemKey]: null,
                                                });
                                              }}
                                              className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors"
                                            >
                                              <i className="fa-solid fa-times"></i>
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => {
                                              setEditingLineItems({
                                                ...editingLineItems,
                                                [itemKey]: { ...item },
                                              });
                                            }}
                                            className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
                                          >
                                            <i className="fa-solid fa-pen"></i>
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                                <tr className="bg-gray-100 font-bold">
                                  <td
                                    colSpan="5"
                                    className="px-6 py-4 text-right text-sm text-gray-700 uppercase tracking-wide"
                                  >
                                    Grand Total:
                                  </td>
                                  <td className="px-6 py-4 text-right text-lg font-bold text-[#111418]">
                                    $
                                    {allLineItems
                                      .reduce((sum, item) => {
                                        const qty =
                                          parseFloat(item.quantity) || 0;
                                        const amt =
                                          parseFloat(item.amount) || 0;
                                        return sum + qty * amt;
                                      }, 0)
                                      .toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                  </td>
                                  <td></td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-12 text-center">
                            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                              <i className="fa-solid fa-receipt text-4xl text-gray-300"></i>
                            </div>
                            <p className="text-lg font-semibold text-gray-500">
                              No line items found
                            </p>
                            <p className="text-sm text-gray-400 mt-1">
                              There are no expense items recorded for this month
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Leave History Modal */}
        {showLeaveHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 transition-opacity duration-300">
            <div className="flex h-full max-h-[90vh] w-full max-w-2xl flex-col bg-white shadow-2xl rounded-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 bg-white">
                <h3 className="text-slate-900 text-xl font-bold">
                  Leave Request History
                </h3>
                <button
                  onClick={() => setShowLeaveHistory(false)}
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  <i className="fa-solid fa-times text-xl"></i>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {leaveRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <i className="fa-solid fa-calendar text-4xl text-slate-300 mb-4 block"></i>
                    <p className="text-slate-500">No leave requests found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {leaveRequests.map((leave) => (
                      <div
                        key={leave.id}
                        className="border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-slate-900">
                            {leave.type || "Leave"}
                          </h4>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              leave.status === "approved"
                                ? "bg-emerald-100 text-emerald-700"
                                : leave.status === "rejected"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {leave.status || "pending"}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mb-1">
                          {leave.range || "No dates"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {leave.reason || "No reason provided"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-slate-200 p-6 bg-slate-50 flex justify-end gap-3">
                <button
                  onClick={() => setShowLeaveHistory(false)}
                  className="px-6 py-3 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-white transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Leave Request Form Modal */}
        {showLeaveForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 transition-opacity duration-300">
            <div className="flex h-full max-h-[90vh] w-full max-w-2xl flex-col bg-white shadow-2xl rounded-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 bg-white">
                <h3 className="text-slate-900 text-xl font-bold">
                  Request Leave
                </h3>
                <button
                  onClick={() => {
                    setShowLeaveForm(false);
                    setCalculatedDays(0);
                    setRemainingLeave(null);
                  }}
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  <i className="fa-solid fa-times text-xl"></i>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {/* Leave Balance Summary */}
                {leaveAllocation && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-sm font-semibold text-blue-900 mb-3">
                      Your Leave Balance ({leaveAllocation.year})
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-blue-600">Annual Leave</p>
                        <p className="font-bold text-blue-900">
                          {leaveAllocation.annualLeave -
                            (leaveAllocation.annualLeaveUsed || 0)}{" "}
                          days left
                        </p>
                      </div>
                      <div>
                        <p className="text-blue-600">Sick Leave</p>
                        <p className="font-bold text-blue-900">
                          {leaveAllocation.sickLeave -
                            (leaveAllocation.sickLeaveUsed || 0)}{" "}
                          days left
                        </p>
                      </div>
                      <div>
                        <p className="text-blue-600">Personal Leave</p>
                        <p className="font-bold text-blue-900">
                          {leaveAllocation.personalLeave -
                            (leaveAllocation.personalLeaveUsed || 0)}{" "}
                          days left
                        </p>
                      </div>
                      <div>
                        <p className="text-blue-600">Manager</p>
                        <p className="font-bold text-blue-900">
                          {leaveAllocation.managerName}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <form className="space-y-5" onSubmit={handleLeaveSubmit}>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Leave Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={leaveFormData.leaveType}
                      onChange={(e) =>
                        setLeaveFormData({
                          ...leaveFormData,
                          leaveType: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                    >
                      <option value="">Select Type</option>
                      <option value="annual">Annual Leave</option>
                      <option value="sick">Sick Leave</option>
                      <option value="personal">Personal Leave</option>
                      <option value="unpaid">Unpaid Leave</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        From Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={leaveFormData.fromDate}
                        onChange={(e) =>
                          setLeaveFormData({
                            ...leaveFormData,
                            fromDate: e.target.value,
                          })
                        }
                        min={new Date().toISOString().split("T")[0]}
                        className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        To Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={leaveFormData.toDate}
                        onChange={(e) =>
                          setLeaveFormData({
                            ...leaveFormData,
                            toDate: e.target.value,
                          })
                        }
                        min={
                          leaveFormData.fromDate ||
                          new Date().toISOString().split("T")[0]
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                      />
                    </div>
                  </div>

                  {/* Live Calculation Display */}
                  {calculatedDays > 0 && remainingLeave && (
                    <div
                      className={`p-4 rounded-lg border ${
                        remainingLeave.remaining >= 0
                          ? "bg-green-50 border-green-200"
                          : "bg-red-50 border-red-200"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold text-slate-700">
                          Days Requested:
                        </span>
                        <span className="text-lg font-bold text-slate-900">
                          {calculatedDays} business days
                        </span>
                      </div>
                      <div className="text-xs space-y-1 text-slate-600">
                        <div className="flex justify-between">
                          <span>Allocated:</span>
                          <span className="font-semibold">
                            {remainingLeave.allocated} days
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Already Used:</span>
                          <span className="font-semibold">
                            {remainingLeave.used} days
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-slate-300 pt-1 mt-1">
                          <span className="font-semibold">
                            Remaining After Request:
                          </span>
                          <span
                            className={`font-bold ${
                              remainingLeave.remaining >= 0
                                ? "text-green-700"
                                : "text-red-700"
                            }`}
                          >
                            {remainingLeave.remaining} days
                          </span>
                        </div>
                      </div>
                      {remainingLeave.remaining < 0 &&
                        leaveFormData.leaveType !== "unpaid" && (
                          <div className="mt-2 text-xs text-red-700 font-medium">
                            ⚠️ Insufficient leave balance. Consider selecting
                            "Unpaid Leave" instead.
                          </div>
                        )}
                    </div>
                  )}

                  {/* Auto-Approval Routing Info */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <i className="fa-solid fa-info-circle text-blue-600 text-lg mt-0.5"></i>
                      <div>
                        <h4 className="text-sm font-semibold text-blue-900 mb-1">
                          Auto-Approval Routing
                        </h4>
                        <p className="text-xs text-blue-700">
                          This leave request will be automatically routed
                          through the approval chain based on configured rules.
                          Approvers will be assigned according to the leave
                          duration and approval workflow settings.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "none" }}>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Manager <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={leaveFormData.managerName || "Not assigned"}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 text-slate-700 h-12 px-4 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      {leaveFormData.managerName
                        ? `Your request will be sent to ${leaveFormData.managerName} for approval, then to HR.`
                        : "Please contact HR to assign a manager before requesting leave."}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Reason
                    </label>
                    <textarea
                      placeholder="Enter reason for leave"
                      value={leaveFormData.reason}
                      onChange={(e) =>
                        setLeaveFormData({
                          ...leaveFormData,
                          reason: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 min-h-[100px] px-4 py-3 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                    ></textarea>
                  </div>
                </form>
              </div>
              <div className="border-t border-slate-200 p-6 bg-slate-50 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowLeaveForm(false);
                    setCalculatedDays(0);
                    setRemainingLeave(null);
                  }}
                  className="px-6 py-3 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLeaveSubmit}
                  disabled={
                    remainingLeave &&
                    remainingLeave.remaining < 0 &&
                    leaveFormData.leaveType !== "unpaid"
                  }
                  className="px-6 py-3 rounded-lg text-sm font-medium bg-primary text-white hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="fa-solid fa-check text-lg"></i>
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Travel History Modal */}
        {showTravelHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 transition-opacity duration-300">
            <div className="flex h-full max-h-[90vh] w-full max-w-2xl flex-col bg-white shadow-2xl rounded-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 bg-white">
                <h3 className="text-slate-900 text-xl font-bold">
                  Travel Request History
                </h3>
                <button
                  onClick={() => setShowTravelHistory(false)}
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  <i className="fa-solid fa-times text-xl"></i>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {travelRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <i className="fa-solid fa-plane text-4xl text-slate-300 mb-4 block"></i>
                    <p className="text-slate-500">No travel requests found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {travelRequests.map((travel) => (
                      <div
                        key={travel.id}
                        className="border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-semibold text-slate-900">
                              {travel.destination || "Travel"}
                            </h4>
                            <p className="text-xs text-slate-500 mt-1">
                              {travel.purpose || "Business travel"}
                            </p>
                          </div>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              travel.status === "approved"
                                ? "bg-emerald-100 text-emerald-700"
                                : travel.status === "rejected"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {travel.status || "pending"}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600">
                          {travel.dates || "No dates"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-slate-200 p-6 bg-slate-50 flex justify-end gap-3">
                <button
                  onClick={() => setShowTravelHistory(false)}
                  className="px-6 py-3 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-white transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Travel Request Form Modal */}
        {showTravelForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 transition-opacity duration-300">
            <div className="flex h-full max-h-[90vh] w-full max-w-3xl flex-col bg-white shadow-2xl rounded-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 bg-white">
                <h3 className="text-slate-900 text-xl font-bold">
                  New Travel Request
                </h3>
                <button
                  onClick={() => setShowTravelForm(false)}
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  <i className="fa-solid fa-times text-xl"></i>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {/* Manager Info Display */}
                {leaveAllocation && leaveAllocation.managerName && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-sm font-semibold text-blue-900 mb-2">
                      Approval Information
                    </h4>
                    <div className="text-xs text-blue-700">
                      <p>
                        <strong>Manager:</strong> {leaveAllocation.managerName}
                      </p>
                      <p className="mt-1">
                        Your request will be sent to your manager for approval
                        before ticket booking.
                      </p>
                    </div>
                  </div>
                )}

                <form className="space-y-5" onSubmit={handleTravelSubmit}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Current Location <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Lagos, Nigeria"
                        value={travelFormData.currentLocation}
                        onChange={(e) =>
                          setTravelFormData({
                            ...travelFormData,
                            currentLocation: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 placeholder:text-slate-400 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Destination <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. New York, USA"
                        value={travelFormData.destination}
                        onChange={(e) =>
                          setTravelFormData({
                            ...travelFormData,
                            destination: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 placeholder:text-slate-400 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Purpose <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={travelFormData.purpose}
                      onChange={(e) =>
                        setTravelFormData({
                          ...travelFormData,
                          purpose: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                    >
                      <option value="">Select Purpose</option>
                      <option value="conference">Conference</option>
                      <option value="client-meeting">Client Meeting</option>
                      <option value="training">Training</option>
                      <option value="audit">Audit</option>
                      <option value="site-visit">Site Visit</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        From Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={travelFormData.fromDate}
                        onChange={(e) =>
                          setTravelFormData({
                            ...travelFormData,
                            fromDate: e.target.value,
                          })
                        }
                        min={new Date().toISOString().split("T")[0]}
                        className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        To Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={travelFormData.toDate}
                        onChange={(e) =>
                          setTravelFormData({
                            ...travelFormData,
                            toDate: e.target.value,
                          })
                        }
                        min={
                          travelFormData.fromDate ||
                          new Date().toISOString().split("T")[0]
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                      />
                    </div>
                  </div>

                  {/* Auto-calculated Days and Nights */}
                  {travelFormData.numberOfDays > 0 && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-slate-600">
                            Number of Days:
                          </span>
                          <span className="ml-2 font-semibold text-slate-900">
                            {travelFormData.numberOfDays} days
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-600">
                            Number of Nights:
                          </span>
                          <span className="ml-2 font-semibold text-slate-900">
                            {travelFormData.numberOfNights} nights
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="flex items-center gap-3 cursor-pointer p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={travelFormData.accommodationRequired}
                        onChange={(e) =>
                          setTravelFormData({
                            ...travelFormData,
                            accommodationRequired: e.target.checked,
                          })
                        }
                        className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-2 focus:ring-primary/50 cursor-pointer"
                      />
                      <div>
                        <span className="text-sm font-medium text-slate-700">
                          Accommodation Required
                        </span>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Check if you need hotel or accommodation arrangements
                        </p>
                      </div>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Estimated Budget <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 5000"
                      value={travelFormData.budget}
                      onChange={(e) =>
                        setTravelFormData({
                          ...travelFormData,
                          budget: e.target.value,
                        })
                      }
                      min="0"
                      step="0.01"
                      className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 h-12 px-4 placeholder:text-slate-400 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Include estimated costs for flights, accommodation, meals,
                      and other expenses
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Additional Details
                    </label>
                    <textarea
                      placeholder="Enter travel details, special requirements, or additional information"
                      value={travelFormData.description}
                      onChange={(e) =>
                        setTravelFormData({
                          ...travelFormData,
                          description: e.target.value,
                        })
                      }
                      rows="4"
                      className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 px-4 py-3 focus:outline-0 focus:ring-2 focus:ring-primary/50 transition-all"
                    ></textarea>
                  </div>

                  {/* Auto-Approval Routing Info */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <i className="fa-solid fa-info-circle text-blue-600 text-lg mt-0.5"></i>
                      <div>
                        <h4 className="text-sm font-semibold text-blue-900 mb-1">
                          Auto-Approval Routing
                        </h4>
                        <p className="text-xs text-blue-700">
                          This travel request will be automatically routed
                          through the approval chain based on configured rules.
                          Approvers will be assigned according to the travel
                          duration, budget, and approval workflow settings.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "none" }}>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Manager Approver <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={travelFormData.managerName || "Not assigned"}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 text-slate-700 h-12 px-4 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      {travelFormData.managerName
                        ? `${travelFormData.managerName} will review and approve this request before tickets can be booked.`
                        : "Please contact HR to assign a manager before requesting travel."}
                    </p>
                  </div>
                </form>
              </div>
              <div className="border-t border-slate-200 p-6 bg-slate-50 flex gap-3 justify-end">
                <button
                  onClick={() => setShowTravelForm(false)}
                  disabled={travelFormLoading}
                  className="px-6 py-3 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-white transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTravelSubmit}
                  disabled={travelFormLoading}
                  className="px-6 py-3 rounded-lg text-sm font-medium bg-primary text-white hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {travelFormLoading ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin text-lg"></i>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check text-lg"></i>
                      Submit Request
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Approval;
