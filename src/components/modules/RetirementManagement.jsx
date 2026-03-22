import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/useAuth";
import { useAppContext } from "../../context/useAppContext";
import { apiService } from "../../services/api";
import toast from "react-hot-toast";
import Breadcrumb from "../Breadcrumb";
import { formatCurrency } from "../../services/currency";

const RetirementManagement = ({ onBack }) => {
  const { user } = useAuth();
  const resolvedUserId = user?.id || user?._id || user?.userId || "";
  const resolvedEmployeeName =
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    "Employee";
  const [lineItems, setLineItems] = useState([]);
  const [newItem, setNewItem] = useState({
    date: "",
    description: "",
    quantity: "",
    amount: "",
  });
  const {
    monthYear,
    setMonthYear,
    previousClosingBalance,
    setPreviousClosingBalance,
    inflowAmount,
    setInflowAmount,
  } = useAppContext();

  const fetchPreviousMonthBalance = useCallback(async () => {
    try {
      const [year, month] = monthYear.split("-");
      const prevMonth = parseInt(month) - 1;
      let prevYear = parseInt(year);
      let prevMonthStr;

      if (prevMonth < 1) {
        prevYear -= 1;
        prevMonthStr = `${prevYear}-12`;
      } else {
        prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
      }

      // Fetch all retirement breakdowns for the user
      const response = await apiService.get(
        `/api/retirement-breakdown?userId=${resolvedUserId}`,
      );
      const breakdowns = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];

      // Find the previous month's breakdown
      const prevMonthData = breakdowns.find(
        (breakdown) => breakdown.monthYear === prevMonthStr,
      );

      if (prevMonthData) {
        // Auto-fill with the previous month's closing balance (newOpeningBalance)
        setPreviousClosingBalance(prevMonthData.newOpeningBalance || 0);
        toast.success(
          `Previous closing balance auto-filled: ${formatCurrency(
            prevMonthData.newOpeningBalance || 0,
          )}`,
        );
      } else {
        // If no previous month data, clear the field for manual entry
        setPreviousClosingBalance("");
      }
    } catch (error) {
      console.error("Error fetching previous month balance:", error);
      // Don't show error toast here as it might not be critical
    }
  }, [monthYear, resolvedUserId, setPreviousClosingBalance]);

  useEffect(() => {
    fetchPreviousMonthBalance();
  }, [monthYear, fetchPreviousMonthBalance]);

  const handleAddLineItem = () => {
    if (
      !newItem.date.trim() ||
      !newItem.description.trim() ||
      !newItem.quantity ||
      !newItem.amount ||
      parseFloat(newItem.amount) <= 0
    ) {
      toast.error("Please fill in all fields with valid values");
      return;
    }
    const item = {
      id: Date.now(),
      date: newItem.date,
      description: newItem.description.trim(),
      quantity: parseInt(newItem.quantity),
      amount: parseFloat(newItem.amount),
    };
    setLineItems([...lineItems, item]);
    setNewItem({ date: "", description: "", quantity: "", amount: "" });
    toast.success("Expense item added");
  };

  const handleRemoveLineItem = (id) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
    toast.success("Expense item removed");
  };

  const calculateTotal = () =>
    lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const calculateNewOpeningBalance = () =>
    (Number(previousClosingBalance) || 0) +
    (Number(inflowAmount) || 0) -
    calculateTotal();
  const formatMonthYear = (val) => {
    if (!val) return "";
    const [y, m] = val.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleString("en-US", { month: "long", year: "numeric" });
  };
  // Use centralized currency formatter

  const handleSubmitBreakdown = async () => {
    if (!resolvedUserId) {
      toast.error("Unable to determine current user. Please re-login.");
      return;
    }
    if (lineItems.length === 0)
      return toast.error("Please add at least one expense item");
    if (!monthYear) return toast.error("Please select the month and year");
    if (previousClosingBalance === "")
      return toast.error("Please enter previous closing balance");

    try {
      const request = {
        userId: resolvedUserId,
        employeeName: resolvedEmployeeName,
        monthYear,
        previousClosingBalance: Number(previousClosingBalance) || 0,
        inflowAmount: Number(inflowAmount) || 0,
        lineItems,
        totalExpenses: calculateTotal(),
        newOpeningBalance: calculateNewOpeningBalance(),
        status: "submitted",
        submittedDate: new Date().toISOString().split("T")[0],
      };
      await apiService.post("/api/retirement-breakdown", request);
      toast.success("Expense breakdown submitted successfully");
    } catch (error) {
      toast.error("Failed to submit expense breakdown");
      console.error(error);
    }
  };

  const handleSaveDraft = async () => {
    if (!resolvedUserId) {
      toast.error("Unable to determine current user. Please re-login.");
      return;
    }
    if (!monthYear) return toast.error("Please select the month and year");
    try {
      const request = {
        userId: resolvedUserId,
        employeeName: resolvedEmployeeName,
        monthYear,
        previousClosingBalance: Number(previousClosingBalance) || 0,
        inflowAmount: Number(inflowAmount) || 0,
        lineItems,
        totalExpenses: calculateTotal(),
        newOpeningBalance: calculateNewOpeningBalance(),
        status: "draft",
        submittedDate: new Date().toISOString().split("T")[0],
      };
      await apiService.post("/api/retirement-breakdown", request);
      toast.success("Draft saved");
    } catch (error) {
      toast.error(error?.serverData?.error || "Failed to save draft");
      console.error(error);
    }
  };

  const handleReset = () => {
    setLineItems([]);
    setNewItem({ date: "", description: "", quantity: "", amount: "" });
    toast.success("Expense breakdown cleared");
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <Breadcrumb
        items={[
          { label: "Home", href: "/home", icon: "fa-house" },
          {
            label: "Aprovals",
            onClick: onBack,
            icon: "fa-calculator",
          },
          { label: "Retire", icon: "fa-umbrella" },
        ]}
      />
      <div className="p-4">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Retirement
            </h1>
            <p className="text-gray-600">
              Record the breakdown of how you spent the inflow payment from
              finance.
            </p>
          </div>
          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Month & Year
              </label>
              <input
                type="month"
                value={monthYear}
                onChange={(e) => setMonthYear(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Previous Closing Balance
              </label>
              <input
                type="number"
                value={previousClosingBalance}
                onChange={(e) => setPreviousClosingBalance(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm w-40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inflow Received (This Month)
              </label>
              <input
                type="number"
                value={inflowAmount}
                onChange={(e) => setInflowAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm w-40"
              />
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow p-6 mb-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Inline input row */}
                <tr className="bg-gray-50">
                  <td className="px-6 py-2">
                    <input
                      type="date"
                      value={newItem.date}
                      onChange={(e) =>
                        setNewItem({ ...newItem, date: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddLineItem();
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input
                      type="text"
                      value={newItem.description}
                      onChange={(e) =>
                        setNewItem({ ...newItem, description: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddLineItem();
                      }}
                      placeholder="e.g., Office Supplies"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input
                      type="number"
                      value={newItem.quantity}
                      onChange={(e) =>
                        setNewItem({ ...newItem, quantity: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddLineItem();
                      }}
                      placeholder="0"
                      min="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input
                      type="number"
                      value={newItem.amount}
                      onChange={(e) =>
                        setNewItem({ ...newItem, amount: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddLineItem();
                      }}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                  </td>
                  <td className="px-6 py-2 text-center">
                    <button
                      onClick={handleAddLineItem}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-xs inline-flex items-center gap-2"
                      title="Add expense"
                    >
                      <i className="fa-solid fa-plus"></i>
                    </button>
                  </td>
                </tr>

                {/* Existing items */}
                {lineItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-6 text-center text-sm text-gray-500"
                    >
                      No expenses added yet.
                    </td>
                  </tr>
                ) : (
                  lineItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {item.date}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                        {item.description}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-semibold">
                        {formatCurrency(item.amount)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleRemoveLineItem(item.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title="Delete item"
                        >
                          <i className="fa-solid fa-trash text-sm"></i>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Section */}
        <div className="bg-white rounded-lg border border-gray-200 shadow p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Summary for {formatMonthYear(monthYear) || "(select month)"}
              </h3>
              <div className="mt-2 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Previous Closing Balance
                  </span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(Number(previousClosingBalance) || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Inflow Received</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(Number(inflowAmount) || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Expenses</span>
                  <span className="font-semibold text-blue-600">
                    {formatCurrency(calculateTotal())}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center md:justify-end">
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  New Opening Balance
                </div>
                <div className="text-4xl font-bold text-green-600">
                  {formatCurrency(calculateNewOpeningBalance())}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={handleReset}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              Clear
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={!monthYear}
              className={`px-6 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${
                !monthYear
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-slate-700 text-white hover:bg-slate-800"
              }`}
            >
              <i className="fa-solid fa-floppy-disk"></i>
              Save Draft
            </button>
            <button
              onClick={handleSubmitBreakdown}
              disabled={
                lineItems.length === 0 ||
                !monthYear ||
                previousClosingBalance === ""
              }
              className={`px-6 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${
                lineItems.length === 0 ||
                !monthYear ||
                previousClosingBalance === ""
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              <i className="fa-solid fa-check"></i>
              Submit to Finance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RetirementManagement;
