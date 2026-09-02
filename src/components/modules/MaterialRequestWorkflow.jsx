import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  FileText,
  ShoppingCart,
  CreditCard,
  Package,
  CheckCircle,
  AlertCircle,
  Clock,
  ChevronRight,
  Plus,
  Edit2,
  Download,
} from "lucide-react";

const MaterialRequestWorkflow = ({ materialRequestId, onClose, onSuccess }) => {
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceivingModal, setShowReceivingModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);

  const fetchWorkflowProgress = useCallback(async () => {
    try {
      const response = await axios.get(
        `/api/workflow/material-requests/${materialRequestId}/progress`,
      );
      setWorkflow(response.data.data);
      setError(null);
    } catch (err) {
      setError(
        err.response?.data?.error || "Failed to fetch workflow progress",
      );
    } finally {
      setLoading(false);
    }
  }, [materialRequestId]);

  // Load workflow progress
  useEffect(() => {
    fetchWorkflowProgress();
    const interval = setInterval(fetchWorkflowProgress, 5000); // Auto-refresh every 5 seconds
    return () => clearInterval(interval);
  }, [fetchWorkflowProgress]);

  const steps = [
    {
      id: 1,
      title: "Request",
      description: "Material Request Created",
      icon: FileText,
      completed: workflow?.materialRequest?.id,
    },
    {
      id: 2,
      title: "RFQ",
      description: "Quote Request Sent to Vendors",
      icon: ShoppingCart,
      completed: workflow?.summary?.progress?.rfqGenerated,
    },
    {
      id: 3,
      title: "PO",
      description: "Purchase Order Created",
      icon: FileText,
      completed: workflow?.summary?.progress?.poCreated,
    },
    {
      id: 4,
      title: "Payment",
      description: "Payment Processed",
      icon: CreditCard,
      completed: workflow?.summary?.progress?.paymentReceived,
    },
    {
      id: 5,
      title: "Receiving",
      description: "Items Stock In Inventory",
      icon: Package,
      completed: workflow?.summary?.progress?.itemsReceived,
    },
  ];

  const requestType = String(workflow?.materialRequest?.requestType || '')
    .toLowerCase()
    .trim();
  const canGenerateRfq =
    requestType === 'purchase request' ||
    requestType === 'store' ||
    requestType === 'rfq';
  const canReceiveItems =
    selectedPO?.status === 'partly_paid' || selectedPO?.status === 'paid';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Material Request Workflow
              </h1>
              <p className="text-gray-600 mt-2">
                Request: {workflow?.materialRequest?.requestId} • Status:{" "}
                {workflow?.materialRequest?.status}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        {/* Workflow Timeline */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-6">
          <div className="flex justify-between items-center">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isCompleted = step.completed;
              const isCurrent = workflow?.summary?.stage === step.id.toString();

              return (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        isCompleted
                          ? "bg-green-500 text-white"
                          : isCurrent
                            ? "bg-blue-500 text-white animate-pulse"
                            : "bg-gray-300 text-gray-600"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle size={24} />
                      ) : (
                        <StepIcon size={24} />
                      )}
                    </div>
                    <h3 className="mt-3 font-semibold text-gray-900 text-center">
                      {step.title}
                    </h3>
                    <p className="text-xs text-gray-600 text-center mt-1 max-w-20">
                      {step.description}
                    </p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="flex-1 h-1 bg-gray-300 mx-4 mt-6">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isCompleted
                            ? "bg-green-500 w-full"
                            : "bg-gray-300 w-0"
                        }`}
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Current Stage Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* RFQs Section */}
          {workflow?.rfqs?.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ShoppingCart className="text-blue-600" />
                Request for Quotations
              </h2>
              <div className="space-y-3">
                {workflow.rfqs.map((rfq) => (
                  <div
                    key={rfq.id}
                    className="p-3 bg-blue-50 border border-blue-200 rounded-lg"
                    role="button"
                    tabIndex={0}
                  >
                    <p className="font-semibold text-gray-900">
                      {rfq.rfqNumber}
                    </p>
                    <p className="text-sm text-gray-600">
                      Vendor: {rfq.vendor}
                    </p>
                    <p className="text-xs text-gray-500">
                      Status: {rfq.status}
                    </p>
                  </div>
                ))}
                {workflow.rfqs.length === 0 &&
                  workflow?.materialRequest?.id &&
                  canGenerateRfq && (
                    <button
                      onClick={() => setShowQuotationModal(true)}
                      className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                    >
                      <Plus size={18} /> Generate RFQ
                    </button>
                  )}
                {workflow.rfqs.length === 0 &&
                  workflow?.materialRequest?.id &&
                  !canGenerateRfq && (
                    <p className="text-sm text-gray-500">
                      RFQ generation is not available for {workflow?.materialRequest?.requestType || 'this request type'}.
                    </p>
                  )}
              </div>
            </div>
          )}

          {/* Purchase Orders Section */}
          {workflow?.pos?.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="text-orange-600" />
                Purchase Orders
              </h2>
              <div className="space-y-3">
                {workflow.pos.map((po) => (
                  <div
                    key={po.id}
                    className="p-3 bg-orange-50 border border-orange-200 rounded-lg"
                    onClick={() => setSelectedPO(po)}
                    role="button"
                    tabIndex={0}
                  >
                    <p className="font-semibold text-gray-900">{po.poNumber}</p>
                    <p className="text-sm text-gray-600">Vendor: {po.vendor}</p>
                    <p className="text-xs text-gray-500">
                      Amount: ₦{po.totalAmount?.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">Status: {po.status}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payments Section */}
          {selectedPO && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard className="text-green-600" />
                Payment Status
              </h2>
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-gray-600">Total Amount</p>
                  <p className="text-xl font-bold text-gray-900">
                    ₦{selectedPO.totalAmount?.toLocaleString()}
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-gray-600">Paid Amount</p>
                  <p className="text-xl font-bold text-gray-900">
                    ₦{selectedPO.paidAmount?.toLocaleString()}
                  </p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(selectedPO.paidAmount / selectedPO.totalAmount) * 100}%`,
                    }}
                  />
                </div>
                <button
                  onClick={() => setShowPaymentModal(true)}
                  disabled={selectedPO.status === "paid"}
                  className={`w-full py-2 rounded-lg flex items-center justify-center gap-2 ${
                    selectedPO.status === "paid"
                      ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                >
                  <Plus size={18} /> Record Payment
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Receiving Section */}
        {selectedPO && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="text-purple-600" />
              Item Receiving
            </h2>
            <p className="text-gray-600 mb-4">
              {canReceiveItems
                ? "Ready to receive items into inventory"
                : "Please make payment before receiving items"}
            </p>
            {workflow?.receipts?.length > 0 ? (
              <div className="space-y-3">
                {workflow.receipts.map((receipt) => (
                  <div
                    key={receipt.id}
                    className="p-3 bg-purple-50 border border-purple-200 rounded-lg"
                  >
                    <p className="font-semibold text-gray-900">
                      {receipt.receiptNumber}
                    </p>
                    <p className="text-sm text-gray-600">
                      Items Received: {receipt.itemsReceived}
                    </p>
                    <p className="text-xs text-gray-500">
                      Status: {receipt.status}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setShowReceivingModal(true)}
                disabled={!canReceiveItems}
                className={`w-full py-2 rounded-lg flex items-center justify-center gap-2 ${
                  !canReceiveItems
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-purple-600 text-white hover:bg-purple-700"
                }`}
              >
                <Plus size={18} /> Receive Items
              </button>
            )}
          </div>
        )}

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          {workflow?.summary?.progress &&
            Object.entries(workflow.summary.progress).map(([key, value]) => (
              <div key={key} className="bg-white rounded-lg shadow-md p-4">
                <div className="flex items-center gap-3">
                  {value ? (
                    <CheckCircle className="text-green-600" />
                  ) : (
                    <Clock className="text-gray-400" />
                  )}
                  <div>
                    <p className="text-xs text-gray-600 uppercase font-semibold">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </p>
                    <p className="text-sm font-bold text-gray-900">
                      {value ? "Complete" : "Pending"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Modals */}
      {showQuotationModal && (
        <QuotationModal
          onClose={() => setShowQuotationModal(false)}
          rfqId={workflow?.rfqs?.[0]?.id}
          onSuccess={() => {
            fetchWorkflowProgress();
            setShowQuotationModal(false);
            onSuccess?.();
          }}
        />
      )}

      {showPaymentModal && (
        <PaymentModal
          onClose={() => setShowPaymentModal(false)}
          poId={selectedPO?.id}
          remainingAmount={selectedPO?.totalAmount - selectedPO?.paidAmount}
          onSuccess={() => {
            fetchWorkflowProgress();
            setShowPaymentModal(false);
            onSuccess?.();
          }}
        />
      )}

      {showReceivingModal && (
        <ReceivingModal
          onClose={() => setShowReceivingModal(false)}
          poId={selectedPO?.id}
          lineItems={selectedPO?.lineItems || []}
          onSuccess={() => {
            fetchWorkflowProgress();
            setShowReceivingModal(false);
            onSuccess?.();
          }}
        />
      )}

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white p-4 rounded-lg flex items-center gap-2">
          <AlertCircle size={20} />
          {error}
        </div>
      )}
    </div>
  );
};

// Sub-components for modals
const QuotationModal = ({ onClose, rfqId, onSuccess }) => {
  const [quotedAmount, setQuotedAmount] = useState("");
  const [quotedBy, setQuotedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`/api/workflow/rfqs/${rfqId}/add-quotation`, {
        quotedAmount: parseFloat(quotedAmount),
        quotedBy,
        notes,
      });
      onSuccess();
    } catch (error) {
      alert(error.response?.data?.error || "Failed to add quotation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-96">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Add Quotation</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Quoted Amount (NGN)
            </label>
            <input
              type="number"
              required
              step="0.01"
              value={quotedAmount}
              onChange={(e) => setQuotedAmount(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Quoted By (Vendor Name)
            </label>
            <input
              type="text"
              required
              value={quotedBy}
              onChange={(e) => setQuotedBy(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="3"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Submit Quotation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PaymentModal = ({ onClose, poId, remainingAmount, onSuccess }) => {
  const [amount, setAmount] = useState(remainingAmount);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`/api/workflow/pos/${poId}/record-payment`, {
        amount: parseFloat(amount),
        paymentMethod,
        paymentType: amount >= remainingAmount ? "full" : "partial",
      });
      onSuccess();
    } catch (error) {
      alert(error.response?.data?.error || "Failed to record payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-96">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Record Payment</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Amount (NGN)
            </label>
            <input
              type="number"
              required
              step="0.01"
              max={remainingAmount}
              value={amount}
              onChange={(e) =>
                setAmount(
                  Math.min(parseFloat(e.target.value) || 0, remainingAmount),
                )
              }
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <p className="text-xs text-gray-600 mt-1">
              Remaining: ₦{remainingAmount?.toLocaleString()}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="credit_card">Credit Card</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "Processing..." : "Record Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ReceivingModal = ({ onClose, poId, lineItems, onSuccess }) => {
  const [receivedItems, setReceivedItems] = useState(
    lineItems.map((item) => ({
      itemName: item.itemName,
      quantity: item.quantity || 0,
      quantityType: item.quantityType,
      condition: "excellent",
      notes: "",
    })),
  );
  const [storeLocation, setStoreLocation] = useState({ locationName: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!storeLocation.locationName) {
      alert("Please select a store location");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`/api/workflow/pos/${poId}/receive-items`, {
        receivedItems,
        storeLocation,
      });
      onSuccess();
    } catch (error) {
      alert(error.response?.data?.error || "Failed to receive items");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl max-h-96 overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Receive Items</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Store Location
            </label>
            <input
              type="text"
              required
              value={storeLocation.locationName}
              onChange={(e) =>
                setStoreLocation({
                  ...storeLocation,
                  locationName: e.target.value,
                })
              }
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="e.g., Main Warehouse"
            />
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Items to Receive</h3>
            {receivedItems.map((item, index) => (
              <div
                key={index}
                className="p-3 border border-gray-200 rounded-lg space-y-2"
              >
                <p className="font-medium text-gray-900">{item.itemName}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">
                      Quantity to Receive
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => {
                        const newItems = [...receivedItems];
                        newItems[index].quantity =
                          parseFloat(e.target.value) || 0;
                        setReceivedItems(newItems);
                      }}
                      className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Condition</label>
                    <select
                      value={item.condition}
                      onChange={(e) => {
                        const newItems = [...receivedItems];
                        newItems[index].condition = e.target.value;
                        setReceivedItems(newItems);
                      }}
                      className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="excellent">Excellent</option>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="damaged">Damaged</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? "Processing..." : "Receive Items"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MaterialRequestWorkflow;
