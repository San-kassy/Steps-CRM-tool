import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../context/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import { apiService } from "../../services/api";
import toast from "react-hot-toast";
import Breadcrumb from "../Breadcrumb";
import Navbar from "../Navbar";
import { useDepartments } from "../../context/useDepartments";
import { NumericFormat } from "react-number-format";
import { formatCurrency, getCurrencySymbol } from "../../services/currency";
import { useCurrency } from "../../context/useCurrency";
import DataTable from "../common/DataTable";
import ModuleLoader from "../common/ModuleLoader";

const MaterialRequests = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("last30");
  const [sortBy, setSortBy] = useState("newest");
  const [showForm, setShowForm] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [budgetCategories, setBudgetCategories] = useState([]);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Form state
  const { currency: appCurrency } = useCurrency();
  const [formData, setFormData] = useState({
    requestType: "",
    approver: "",
    department: "",
    requestTitle: "",
    requiredByDate: "",
    budgetCode: "",
    reason: "",
    currency: "",
    exchangeRate: "",
  });

  // Line items state
  const [lineItems, setLineItems] = useState([
    {
      itemName: "",
      quantity: "",
      quantityType: "",
      amount: "",
      description: "",
    },
  ]);

  // Attachment state
  const [attachments, setAttachments] = useState([]);
  const [message, setMessage] = useState("");
  const [userList, setUserList] = useState([]);
  const [skuItems, setSkuItems] = useState([]);

  // Form comment @mention state
  const [showFormMentionDropdown, setShowFormMentionDropdown] = useState(false);
  const [formMentionSearch, setFormMentionSearch] = useState("");
  const formCommentRef = useRef(null);

  // Item and quantity type options (fetched from backend)
  const itemOptions = skuItems.map((s) => ({
    value: s.name,
    label: `${s.name} (${s.sku})`,
    sku: s.sku,
    unitPrice: s.unitPrice,
    unit: s.unit,
  }));

  // View modal comment state
  const [viewComment, setViewComment] = useState("");
  const [showViewMentionDropdown, setShowViewMentionDropdown] = useState(false);
  const [viewMentionSearch, setViewMentionSearch] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const viewCommentRef = useRef(null);

  const quantityTypeOptions = [
    "Pieces",
    "Boxes",
    "Cartons",
    "Pallets",
    "Sets",
    "Units",
    "Kilograms",
    "Liters",
    "Meters",
    "Square Meters",
  ];

  // API integrations
  const { departments: _departments, loading: _departmentsLoading } =
    useDepartments();

  const getAttachmentName = (file) => {
    if (!file) return "Attachment";
    if (typeof file === "string") return file;
    return file.fileName || file.name || "Attachment";
  };

  const normalizePickedAttachments = (files) =>
    files.map((f) => ({
      fileName: f.name,
      fileType: f.type,
      fileSize: f.size,
      rawFile: f,
    }));

  const serializeAttachments = async (items) =>
    Promise.all(
      items.map(async (f) => {
        if (typeof f === "string") {
          return { fileName: f, fileData: null, fileType: "", fileSize: 0 };
        }

        if (f.fileData) {
          return {
            fileName: f.fileName || f.name,
            fileData: f.fileData,
            fileType: f.fileType || f.type || "",
            fileSize: f.fileSize || f.size || 0,
          };
        }

        const source = f.rawFile || f;
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(source);
        });

        return {
          fileName: f.fileName || source.name,
          fileData: base64,
          fileType: f.fileType || source.type || "",
          fileSize: f.fileSize || source.size || 0,
        };
      }),
    );

  const fetchBudgetCategories = async () => {
    setBudgetLoading(true);
    try {
      const response = await apiService.get("/api/budget/categories");
      const rows = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.data?.categories)
            ? response.data.categories
            : [];
      setBudgetCategories(rows);
    } catch {
      // Fall back silently — dropdown will show empty
      setBudgetCategories([]);
    } finally {
      setBudgetLoading(false);
    }
  };

  const fetchCurrencies = useCallback(async () => {
    setCurrencyLoading(true);
    try {
      const response = await apiService.get("/api/budget/currencies");
      const rows = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];
      setCurrencyOptions(rows);
    } catch {
      setCurrencyOptions([
        {
          code: appCurrency || "NGN",
          label: appCurrency || "Nigerian Naira",
          symbol: getCurrencySymbol(appCurrency || "NGN"),
        },
      ]);
    } finally {
      setCurrencyLoading(false);
    }
  }, [appCurrency]);

  const fetchSkuItems = async () => {
    try {
      const response = await apiService.get("/api/sku-items?activeOnly=true");
      setSkuItems(response.data || response || []);
    } catch {
      setSkuItems([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await apiService.get("/api/users", {
        params: { status: "Active" },
      });
      const users = response.data || response || [];
      const formattedUsers = users.map((user) => ({
        id: user._id,
        name: user.fullName,
        role: user.jobTitle || user.role || "Staff",
        email: user.email,
        department: user.department,
      }));
      setUserList(formattedUsers);
    } catch (error) {
      console.error("Failed to fetch users:", error);
      setUserList([]);
    }
  };

  const fetchRequestForApproval = React.useCallback(async (requestId) => {
    try {
      const response = await apiService.get(`/api/material-requests`);
      const request = response.data.find((r) => r._id === requestId);
      if (request) {
        setSelectedRequest(request);
        setShowApprovalModal(true);
      } else {
        toast.error("Request not found");
      }
    } catch {
      toast.error("Failed to load request");
    }
  }, []);

  // Check for approval action from email link
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get("action");
    const requestId = params.get("id");

    if (action === "approve" && requestId) {
      // Fetch the specific request and show approval modal
      fetchRequestForApproval(requestId);
    }
  }, [location.search, fetchRequestForApproval]);

  const handleApproveRequest = async () => {
    setIsApproving(true);
    try {
      const response = await apiService.post(
        `/api/material-requests/${selectedRequest._id}/approve`,
        {},
      );

      // Handle different response types
      if (response.type === "internal_transfer") {
        if (
          response.insufficientItems &&
          response.insufficientItems.length > 0
        ) {
          // Partial fulfillment
          const itemsList = response.insufficientItems
            .map((item) => `${item.item}: ${item.reason}`)
            .join(", ");
          toast.error(`Partial fulfillment - Unavailable items: ${itemsList}`, {
            duration: 6000,
          });
        } else {
          // Full fulfillment
          toast.success("Request approved! Items issued from inventory.", {
            duration: 5000,
          });
        }

        // Show issued items summary
        if (response.inventoryIssues && response.inventoryIssues.length > 0) {
          const issuedSummary = response.inventoryIssues
            .map((i) => `${i.item} (${i.quantityIssued})`)
            .join(", ");
          toast.success(`Issued: ${issuedSummary}`, { duration: 4000 });
        }
      } else {
        // Purchase order created
        toast.success("Request approved! Purchase order created.");
      }

      setShowApprovalModal(false);
      setSelectedRequest(null);
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to approve request");
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }

    setIsRejecting(true);
    try {
      await apiService.post(
        `/api/material-requests/${selectedRequest._id}/reject`,
        {
          reason: rejectionReason,
        },
      );
      toast.success("Request rejected");
      setShowApprovalModal(false);
      setSelectedRequest(null);
      setRejectionReason("");
      fetchRequests();
    } catch {
      toast.error("Failed to reject request");
    } finally {
      setIsRejecting(false);
    }
  };

  const getBlankFormData = useCallback(
    () => ({
      requestType: "",
      approver: "",
      department: "",
      requestTitle: "",
      requiredByDate: "",
      budgetCode: "",
      reason: "",
      currency: appCurrency || "NGN",
      exchangeRate: "",
    }),
    [appCurrency],
  );

  const getBlankLineItems = () => [
    {
      itemName: "",
      quantity: "",
      quantityType: "",
      amount: "",
      description: "",
    },
  ];

  const resetCreateForm = useCallback(() => {
    setIsEditMode(false);
    setSelectedRequest(null);
    setFormData(getBlankFormData());
    setLineItems(getBlankLineItems());
    setAttachments([]);
    setMessage("");
    setShowFormMentionDropdown(false);
    setFormMentionSearch("");
  }, [getBlankFormData]);

  useEffect(() => {
    fetchRequests();
    fetchUsers();
    fetchBudgetCategories();
    fetchCurrencies();
    fetchSkuItems();

    // Keep create flow fresh: clear legacy persisted in-progress form state.
    localStorage.removeItem("materialRequestsState");
  }, [fetchCurrencies]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (activeDropdown && !event.target.closest(".dropdown")) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [activeDropdown]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const response = await apiService.get("/api/material-requests");
      setRequests(response.data || response || []);
      setError(null);
    } catch {
      setError("Failed to load material requests");
    } finally {
      setLoading(false);
    }
  };

  const filteredRequests =
    filterStatus === "all"
      ? requests
      : requests.filter((req) => req.status === filterStatus);

  const resolveApproverDisplay = useCallback((request) => {
    if (!request) return "-";

    const directApprover = String(request.approver || "").trim();
    if (directApprover) return directApprover;

    const pendingApprover = request.approvalChain?.find(
      (entry) => entry?.status === "pending",
    )?.approverName;
    if (pendingApprover) return pendingApprover;

    const firstChainApprover = request.approvalChain?.find(
      (entry) => entry?.approverName,
    )?.approverName;
    if (firstChainApprover) return firstChainApprover;

    return "-";
  }, []);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLineItemChange = (index, field, value) => {
    const updatedItems = [...lineItems];
    updatedItems[index][field] = value;
    setLineItems(updatedItems);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        itemName: "",
        quantity: "",
        quantityType: "",
        amount: "",
        description: "",
      },
    ]);
  };

  const removeLineItem = (index) => {
    if (lineItems.length > 1) {
      const updatedItems = lineItems.filter((_, i) => i !== index);
      setLineItems(updatedItems);
    }
  };

  const _handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addLineItem();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const selectedCurrency = formData.currency || appCurrency || "NGN";
    const isForeignCurrency = selectedCurrency !== "NGN";
    const exchangeRateToNgn = parseFloat(formData.exchangeRate);
    const effectiveRateToNgn =
      isForeignCurrency && exchangeRateToNgn > 0 ? exchangeRateToNgn : 1;

    // Validate that at least one line item has required fields
    const validLineItems = lineItems.filter(
      (item) => item.itemName && item.quantity && item.quantityType,
    );

    if (validLineItems.length === 0) {
      toast.error(
        "Please add at least one line item with name, quantity, and type",
      );
      return;
    }

    if (!formData.requestType) {
      toast.error("Please select a request type");
      return;
    }

    if (isForeignCurrency && !(exchangeRateToNgn > 0)) {
      toast.error("Please enter a valid exchange rate to convert to NGN");
      return;
    }

    const normalizedLineItems = validLineItems.map((item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const amount = parseFloat(item.amount) || 0;
      return {
        ...item,
        quantity,
        amount,
        amountNgn: amount * effectiveRateToNgn,
        lineTotalNgn: quantity * amount * effectiveRateToNgn,
      };
    });

    setIsSubmitting(true);
    try {
      const requestData = {
        ...formData,
        currency: selectedCurrency,
        exchangeRate: isForeignCurrency ? String(exchangeRateToNgn) : "",
        exchangeRateToNgn: effectiveRateToNgn,
        lineItems: normalizedLineItems,
        totalAmountNgn: normalizedLineItems.reduce(
          (sum, item) => sum + item.lineTotalNgn,
          0,
        ),
        requestedBy:
          user?.fullName ||
          user?.primaryEmailAddress?.emailAddress ||
          "Unknown User",
        date: new Date().toISOString().split("T")[0],
        status: "pending",
        attachments: await serializeAttachments(attachments),
        message: message,
      };

      if (isEditMode && selectedRequest?.status === "draft") {
        requestData.status = "pending";
      }

      if (isEditMode && selectedRequest) {
        // Update existing request
        await apiService.put(
          `/api/material-requests/${selectedRequest._id}`,
          requestData,
        );
        toast.success("Material request updated successfully!");
      } else {
        // Create new request
        await apiService.post("/api/material-requests", requestData);
        toast.success("Material request submitted successfully!");
      }

      // Reset form state
      setShowForm(false);
      setIsEditMode(false);
      setSelectedRequest(null);
      setFormData({
        requestType: "",
        approver: "",
        department: "",
        currency: appCurrency,
        exchangeRate: "",
      });
      setLineItems([
        {
          itemName: "",
          quantity: "",
          quantityType: "",
          amount: "",
          description: "",
        },
      ]);
      setAttachments([]);
      setMessage("");

      // Clear saved state from localStorage after submission
      localStorage.removeItem("materialRequestsState");

      fetchRequests();
    } catch {
      toast.error("Failed to submit request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewRequest = (request) => {
    setSelectedRequest(request);
    setShowViewModal(true);
    setActiveDropdown(null);
  };

  const handleEditRequest = (request) => {
    setSelectedRequest(request);
    setFormData({
      requestType: request.requestType || "",
      approver: request.approver || "",
      department: request.department || "",
      requestTitle: request.requestTitle || "",
      requiredByDate: request.requiredByDate
        ? new Date(request.requiredByDate).toISOString().split("T")[0]
        : "",
      budgetCode: request.budgetCode || "",
      reason: request.reason || "",
      currency: request.currency || appCurrency,
      exchangeRate:
        request.currency && request.currency !== "NGN"
          ? String(request.exchangeRateToNgn || request.exchangeRate || "")
          : "",
    });
    setLineItems(request.lineItems || []);
    setAttachments(request.attachments || []);
    setMessage(request.message || "");
    setIsEditMode(true);
    setShowForm(true);
    setActiveDropdown(null);
  };

  const handleApproveClick = (request) => {
    setSelectedRequest(request);
    setShowApprovalModal(true);
    fetchBudgetCategories();
    setActiveDropdown(null);
  };

  const handleRejectClick = (request) => {
    setSelectedRequest(request);
    setShowApprovalModal(true);
    setActiveDropdown(null);
  };

  const getCurrentPendingApprover = (request) => {
    if (!request) return null;
    if (
      Array.isArray(request.approvalChain) &&
      request.approvalChain.length > 0
    ) {
      return (
        request.approvalChain.find((step) => step?.status === "pending") || null
      );
    }
    return null;
  };

  const isUserApprover = (request) => {
    const currentStep = getCurrentPendingApprover(request);
    const currentUserId = String(user?._id || "");
    const currentUserEmail = String(
      user?.primaryEmailAddress?.emailAddress || user?.email || "",
    )
      .toLowerCase()
      .trim();
    const currentUserName = String(user?.fullName || "")
      .toLowerCase()
      .trim();

    if (currentStep) {
      return (
        (currentStep.approverId &&
          String(currentStep.approverId).trim() === currentUserId) ||
        (currentStep.approverEmail &&
          String(currentStep.approverEmail).toLowerCase().trim() ===
            currentUserEmail) ||
        (currentStep.approverName &&
          String(currentStep.approverName).toLowerCase().trim() ===
            currentUserName)
      );
    }

    return (
      String(user?.fullName || "")
        .toLowerCase()
        .trim() ===
        String(request?.approver || "")
          .toLowerCase()
          .trim() ||
      currentUserEmail ===
        String(request?.approverEmail || "")
          .toLowerCase()
          .trim()
    );
  };

  const submitViewComment = async () => {
    const pendingComment = String(viewComment || "").trim();
    if (!pendingComment || submittingComment || !selectedRequest?._id) return;

    setSubmittingComment(true);
    setViewComment("");
    try {
      const response = await apiService.post(
        `/api/material-requests/${selectedRequest._id}/comments`,
        {
          text: pendingComment,
          author: user.fullName,
          authorId: user._id,
        },
      );

      const updatedRequest = response?.data || response;
      if (updatedRequest?._id) {
        setSelectedRequest(updatedRequest);
        setRequests((prev) =>
          prev.map((request) =>
            request._id === updatedRequest._id ? updatedRequest : request,
          ),
        );
      } else {
        const res = await apiService.get("/api/material-requests");
        const allReqs = res.data || res || [];
        setRequests(allReqs);
        const refreshed = allReqs.find((r) => r._id === selectedRequest._id);
        if (refreshed) setSelectedRequest(refreshed);
      }
      setShowViewMentionDropdown(false);
    } catch (err) {
      setViewComment(pendingComment);
      toast.error(
        "Failed to post comment: " +
          (err?.response?.data?.message || err?.message || "Unknown error"),
      );
    } finally {
      setSubmittingComment(false);
    }
  };

  const canUserEdit = (request) => {
    const isRequester = user?.fullName === request.requestedBy;
    const isPending = request.status === "pending";
    return isRequester && isPending;
  };

  const canCompleteDraft = (request) => {
    const isRequester = user?.fullName === request.requestedBy;
    const isDraft = request.status === "draft";
    return isRequester && isDraft;
  };

  const openPurchaseOrderFromActivity = async (poNumber, poId) => {
    try {
      const modsRes = await apiService.get("/api/modules");
      const modules = Array.isArray(modsRes)
        ? modsRes
        : Array.isArray(modsRes?.data)
          ? modsRes.data
          : [];
      const normalize = (value) =>
        String(value || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");

      const poModule = modules.find((m) => {
        const normalizedName = normalize(m.name);
        const normalizedComponent = normalize(m.componentName);
        return (
          normalizedName === "purchaseorders" ||
          normalizedName === "purchaseorder" ||
          normalizedComponent === "purchaseorders" ||
          normalizedComponent === "purchaseorder"
        );
      });

      const poModuleId = poModule?.id ?? 11;

      if (!poModuleId) {
        toast.error("Purchase Orders module not found");
        return;
      }

      if (poNumber) {
        sessionStorage.setItem("purchaseOrdersSearch", poNumber);
      }
      if (poId) {
        sessionStorage.setItem("purchaseOrdersOpenPoId", String(poId));
      } else if (poNumber) {
        sessionStorage.setItem("purchaseOrdersOpenPoNumber", String(poNumber));
      }
      navigate(`/home/${poModuleId}`);
    } catch {
      toast.error("Unable to open Purchase Orders module");
    }
  };

  useEffect(() => {
    if (loading || requests.length === 0) return;

    const requestIdToOpen = sessionStorage.getItem(
      "materialRequestsOpenRequestId",
    );
    if (!requestIdToOpen) return;

    const matchedRequest = requests.find(
      (request) =>
        String(request._id || request.id || "") === String(requestIdToOpen),
    );

    sessionStorage.removeItem("materialRequestsOpenRequestId");

    if (!matchedRequest) {
      toast.error("Material request not found");
      return;
    }

    setSelectedRequest(matchedRequest);
    setShowViewModal(true);
  }, [loading, requests]);

  if (loading) {
    return (
      <ModuleLoader moduleName="Material Requests" subtitle="Please wait..." />
    );
  }

  if (error) {
    return (
      <div className="w-full p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          {error}
        </div>
      </div>
    );
  }

  const materialRequestColumns = [
    {
      header: "Request ID",
      accessorKey: "requestId",
      cell: (req) => (
        <span className="text-sm font-semibold text-[#137fec]">
          #{req.requestId}
        </span>
      ),
    },
    {
      header: "Title & Description",
      accessorKey: "title",
      cell: (req) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#111418]">
              {req.requestTitle ||
                req.lineItems?.[0]?.itemName ||
                "Material Request"}
            </span>
            {req.requestType === "Internal Transfer" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                <i className="fa-solid fa-warehouse text-[10px] mr-1"></i>
                Internal
              </span>
            )}
            {req.requestType === "RFQ" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                <i className="fa-solid fa-file-invoice text-[10px] mr-1"></i>
                RFQ
              </span>
            )}
          </div>
          <span className="text-xs text-[#617589]">
            {req.reason ||
              req.lineItems?.[0]?.description ||
              (req.lineItems?.length > 1
                ? `+${req.lineItems.length - 1} more items`
                : "No description")}
            {req.department && ` • ${req.department}`}
          </span>
        </div>
      ),
    },
    {
      header: "Requester",
      accessorKey: "requester",
      cell: (req) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#137fec] text-white flex items-center justify-center text-xs font-semibold">
            {req.requestedBy?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <span className="text-sm text-[#111418]">{req.requestedBy}</span>
        </div>
      ),
    },
    {
      header: "Submitted",
      accessorKey: "submitted",
      cell: (req) => (
        <span className="text-sm text-[#617589]">
          {new Date(req.date || req.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: "Approver",
      accessorKey: "approver",
      cell: (req) => (
        <span className="text-sm text-[#617589]">
          {resolveApproverDisplay(req)}
        </span>
      ),
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (req) => (
        <span
          className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
            req.status === "approved"
              ? "bg-green-100 text-green-800"
              : req.status === "pending"
                ? "bg-yellow-100 text-yellow-800"
                : req.status === "rejected"
                  ? "bg-red-100 text-red-800"
                  : req.status === "fulfilled"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-800"
          }`}
        >
          {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
        </span>
      ),
    },
    {
      header: "Actions",
      accessorKey: "actions",
      className: "text-right",
      cellClassName: "text-right",
      cell: (req) => (
        <div
          className="flex items-center justify-end gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleViewRequest(req);
            }}
            className="p-1 text-[#617589] hover:text-[#137fec] transition-colors"
            title="View details"
          >
            <i className="fa-solid fa-eye"></i>
          </button>
          {canUserEdit(req) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditRequest(req);
              }}
              className="p-1 text-[#617589] hover:text-[#137fec] transition-colors"
              title="Edit request"
            >
              <i className="fa-solid fa-pen-to-square"></i>
            </button>
          )}
          {canCompleteDraft(req) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditRequest(req);
              }}
              className="p-1 text-[#617589] hover:text-[#137fec] transition-colors"
              title="Complete draft & submit"
            >
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          )}
          {isUserApprover(req) && req.status === "pending" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleApproveClick(req);
                }}
                className="p-1 text-[#617589] hover:text-green-600 transition-colors"
                title="Approve request"
              >
                <i className="fa-solid fa-check"></i>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRejectClick(req);
                }}
                className="p-1 text-[#617589] hover:text-red-600 transition-colors"
                title="Reject request"
              >
                <i className="fa-solid fa-times"></i>
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="w-full min-h-screen bg-gray-50 px-1">
        <Breadcrumb
          items={[
            { label: "Home", href: "/home", icon: "fa-house" },
            {
              label: "Material Requests",
              icon: "fa-box",
              ...(showForm && {
                onClick: (e) => {
                  e.preventDefault();
                  setShowForm(false);
                  resetCreateForm();
                },
              }),
            },
            ...(showForm
              ? [
                  {
                    label: isEditMode ? "Edit Request" : "Create New",
                    icon: isEditMode ? "fa-pen-to-square" : "fa-plus",
                  },
                ]
              : []),
          ]}
        />

        {!showForm && !showApprovalModal && !showViewModal && (
          <div className="max-w-[1490px] mx-auto px-1 py-6">
            {/* Page Header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-2xl font-bold text-[#111418] mb-1">
                  Material Requests
                </h1>
                <p className="text-[#617589] text-sm">
                  Manage and track all material procurement requests
                </p>
              </div>
              <button
                onClick={() => {
                  resetCreateForm();
                  setShowForm(true);
                }}
                className="px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-[#0d6efd] transition-colors flex items-center gap-2 font-medium"
              >
                <i className="fa-solid fa-plus"></i>
                Create New Request
              </button>
            </div>

            {/* Search & Filters Bar */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search Input */}
                <div className="flex-1 min-w-[280px]">
                  <div className="relative">
                    <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#617589]"></i>
                    <input
                      type="text"
                      placeholder="Search by request ID, title, requester..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent text-sm"
                    />
                  </div>
                </div>

                {/* Status Filter */}
                <div className="relative">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#137fec] text-sm appearance-none bg-white cursor-pointer min-w-[140px]"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="draft">Draft</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="fulfilled">Fulfilled</option>
                  </select>
                  <i className="fa-solid absolute right-3 top-1/2 -translate-y-1/2 text-[#617589] pointer-events-none text-xs"></i>
                </div>

                {/* Date Filter */}
                <div className="relative">
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="pl-5 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#137fec] text-sm appearance-none bg-white cursor-pointer min-w-[150px]"
                  >
                    <option value="all">All time</option>
                    <option value="last7">Last 7 days</option>
                    <option value="last30">Last 30 days</option>
                    <option value="last90">Last 90 days</option>
                  </select>
                  <i className="fa-solid fa-calendar absolute left-1 pl-0 top-1/2 -translate-y-1/2 text-[#617589] pointer-events-none text-xs"></i>
                </div>

                {/* Sort By */}
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#137fec] text-sm appearance-none bg-white cursor-pointer min-w-[150px]"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="requester">Requester A-Z</option>
                    <option value="status">Status</option>
                  </select>
                  <i className="fa-solid absolute left-1 pl-0 top-1/2 -translate-y-1/2 text-[#617589] pointer-events-none text-xs"></i>
                </div>

                {/* Clear Filters */}
                {(searchQuery ||
                  filterStatus !== "all" ||
                  dateFilter !== "last30" ||
                  sortBy !== "newest") && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setFilterStatus("all");
                      setDateFilter("last30");
                      setSortBy("newest");
                    }}
                    className="px-3 py-2 text-[#617589] hover:text-[#111418] hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2 text-sm"
                  >
                    <i className="fa-solid fa-filter-circle-xmark"></i>
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <DataTable
                columns={materialRequestColumns}
                data={filteredRequests.filter(
                  (req) =>
                    searchQuery === "" ||
                    req.requestId
                      ?.toLowerCase()
                      .includes(searchQuery.toLowerCase()) ||
                    req.requestedBy
                      ?.toLowerCase()
                      .includes(searchQuery.toLowerCase()) ||
                    req.lineItems?.some((item) =>
                      item.itemName
                        ?.toLowerCase()
                        .includes(searchQuery.toLowerCase()),
                    ),
                )}
                isLoading={false}
                emptyMessage={
                  searchQuery || filterStatus !== "all"
                    ? "No material requests found. Try adjusting your filters."
                    : "Create a new request to get started."
                }
                keyExtractor={(req) => req._id}
              />
            </div>
          </div>
        )}

        {/* Request Form - New Consolidated Design */}
        {showForm && (
          <div className="flex-1 w-full max-w-[1400px] mx-auto px-2 sm:px-6 py-8">
            {/* Page Heading */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-[#111418]">
                  {isEditMode
                    ? "Edit Material Request"
                    : "Create Material Request"}
                </h1>
                <p className="text-[#617589] mt-1">
                  {isEditMode
                    ? "Update the details below to modify your request."
                    : "Fill in the details below to submit a new procurement request."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold uppercase tracking-wider">
                  Draft
                </span>
              </div>
            </div>

            {/* Main Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* SECTION 1: General Info & Requester */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Request Details (2 cols wide) */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="text-base font-bold text-[#111418]">
                      General Information
                    </h3>
                  </div>
                  <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-[#111418]">
                        Request Type <span className="text-red-500">*</span>
                      </span>
                      <div className="relative">
                        <i className="fa-solid fa-tag absolute left-3 top-1/2 -translate-y-1/2 text-[#617589] text-sm"></i>
                        <select
                          name="requestType"
                          value={formData.requestType || ""}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] pl-10 pr-8 py-2.5 appearance-none"
                          required
                        >
                          <option value="">Select Request Type</option>
                          <option value="Internal Transfer">
                            Internal Transfer (From Inventory)
                          </option>
                          <option value="RFQ">
                            RFQ (Request for Quotation)
                          </option>
                          <option value="Purchase Request">
                            Purchase Request
                          </option>
                          <option value="Emergency Purchase">
                            Emergency Purchase
                          </option>
                          <option value="Stock Replenishment">
                            Stock Replenishment
                          </option>
                        </select>
                        {/* <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#617589] text-xs"></i> */}
                      </div>
                      {formData.requestType === "Internal Transfer" && (
                        <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                          <i className="fa-solid fa-info-circle"></i>
                          Items will be pulled from existing inventory if
                          available
                        </p>
                      )}
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-[#111418]">
                        Request Title <span className="text-red-500">*</span>
                      </span>
                      <input
                        type="text"
                        name="requestTitle"
                        value={formData.requestTitle || ""}
                        onChange={handleFormChange}
                        className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] px-4 py-2.5"
                        placeholder="e.g. Q4 Office Supplies Restock"
                        required
                      />
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-[#111418]">
                        Department <span className="text-red-500">*</span>
                      </span>
                      <div className="relative">
                        <i className="fa-solid fa-building absolute left-3 top-1/2 -translate-y-1/2 text-[#617589] text-sm"></i>
                        <select
                          name="department"
                          value={formData.department || user?.department || ""}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] pl-10 pr-8 py-2.5 appearance-none"
                          required
                        >
                          <option value="">Select Department</option>
                          {(_departments || []).map((dept) => (
                            <option
                              key={dept._id || dept.name}
                              value={dept.name}
                            >
                              {dept.name}
                            </option>
                          ))}
                        </select>
                        {/* <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#617589] text-xs"></i> */}
                      </div>
                    </label>

                    <label className="flex flex-col gap-2 sm:col-span-2">
                      <span className="text-sm font-medium text-[#111418]">
                        Budget Category
                      </span>
                      <div className="relative">
                        <i className="fa-solid fa-wallet absolute left-3 top-1/2 -translate-y-1/2 text-[#617589] text-sm"></i>
                        <select
                          name="budgetCode"
                          value={formData.budgetCode || ""}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] pl-10 pr-8 py-2.5 appearance-none"
                        >
                          <option value="">-- Select Budget Category --</option>
                          {budgetLoading ? (
                            <option disabled>Loading categories...</option>
                          ) : (
                            budgetCategories.map((cat) => (
                              <option
                                key={
                                  cat._id ||
                                  cat.id ||
                                  `${cat.name}-${cat.period}`
                                }
                                value={cat.name}
                              >
                                {cat.period
                                  ? `${cat.name} (${cat.period})`
                                  : cat.name}
                              </option>
                            ))
                          )}
                        </select>
                        {/* <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#617589] text-xs"></i> */}
                      </div>
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-[#111418]">
                        Currency <span className="text-red-500">*</span>
                      </span>
                      <div className="relative">
                        <i className="fa-solid fa-coins absolute left-3 top-1/2 -translate-y-1/2 text-[#617589] text-sm"></i>
                        <select
                          name="currency"
                          value={formData.currency || appCurrency}
                          onChange={(e) => {
                            handleFormChange(e);
                            if (e.target.value === "NGN") {
                              setFormData((prev) => ({
                                ...prev,
                                exchangeRate: "",
                              }));
                            }
                          }}
                          className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] pl-10 pr-8 py-2.5 appearance-none"
                        >
                          {currencyLoading ? (
                            <option value={appCurrency || "NGN"}>
                              Loading currencies...
                            </option>
                          ) : (
                            currencyOptions.map((currency) => (
                              <option key={currency.code} value={currency.code}>
                                {currency.code} - {currency.label}
                                {currency.symbol ? ` (${currency.symbol})` : ""}
                              </option>
                            ))
                          )}
                        </select>
                        {/* <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#617589] text-xs"></i> */}
                      </div>
                    </label>

                    {(formData.currency || appCurrency) !== "NGN" && (
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-[#111418]">
                          Exchange Rate to NGN{" "}
                          <span className="text-red-500">*</span>
                        </span>
                        <div className="relative">
                          <i className="fa-solid fa-chart-line absolute left-3 top-1/2 -translate-y-1/2 text-[#617589] text-sm"></i>
                          <input
                            type="number"
                            min="0.00000"
                            step="0.00000"
                            name="exchangeRate"
                            value={formData.exchangeRate || ""}
                            onChange={handleFormChange}
                            placeholder="e.g. 1600"
                            className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] pl-10 pr-4 py-2.5"
                            required
                          />
                        </div>
                        <p className="text-xs text-[#617589]">
                          1 {formData.currency || appCurrency} ={" "}
                          {formData.exchangeRate || "..."} NGN
                        </p>
                      </label>
                    )}
                  </div>
                </div>

                {/* Right: Requester Info (Read Only) (1 col wide) */}
                <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-fit">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="text-base font-bold text-[#111418]">
                      Requester Details
                    </h3>
                  </div>
                  <div className="p-6 flex flex-col gap-4">
                    <div className="flex items-center gap-4 mb-2">
                      <div className="w-12 h-12 rounded-full bg-[#137fec] flex items-center justify-center text-white text-lg font-bold border border-gray-200">
                        {user?.fullName?.charAt(0)?.toUpperCase() || "U"}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#111418]">
                          {user?.fullName ||
                            user?.primaryEmailAddress?.emailAddress ||
                            "Loading..."}
                        </p>
                        <p className="text-xs text-[#617589]">
                          {user?.jobTitle || "Staff Member"}
                        </p>
                      </div>
                    </div>

                    <label className="flex flex-col gap-1.5 opacity-70">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#617589]">
                        Department
                      </span>
                      <input
                        type="text"
                        className="w-full rounded-lg border-transparent bg-gray-100 text-[#111418] px-3 py-2 text-sm cursor-not-allowed"
                        value={
                          formData.department ||
                          user?.department ||
                          "Not specified"
                        }
                        readOnly
                      />
                    </label>

                    <label className="flex flex-col gap-1.5 opacity-70">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#617589]">
                        Email
                      </span>
                      <input
                        type="email"
                        className="w-full rounded-lg border-transparent bg-gray-100 text-[#111418] px-3 py-2 text-sm cursor-not-allowed"
                        value={
                          user?.primaryEmailAddress?.emailAddress ||
                          user?.email ||
                          ""
                        }
                        readOnly
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Material Details */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                  <h3 className="text-base font-bold text-[#111418]">
                    <i className="fa-solid fa-boxes-stacked text-[#137fec] mr-2"></i>
                    Material Details
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-[#617589] bg-white px-2.5 py-1 rounded-full border border-gray-200">
                      {lineItems.length}{" "}
                      {lineItems.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {lineItems.map((item, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-4 hover:border-[#137fec]/30 hover:shadow-sm transition-all bg-white group relative"
                    >
                      {/* Item number badge & remove */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-white bg-[#137fec] px-2 py-0.5 rounded-full">
                          Item {index + 1}
                        </span>
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50"
                            onClick={() => removeLineItem(index)}
                          >
                            <i className="fa-solid fa-trash-can text-sm"></i>
                          </button>
                        )}
                      </div>

                      {/* Row 1: Item select + Description */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-[#617589] uppercase tracking-wider">
                            Item / SKU
                          </span>
                          <select
                            className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] px-3 py-2.5 text-sm"
                            value={item.itemName}
                            onChange={(e) => {
                              const selected = itemOptions.find(
                                (o) => o.value === e.target.value,
                              );
                              handleLineItemChange(
                                index,
                                "itemName",
                                e.target.value,
                              );
                              if (selected) {
                                if (selected.unitPrice)
                                  handleLineItemChange(
                                    index,
                                    "amount",
                                    selected.unitPrice,
                                  );
                                if (selected.unit)
                                  handleLineItemChange(
                                    index,
                                    "quantityType",
                                    selected.unit,
                                  );
                              }
                            }}
                            required
                          >
                            <option value="">Select item...</option>
                            {itemOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-[#617589] uppercase tracking-wider">
                            Description
                          </span>
                          <input
                            type="text"
                            className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] px-3 py-2.5 text-sm"
                            placeholder="Brief description..."
                            value={item.description}
                            onChange={(e) =>
                              handleLineItemChange(
                                index,
                                "description",
                                e.target.value,
                              )
                            }
                          />
                        </label>
                      </div>

                      {/* Row 2: Qty, UoM, Unit Cost, Total */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-[#617589] uppercase tracking-wider">
                            Qty
                          </span>
                          <input
                            type="number"
                            className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] px-3 py-2.5 text-sm"
                            min="1"
                            placeholder="0"
                            value={item.quantity}
                            onChange={(e) =>
                              handleLineItemChange(
                                index,
                                "quantity",
                                e.target.value,
                              )
                            }
                            required
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-[#617589] uppercase tracking-wider">
                            Unit
                          </span>
                          <select
                            className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] px-3 py-2.5 text-sm"
                            value={item.quantityType}
                            onChange={(e) =>
                              handleLineItemChange(
                                index,
                                "quantityType",
                                e.target.value,
                              )
                            }
                            required
                          >
                            <option value="">Select...</option>
                            {quantityTypeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-[#617589] uppercase tracking-wider">
                            Unit Cost
                          </span>
                          <NumericFormat
                            className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] px-3 py-2.5 text-sm"
                            value={item.amount}
                            thousandSeparator
                            allowNegative={false}
                            decimalScale={2}
                            fixedDecimalScale
                            placeholder="0.00"
                            prefix={getCurrencySymbol(
                              formData.currency || appCurrency || "NGN",
                            )}
                            onValueChange={(values) => {
                              handleLineItemChange(
                                index,
                                "amount",
                                values.value,
                              );
                            }}
                          />
                        </label>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-[#617589] uppercase tracking-wider">
                            Line Total
                          </span>
                          <div className="flex items-center h-[42px] px-3 rounded-lg bg-gray-50 border border-gray-200">
                            <div className="flex flex-col leading-tight">
                              <span className="text-sm font-bold text-[#111418]">
                                {formatCurrency(
                                  (parseFloat(item.quantity) || 0) *
                                    (parseFloat(item.amount) || 0),
                                  {
                                    currency: formData.currency || appCurrency,
                                  },
                                )}
                              </span>
                              {(formData.currency || appCurrency) !== "NGN" &&
                                parseFloat(formData.exchangeRate) > 0 && (
                                  <span className="text-[11px] text-[#617589]">
                                    ≈{" "}
                                    {formatCurrency(
                                      (parseFloat(item.quantity) || 0) *
                                        (parseFloat(item.amount) || 0) *
                                        (parseFloat(formData.exchangeRate) ||
                                          1),
                                      { currency: "NGN" },
                                    )}
                                  </span>
                                )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer: Add Item + Grand Total */}
                <div className="px-4 py-4 bg-gray-50 border-t border-gray-200">
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <button
                      type="button"
                      onClick={addLineItem}
                      className="flex items-center gap-2 text-[#137fec] hover:text-[#0d6efd] font-semibold text-sm px-3 py-2 rounded-lg hover:bg-[#137fec]/10 border border-dashed border-[#137fec]/40 transition-colors"
                    >
                      <i className="fa-solid fa-plus text-sm"></i>
                      Add Another Item
                    </button>
                    <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-lg border border-gray-200 shadow-sm">
                      <div className="flex flex-col">
                        <span className="text-sm text-[#617589] font-medium">
                          Grand Total
                        </span>
                        <span className="text-xl font-bold text-[#111418]">
                          {formatCurrency(
                            lineItems.reduce(
                              (sum, item) =>
                                sum +
                                (parseFloat(item.quantity) || 0) *
                                  (parseFloat(item.amount) || 0),
                              0,
                            ),
                            { currency: formData.currency || appCurrency },
                          )}
                        </span>
                        {(formData.currency || appCurrency) !== "NGN" &&
                          parseFloat(formData.exchangeRate) > 0 && (
                            <span className="text-xs text-[#617589]">
                              ≈{" "}
                              {formatCurrency(
                                lineItems.reduce(
                                  (sum, item) =>
                                    sum +
                                    (parseFloat(item.quantity) || 0) *
                                      (parseFloat(item.amount) || 0),
                                  0,
                                ) * (parseFloat(formData.exchangeRate) || 1),
                                { currency: "NGN" },
                              )}
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Comment & Approval */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-base font-bold text-[#111418]">
                    Comment
                  </h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2 md:col-span-2">
                    <span className="text-sm font-medium text-[#111418]">
                      Comment <span className="text-red-500">*</span>
                    </span>
                    <div className="relative">
                      <textarea
                        ref={formCommentRef}
                        name="reason"
                        value={message}
                        onChange={(e) => {
                          setMessage(e.target.value);
                          const val = e.target.value;
                          const pos = e.target.selectionStart;
                          const textBefore = val.substring(0, pos);
                          const atMatch = textBefore.match(/@(\w*)$/);
                          if (atMatch) {
                            setShowFormMentionDropdown(true);
                            setFormMentionSearch(atMatch[1].toLowerCase());
                          } else {
                            setShowFormMentionDropdown(false);
                            setFormMentionSearch("");
                          }
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !showFormMentionDropdown
                          ) {
                            e.preventDefault();
                            if (message.trim()) {
                              e.target.form?.requestSubmit();
                            }
                          }
                        }}
                        className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] px-4 py-3 min-h-[100px]"
                        placeholder="Add a comment or justification... Use @ to mention someone (Enter to submit, Shift+Enter for new line)"
                        required
                      />
                      {showFormMentionDropdown && (
                        <div className="absolute z-50 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-y-auto w-[280px]">
                          {userList
                            .filter((u) =>
                              u.name?.toLowerCase().includes(formMentionSearch),
                            )
                            .slice(0, 8)
                            .map((u) => (
                              <button
                                key={u.id || u._id}
                                type="button"
                                className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                                onClick={() => {
                                  const textarea = formCommentRef.current;
                                  if (!textarea) return;
                                  const pos = textarea.selectionStart;
                                  const text = message;
                                  const before = text.substring(0, pos);
                                  const after = text.substring(pos);
                                  const replaced = before.replace(
                                    /@(\w*)$/,
                                    `@${u.name} `,
                                  );
                                  setMessage(replaced + after);
                                  setShowFormMentionDropdown(false);
                                  setTimeout(() => textarea.focus(), 0);
                                }}
                              >
                                <strong className="text-[#111418] text-sm">
                                  {u.name}
                                </strong>
                                {u.role && (
                                  <>
                                    <br />
                                    <small className="text-[#617589]">
                                      {u.role}
                                    </small>
                                  </>
                                )}
                              </button>
                            ))}
                          {userList.filter((u) =>
                            u.name?.toLowerCase().includes(formMentionSearch),
                          ).length === 0 && (
                            <div className="px-4 py-3 text-center text-[#617589] text-sm">
                              No users found
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls,.csv"
                        className="hidden"
                        id="mr-attachment-input"
                        onChange={(e) => {
                          const files = Array.from(e.target.files);
                          setAttachments((prev) => [
                            ...prev,
                            ...normalizePickedAttachments(files),
                          ]);
                          e.target.value = null;
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          document
                            .getElementById("mr-attachment-input")
                            ?.click()
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#617589] hover:text-[#137fec] hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <i className="fa-solid fa-paperclip"></i>
                        <span>Attach File</span>
                      </button>
                      {attachments.length > 0 && (
                        <span className="text-xs text-[#617589]">
                          {attachments.length} file
                          {attachments.length > 1 ? "s" : ""} attached
                        </span>
                      )}
                    </div>
                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {attachments.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-sm"
                          >
                            <i className="fa-solid fa-file text-[#617589] text-xs"></i>
                            <span className="text-[#111418] text-xs">
                              {getAttachmentName(file)}
                            </span>
                            <button
                              type="button"
                              className="text-red-400 hover:text-red-600 ml-1"
                              onClick={() =>
                                setAttachments((prev) =>
                                  prev.filter((_, i) => i !== index),
                                )
                              }
                            >
                              <i className="fa-solid fa-times text-xs"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:px-6 sm:py-4 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetCreateForm();
                  }}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-lg text-sm font-bold text-[#617589] hover:bg-gray-100 hover:text-[#111418] transition-colors"
                >
                  Cancel
                </button>
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={isSavingDraft || isSubmitting}
                    onClick={async () => {
                      setIsSavingDraft(true);
                      try {
                        const selectedCurrency =
                          formData.currency || appCurrency || "NGN";
                        const isForeignCurrency = selectedCurrency !== "NGN";
                        const exchangeRateToNgn = parseFloat(
                          formData.exchangeRate,
                        );
                        const effectiveRateToNgn =
                          isForeignCurrency && exchangeRateToNgn > 0
                            ? exchangeRateToNgn
                            : 1;

                        if (!formData.requestType) {
                          toast.error(
                            "Please select a request type before saving a draft",
                          );
                          setIsSavingDraft(false);
                          return;
                        }

                        if (isForeignCurrency && !(exchangeRateToNgn > 0)) {
                          toast.error(
                            "Please enter a valid exchange rate to convert to NGN",
                          );
                          setIsSavingDraft(false);
                          return;
                        }

                        const validLineItems = lineItems.filter(
                          (item) =>
                            item.itemName && item.quantity && item.quantityType,
                        );

                        const normalizedLineItems = validLineItems.map(
                          (item) => {
                            const quantity = parseFloat(item.quantity) || 0;
                            const amount = parseFloat(item.amount) || 0;
                            return {
                              ...item,
                              quantity,
                              amount,
                              amountNgn: amount * effectiveRateToNgn,
                              lineTotalNgn:
                                quantity * amount * effectiveRateToNgn,
                            };
                          },
                        );

                        const requestData = {
                          ...formData,
                          currency: selectedCurrency,
                          exchangeRate: isForeignCurrency
                            ? String(exchangeRateToNgn)
                            : "",
                          exchangeRateToNgn: effectiveRateToNgn,
                          lineItems: normalizedLineItems,
                          totalAmountNgn: normalizedLineItems.reduce(
                            (sum, item) => sum + item.lineTotalNgn,
                            0,
                          ),
                          requestedBy:
                            user?.fullName ||
                            user?.primaryEmailAddress?.emailAddress ||
                            "Unknown User",
                          date: new Date().toISOString().split("T")[0],
                          status: "draft",
                          attachments: await serializeAttachments(attachments),
                          message: message,
                        };

                        if (requestData.lineItems.length === 0) {
                          toast.error(
                            "Please add at least one valid line item with name, quantity, and type",
                          );
                          setIsSavingDraft(false);
                          return;
                        }

                        if (isEditMode && selectedRequest) {
                          await apiService.put(
                            `/api/material-requests/${selectedRequest._id}`,
                            requestData,
                          );
                          toast.success("Draft updated successfully!");
                        } else {
                          await apiService.post(
                            "/api/material-requests",
                            requestData,
                          );
                          toast.success("Draft saved successfully!");
                        }

                        setShowForm(false);
                        setIsEditMode(false);
                        setSelectedRequest(null);
                        setFormData({
                          requestType: "",
                          approver: "",
                          department: "",
                          requestTitle: "",
                          requiredByDate: "",
                          budgetCode: "",
                          reason: "",
                          currency: appCurrency,
                          exchangeRate: "",
                        });
                        setLineItems([
                          {
                            itemName: "",
                            quantity: "",
                            quantityType: "",
                            amount: "",
                            description: "",
                          },
                        ]);
                        setAttachments([]);
                        setMessage("");
                        localStorage.removeItem("materialRequestsState");
                        fetchRequests();
                      } catch {
                        toast.error("Failed to save draft");
                      } finally {
                        setIsSavingDraft(false);
                      }
                    }}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg border border-gray-300 bg-white text-[#111418] text-sm font-bold hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingDraft ? (
                      <i className="fa-solid fa-circle-notch fa-spin text-base"></i>
                    ) : (
                      <i className="fa-solid fa-floppy-disk text-base"></i>
                    )}
                    {isSavingDraft ? "Saving..." : "Save Draft"}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || isSavingDraft}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg bg-[#137fec] hover:bg-[#0d6efd] text-white text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <i className="fa-solid fa-circle-notch fa-spin text-base"></i>
                    ) : (
                      <i className="fa-solid fa-paper-plane text-base"></i>
                    )}
                    {isSubmitting
                      ? "Submitting..."
                      : isEditMode
                        ? selectedRequest?.status === "draft"
                          ? "Complete Draft & Submit"
                          : "Update Request"
                        : "Submit Request"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Approval Modal */}
      {showApprovalModal && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
              <h5 className="text-xl font-semibold flex items-center gap-2">
                <i className="fa-solid fa-clipboard-check"></i>
                Approve Material Request
              </h5>
              <button
                type="button"
                className="text-white hover:text-gray-200 transition-colors"
                onClick={() => {
                  setShowApprovalModal(false);
                  setShowViewModal(true);
                  setRejectionReason("");
                }}
              >
                <i className="fa-solid fa-times text-xl"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <strong className="text-gray-700">Request ID:</strong>{" "}
                  <span className="text-gray-900">
                    {selectedRequest._id || selectedRequest.requestId}
                  </span>
                </div>
                <div>
                  <strong className="text-gray-700">Request Type:</strong>{" "}
                  <span className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-blue-100 text-blue-800">
                    {selectedRequest.requestType}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <strong className="text-gray-700">Requested By:</strong>{" "}
                  <span className="text-gray-900">
                    {selectedRequest.requestedBy}
                  </span>
                </div>
                <div>
                  <strong className="text-gray-700">Department:</strong>{" "}
                  <span className="text-gray-900">
                    {selectedRequest.department}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <strong className="text-gray-700">Date:</strong>{" "}
                  <span className="text-gray-900">
                    {selectedRequest.requestDate
                      ? new Date(
                          selectedRequest.requestDate,
                        ).toLocaleDateString()
                      : new Date(
                          selectedRequest.createdAt,
                        ).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <strong className="text-gray-700">Approver:</strong>{" "}
                  <span className="text-gray-900">
                    {selectedRequest.approver}
                  </span>
                </div>
              </div>

              <hr className="my-4 border-gray-200" />

              <h6 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <i className="fa-solid fa-list-ul"></i>Line Items
              </h6>
              <div className="overflow-x-auto mb-4">
                <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Unit
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {selectedRequest.lineItems?.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {item.itemName}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {item.quantityType}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {formatCurrency(item.amount, {
                            currency: selectedRequest.currency,
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {item.description || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedRequest.message && (
                <div className="mb-4">
                  <strong className="text-gray-700">Message:</strong>
                  <div className="p-3 bg-gray-100 rounded mt-2 text-gray-900">
                    {selectedRequest.message}
                  </div>
                </div>
              )}

              {selectedRequest.attachments &&
                selectedRequest.attachments.length > 0 && (
                  <div className="mb-4">
                    <strong className="text-gray-700">Attachments:</strong>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedRequest.attachments.map((file, idx) => {
                        const fileName =
                          typeof file === "string" ? file : file.fileName;
                        const fileData =
                          typeof file === "string" ? null : file.fileData;
                        return (
                          <div
                            key={idx}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-800 border border-gray-200"
                          >
                            <i className="fa-solid fa-file text-gray-500"></i>
                            <span className="truncate max-w-[150px]">
                              {fileName}
                            </span>
                            {fileData && (
                              <button
                                type="button"
                                onClick={() => {
                                  const a = document.createElement("a");
                                  a.href = fileData;
                                  a.download = fileName;
                                  a.click();
                                }}
                                className="text-blue-600 hover:text-blue-800 ml-1"
                                title="Download"
                              >
                                <i className="fa-solid fa-download text-xs"></i>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              <hr className="my-4 border-gray-200" />

              <h6 className="text-lg font-semibold mb-3 text-green-600 flex items-center gap-2">
                <i className="fa-solid fa-circle-check"></i>
                Approval Action
              </h6>

              {selectedRequest.requestType === "Internal Transfer" && (
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <i className="fa-solid fa-warehouse text-blue-600 text-xl mt-1"></i>
                    <div>
                      <h6 className="font-semibold text-blue-900 mb-1">
                        Internal Transfer Request
                      </h6>
                      <p className="text-sm text-blue-700">
                        Upon approval, items will be automatically pulled from
                        existing inventory if available. Insufficient stock will
                        be noted in the fulfillment report.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason (if rejecting)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                ></textarea>
              </div>
            </div>
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex flex-col-reverse sm:flex-row justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium flex items-center justify-center gap-2"
                onClick={() => {
                  setShowApprovalModal(false);
                  setShowViewModal(true);
                  setRejectionReason("");
                }}
              >
                <i className="fa-solid fa-circle-xmark"></i>
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleRejectRequest}
                disabled={!rejectionReason.trim() || isRejecting || isApproving}
              >
                {isRejecting ? (
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                ) : (
                  <i className="fa-solid fa-xmark"></i>
                )}
                {isRejecting ? "Rejecting..." : "Reject Request"}
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleApproveRequest}
                disabled={isApproving || isRejecting}
              >
                {isApproving ? (
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                ) : (
                  <i className="fa-solid fa-check"></i>
                )}
                {isApproving
                  ? "Approving..."
                  : selectedRequest.requestType === "Internal Transfer"
                    ? "Approve & Fulfill from Inventory"
                    : "Approve Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View/Review Modal - Full Page View */}
      {showViewModal && selectedRequest && (
        <div className="fixed inset-0 z-50 bg-gray-50 overflow-auto">
          <div className="min-h-screen flex flex-col">
            {/* Navbar */}
            <Navbar user={user} />

            {/* Breadcrumb */}
            <div className="w-full bg-gray-50 px-1">
              <Breadcrumb
                items={[
                  { label: "Home", href: "/home", icon: "fa-house" },
                  {
                    label: "Material Requests",
                    icon: "fa-box",
                    onClick: (e) => {
                      e.preventDefault();
                      setShowViewModal(false);
                      setSelectedRequest(null);
                    },
                  },
                  {
                    label: `Request #${selectedRequest.requestId || selectedRequest._id}`,
                    // icon: "fa-eye",
                  },
                ]}
              />
            </div>

            {/* Header Section */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
              <div className="max-w-[1590px] mx-auto">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <h1 className="text-[#111418] text-3xl font-bold leading-tight tracking-tight">
                        Material Request #
                        {selectedRequest.requestId || selectedRequest._id}
                      </h1>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                          selectedRequest.status === "pending"
                            ? "bg-amber-100 text-amber-800"
                            : selectedRequest.status === "approved"
                              ? "bg-green-100 text-green-800"
                              : selectedRequest.status === "rejected"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {selectedRequest.status === "pending"
                          ? "Pending Your Review"
                          : selectedRequest.status === "approved"
                            ? "Approved"
                            : selectedRequest.status === "rejected"
                              ? "Rejected"
                              : selectedRequest.status}
                      </span>
                    </div>
                    <p className="text-[#617589] text-sm font-normal">
                      Created on{" "}
                      {new Date(
                        selectedRequest.date || selectedRequest.createdAt,
                      ).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 pb-4 pt-4">
                  <button
                    onClick={() => {
                      const printWindow = window.open("", "_blank");
                      if (!printWindow) return;
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Material Request - ${selectedRequest.requestId || selectedRequest._id}</title>
                            <style>
                              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #111; }
                              h1 { font-size: 24px; margin-bottom: 4px; }
                              h3 { font-size: 16px; margin: 20px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
                              .meta { color: #666; font-size: 13px; margin-bottom: 20px; }
                              .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
                              .badge-pending { background: #fef3c7; color: #92400e; }
                              .badge-approved { background: #d1fae5; color: #065f46; }
                              .badge-rejected { background: #fee2e2; color: #991b1b; }
                              .badge-draft { background: #e5e7eb; color: #374151; }
                              table { width: 100%; border-collapse: collapse; margin: 12px 0; }
                              th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
                              th { background: #f9fafb; font-weight: 600; }
                              .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 12px 0; }
                              .info-item label { font-size: 11px; color: #666; text-transform: uppercase; }
                              .info-item p { font-size: 14px; margin: 2px 0 0; }
                              .total-row { font-weight: 700; background: #f0f9ff; }
                              .comment { background: #f9fafb; border: 1px solid #eee; border-radius: 6px; padding: 10px; margin: 6px 0; }
                              .comment .author { font-weight: 600; font-size: 13px; }
                              .comment .time { font-size: 11px; color: #888; }
                              .comment .text { font-size: 13px; margin-top: 4px; }
                              @media print { body { padding: 20px; } }
                            </style>
                          </head>
                          <body>
                            <h1>Material Request #${selectedRequest.requestId || ""}</h1>
                            <p class="meta">Created: ${new Date(selectedRequest.date || selectedRequest.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                            &nbsp;|&nbsp; Status: <span class="badge badge-${selectedRequest.status}">${selectedRequest.status?.charAt(0).toUpperCase() + selectedRequest.status?.slice(1)}</span></p>

                            <h3>Request Details</h3>
                            <div class="info-grid">
                              <div class="info-item"><label>Request Type</label><p>${selectedRequest.requestType || "N/A"}</p></div>
                              <div class="info-item"><label>Department</label><p>${selectedRequest.department || "N/A"}</p></div>
                              <div class="info-item"><label>Requested By</label><p>${selectedRequest.requestedBy || "N/A"}</p></div>
                              <div class="info-item"><label>Approver</label><p>${selectedRequest.approver || "Auto-assigned"}</p></div>
                              <div class="info-item"><label>Required By</label><p>${selectedRequest.requiredByDate ? new Date(selectedRequest.requiredByDate).toLocaleDateString() : "N/A"}</p></div>
                              <div class="info-item"><label>Budget Code</label><p>${selectedRequest.budgetCode || "N/A"}</p></div>
                            </div>

                            <h3>Line Items</h3>
                            <table>
                              <thead><tr><th>#</th><th>Item</th><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th>Total</th></tr></thead>
                              <tbody>
                                ${(selectedRequest.lineItems || [])
                                  .map(
                                    (item, i) =>
                                      "<tr><td>" +
                                      (i + 1) +
                                      "</td><td>" +
                                      (item.itemName || "") +
                                      "</td><td>" +
                                      (item.description || "-") +
                                      "</td><td>" +
                                      (item.quantity || 0) +
                                      "</td><td>" +
                                      (item.quantityType || "-") +
                                      "</td><td>" +
                                      (parseFloat(item.amount) || 0).toFixed(
                                        2,
                                      ) +
                                      "</td><td>" +
                                      (
                                        (parseFloat(item.quantity) || 0) *
                                        (parseFloat(item.amount) || 0)
                                      ).toFixed(2) +
                                      "</td></tr>",
                                  )
                                  .join("")}
                                <tr class="total-row"><td colspan="6" style="text-align:right">Grand Total</td><td>${(selectedRequest.lineItems || []).reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.amount) || 0), 0).toFixed(2)}</td></tr>
                              </tbody>
                            </table>

                            ${selectedRequest.comments && selectedRequest.comments.length > 0 ? "<h3>Comments</h3>" + selectedRequest.comments.map((c) => '<div class="comment"><span class="author">' + (c.author || "") + '</span> <span class="time">' + new Date(c.timestamp).toLocaleString() + '</span><div class="text">' + (c.text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</div></div>").join("") : ""}
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                      printWindow.focus();
                      setTimeout(() => {
                        printWindow.print();
                        printWindow.close();
                      }, 400);
                    }}
                    className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white border border-gray-300 px-5 text-[#111418] shadow-sm hover:bg-gray-50 transition-colors text-sm font-bold"
                  >
                    <i className="fa-solid fa-print"></i>
                    <span className="truncate">Print</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 w-full max-w-[1590px] mx-auto p-6">
              <div className="grid grid-cols-1 gap-6">
                {/* Left Column - Main Details */}
                <div className="flex flex-col gap-6">
                  {/* Request Overview */}
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                      <i className="fa-solid fa-info-circle text-gray-500"></i>
                      <h3 className="text-lg font-bold text-[#111418]">
                        Request Overview
                      </h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                      <div className="flex flex-col gap-1">
                        <p className="text-[#617589] text-sm">Requester</p>
                        <div className="flex items-center gap-2">
                          <div className="bg-[#137fec]/20 text-[#137fec] h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold">
                            {selectedRequest.requestedBy
                              ?.charAt(0)
                              ?.toUpperCase() || "U"}
                          </div>
                          <p className="text-[#111418] text-base font-medium">
                            {selectedRequest.requestedBy}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[#617589] text-sm">Department</p>
                        <p className="text-[#111418] text-base font-medium">
                          {selectedRequest.department || "Not specified"}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[#617589] text-sm">
                          Required By Date
                        </p>
                        <p className="text-[#111418] text-base font-medium">
                          {selectedRequest.requiredByDate
                            ? new Date(
                                selectedRequest.requiredByDate,
                              ).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })
                            : "Not specified"}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[#617589] text-sm">
                          Budget Code / Project
                        </p>
                        <p className="text-[#111418] text-base font-medium">
                          {selectedRequest.budgetCode || "Not specified"}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[#617589] text-sm">Currency</p>
                        <p className="text-[#111418] text-base font-medium">
                          {selectedRequest.currency || "NGN"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Material Details Table */}
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-box text-gray-500"></i>
                        <h3 className="text-lg font-bold text-[#111418]">
                          Material Details
                        </h3>
                      </div>
                      <span className="text-sm text-gray-500 font-medium">
                        {(selectedRequest.lineItems || []).length} Items
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[700px]">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[25%]">
                              Item Name/SKU
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[30%]">
                              Description
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">
                              Qty
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">
                              UoM
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[12%]">
                              Unit Cost
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[13%]">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {(selectedRequest.lineItems || []).map(
                            (item, idx) => (
                              <tr key={idx}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[#111418]">
                                  {item.itemName}
                                </td>
                                <td className="px-6 py-4 text-sm text-[#617589]">
                                  {item.description || "-"}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-[#111418] font-medium">
                                  {item.quantity}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-[#617589]">
                                  {item.quantityType}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-[#617589]">
                                  {formatCurrency(item.amount, {
                                    currency: selectedRequest.currency,
                                  })}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-[#111418]">
                                  {formatCurrency(item.quantity * item.amount, {
                                    currency: selectedRequest.currency,
                                  })}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                          <tr>
                            <td
                              className="px-6 py-4 text-sm font-bold text-right text-[#111418] uppercase"
                              colSpan="5"
                            >
                              Total Estimated Cost
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-right text-[#137fec]">
                              {formatCurrency(
                                (selectedRequest.lineItems || []).reduce(
                                  (sum, item) =>
                                    sum + item.quantity * item.amount,
                                  0,
                                ),
                                { currency: selectedRequest.currency },
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Approval History (show here first for pending approver flow) */}
                  {isUserApprover(selectedRequest) &&
                    selectedRequest.status === "pending" && (
                      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                          <i className="fa-solid fa-clock-rotate-left text-gray-500"></i>
                          <h3 className="text-lg font-bold text-[#111418]">
                            Approval History
                          </h3>
                        </div>
                        <div className="p-6">
                          <div className="relative pl-4 border-l-2 border-gray-200 space-y-8">
                            {/* Request Submitted */}
                            <div className="relative">
                              <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-green-500 ring-4 ring-white"></div>
                              <div className="flex flex-col gap-1">
                                <p className="text-sm font-bold text-[#111418]">
                                  Request Submitted
                                </p>
                                <p className="text-xs text-[#617589]">
                                  {new Date(
                                    selectedRequest.date ||
                                      selectedRequest.createdAt,
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="bg-gray-200 text-gray-600 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold">
                                    {selectedRequest.requestedBy
                                      ?.charAt(0)
                                      ?.toUpperCase() || "U"}
                                  </div>
                                  <span className="text-sm text-[#111418]">
                                    {selectedRequest.requestedBy}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Current Status */}
                            {selectedRequest.status === "pending" && (
                              <div className="relative">
                                <div className="absolute -left-[23px] top-0 h-4 w-4 rounded-full border-2 border-[#137fec] bg-white animate-pulse"></div>
                                <div className="flex flex-col gap-1">
                                  <p className="text-sm font-bold text-[#137fec]">
                                    Pending Review
                                  </p>
                                  <p className="text-xs text-[#617589]">
                                    Awaiting Action
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-sm text-[#617589]">
                                      Assigned to:{" "}
                                      {selectedRequest.approver ||
                                        "Not assigned"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {selectedRequest.status === "approved" && (
                              <div className="relative">
                                <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-green-500 ring-4 ring-white"></div>
                                <div className="flex flex-col gap-1">
                                  <p className="text-sm font-bold text-[#111418]">
                                    Approved
                                  </p>
                                  <p className="text-xs text-[#617589]">
                                    {selectedRequest.approvedDate
                                      ? new Date(
                                          selectedRequest.approvedDate,
                                        ).toLocaleDateString()
                                      : "Recently"}
                                  </p>
                                  <span className="ml-auto text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded w-fit">
                                    Approved
                                  </span>
                                </div>
                              </div>
                            )}

                            {selectedRequest.status === "rejected" &&
                              selectedRequest.rejectionReason && (
                                <div className="relative">
                                  <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-red-500 ring-4 ring-white"></div>
                                  <div className="flex flex-col gap-1">
                                    <p className="text-sm font-bold text-[#111418]">
                                      Rejected
                                    </p>
                                    <p className="text-xs text-[#617589]">
                                      {selectedRequest.rejectedDate
                                        ? new Date(
                                            selectedRequest.rejectedDate,
                                          ).toLocaleDateString()
                                        : "Recently"}
                                    </p>
                                    <div className="mt-2 rounded bg-gray-50 p-2 text-xs italic text-gray-600 border border-gray-100">
                                      "{selectedRequest.rejectionReason}"
                                    </div>
                                  </div>
                                </div>
                              )}
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Activity & Comments */}
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-timeline text-gray-500"></i>
                        <h3 className="text-lg font-bold text-[#111418]">
                          Activity & Comments
                        </h3>
                      </div>
                      <span className="text-sm text-gray-500 font-medium">
                        {(selectedRequest.activities?.length || 0) +
                          (selectedRequest.comments?.length || 0)}{" "}
                        Entries
                      </span>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto p-6 flex flex-col gap-4">
                      {(() => {
                        const activities = (
                          selectedRequest.activities || []
                        ).map((a) => ({
                          ...a,
                          _type: "activity",
                          _time: new Date(a.timestamp).getTime(),
                        }));
                        const comments = (selectedRequest.comments || []).map(
                          (c) => ({
                            ...c,
                            _type: "comment",
                            _time: new Date(c.timestamp).getTime(),
                          }),
                        );
                        const hasInitialCommentInComments = comments.some(
                          (c) =>
                            String(c.text || "").trim() ===
                              String(selectedRequest.message || "").trim() &&
                            String(c.author || "").trim() ===
                              String(selectedRequest.requestedBy || "").trim(),
                        );

                        const initialCommentEntry =
                          selectedRequest.message &&
                          !hasInitialCommentInComments
                            ? [
                                {
                                  _type: "comment",
                                  author:
                                    selectedRequest.requestedBy || "Requester",
                                  text: selectedRequest.message,
                                  timestamp:
                                    selectedRequest.createdAt ||
                                    selectedRequest.date ||
                                    new Date().toISOString(),
                                  _time: new Date(
                                    selectedRequest.createdAt ||
                                      selectedRequest.date ||
                                      Date.now(),
                                  ).getTime(),
                                },
                              ]
                            : [];

                        const combined = [
                          ...activities,
                          ...comments,
                          ...initialCommentEntry,
                        ].sort((a, b) => a._time - b._time);
                        if (combined.length === 0) {
                          return (
                            <p className="text-sm text-[#617589] text-center py-4">
                              No activity yet
                            </p>
                          );
                        }
                        return combined.map((entry, idx) => {
                          if (
                            entry._type === "activity" &&
                            entry.type !== "comment"
                          ) {
                            const iconMap = {
                              created: "fa-plus-circle text-green-500",
                              status_change: "fa-arrows-rotate text-blue-500",
                              approval: "fa-circle-check text-green-600",
                              rejection: "fa-circle-xmark text-red-500",
                              po_created: "fa-file-invoice text-indigo-600",
                            };
                            const icon =
                              iconMap[entry.type] ||
                              "fa-circle-info text-gray-400";
                            return (
                              <div
                                key={`act-${idx}`}
                                className="flex items-start gap-3 py-2"
                              >
                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                  <i className={`fa-solid ${icon} text-sm`}></i>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <p className="text-sm text-[#111418]">
                                    <span className="font-semibold">
                                      {entry.author}
                                    </span>{" "}
                                    {entry.text}
                                    {entry.type === "po_created" &&
                                      entry.poNumber && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openPurchaseOrderFromActivity(
                                              entry.poNumber,
                                              entry.poId,
                                            )
                                          }
                                          className="ml-2 text-[#137fec] hover:text-[#0d6efd] underline font-semibold"
                                        >
                                          {entry.poNumber}
                                        </button>
                                      )}
                                  </p>
                                  <span className="text-[11px] text-[#617589]">
                                    {new Date(entry.timestamp).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={`cmt-${idx}`} className="flex gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#137fec] flex items-center justify-center text-white text-xs font-bold shrink-0">
                                {entry.author?.charAt(0)?.toUpperCase() || "U"}
                              </div>
                              <div className="flex flex-col gap-1 flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-[#111418]">
                                    {entry.author}
                                  </span>
                                  <span className="text-[11px] text-[#617589]">
                                    {new Date(entry.timestamp).toLocaleString()}
                                  </span>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-lg rounded-tl-none border border-gray-100">
                                  <p className="text-sm text-[#111418] leading-relaxed whitespace-pre-wrap">
                                    {entry.text
                                      ?.split(/(@\w+(?:\s\w+)?)/)
                                      .map((part, pIdx) =>
                                        /^@\w+/.test(part) ? (
                                          <span
                                            key={pIdx}
                                            className="inline-flex items-center bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded text-xs mx-0.5"
                                          >
                                            {part}
                                          </span>
                                        ) : (
                                          <span key={pIdx}>{part}</span>
                                        ),
                                      )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}

                      {Array.isArray(selectedRequest.approvalChain) &&
                        selectedRequest.approvalChain.length > 0 && (
                          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <i className="fa-solid fa-diagram-project text-gray-500"></i>
                              <h4 className="text-sm font-bold text-[#111418]">
                                Approval Flow Status
                              </h4>
                            </div>
                            <div className="space-y-2">
                              {selectedRequest.approvalChain.map(
                                (step, idx) => {
                                  const stepStatus = step.status || "awaiting";
                                  const statusClasses =
                                    stepStatus === "approved"
                                      ? "bg-green-100 text-green-700"
                                      : stepStatus === "pending"
                                        ? "bg-yellow-100 text-yellow-700"
                                        : stepStatus === "rejected"
                                          ? "bg-red-100 text-red-700"
                                          : "bg-gray-100 text-gray-700";
                                  return (
                                    <div
                                      key={`${step.level || idx}-${step.approverName || idx}`}
                                      className="flex items-center justify-between gap-3 p-2 rounded bg-white border border-gray-100"
                                    >
                                      <div className="flex flex-col">
                                        <span className="text-xs font-semibold text-[#111418]">
                                          Level {step.level || idx + 1}:{" "}
                                          {step.approverName || "Approver"}
                                        </span>
                                        <span className="text-[11px] text-[#617589]">
                                          {stepStatus === "approved" &&
                                          step.approvedAt
                                            ? `Approved ${new Date(step.approvedAt).toLocaleString()}`
                                            : stepStatus === "pending"
                                              ? "Awaiting action"
                                              : stepStatus === "awaiting"
                                                ? "Waiting previous approval"
                                                : step.comments || "Rejected"}
                                        </span>
                                      </div>
                                      <span
                                        className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${statusClasses}`}
                                      >
                                        {stepStatus}
                                      </span>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        )}
                    </div>

                    {/* Add Comment Section */}
                    <div className="bg-gray-50 p-5 border-t border-gray-200">
                      <div className="flex gap-3">
                        <div className="hidden sm:flex bg-blue-100 text-blue-700 h-8 w-8 rounded-full flex-none items-center justify-center text-xs font-bold shrink-0">
                          {user?.fullName?.charAt(0)?.toUpperCase() || "ME"}
                        </div>
                        <div className="flex-1 relative">
                          <textarea
                            ref={viewCommentRef}
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#111418] placeholder-[#617589] focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] min-h-[70px] resize-y outline-none transition-all"
                            placeholder="Add a comment... Use @ to mention someone (Enter to send, Shift+Enter for new line)"
                            value={viewComment}
                            onChange={(e) => {
                              setViewComment(e.target.value);
                              const val = e.target.value;
                              const pos = e.target.selectionStart;
                              const textBefore = val.substring(0, pos);
                              const atMatch = textBefore.match(/@(\w*)$/);
                              if (atMatch) {
                                setShowViewMentionDropdown(true);
                                setViewMentionSearch(atMatch[1].toLowerCase());
                              } else {
                                setShowViewMentionDropdown(false);
                                setViewMentionSearch("");
                              }
                            }}
                            onKeyDown={async (e) => {
                              if (
                                e.key === "Enter" &&
                                !e.shiftKey &&
                                !showViewMentionDropdown
                              ) {
                                e.preventDefault();
                                await submitViewComment();
                              }
                            }}
                          />
                          {showViewMentionDropdown && (
                            <div className="absolute z-50 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-y-auto w-[280px]">
                              {userList
                                .filter((u) =>
                                  u.name
                                    ?.toLowerCase()
                                    .includes(viewMentionSearch),
                                )
                                .slice(0, 8)
                                .map((u) => (
                                  <button
                                    key={u.id || u._id}
                                    type="button"
                                    className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                                    onClick={() => {
                                      const textarea = viewCommentRef.current;
                                      if (!textarea) return;
                                      const pos = textarea.selectionStart;
                                      const text = viewComment;
                                      const before = text.substring(0, pos);
                                      const after = text.substring(pos);
                                      const replaced = before.replace(
                                        /@(\w*)$/,
                                        `@${u.name} `,
                                      );
                                      setViewComment(replaced + after);
                                      setShowViewMentionDropdown(false);
                                      setTimeout(() => textarea.focus(), 0);
                                    }}
                                  >
                                    <strong className="text-[#111418] text-sm">
                                      {u.name}
                                    </strong>
                                    {u.role && (
                                      <>
                                        <br />
                                        <small className="text-[#617589]">
                                          {u.role}
                                        </small>
                                      </>
                                    )}
                                  </button>
                                ))}
                              {userList.filter((u) =>
                                u.name
                                  ?.toLowerCase()
                                  .includes(viewMentionSearch),
                              ).length === 0 && (
                                <div className="px-4 py-3 text-center text-[#617589] text-sm">
                                  No users found
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex justify-between items-center mt-2">
                            <button
                              type="button"
                              onClick={() => {
                                const textarea = viewCommentRef.current;
                                if (!textarea) return;
                                const pos = textarea.selectionStart;
                                const before = viewComment.substring(0, pos);
                                const after = viewComment.substring(pos);
                                setViewComment(before + "@" + after);
                                setShowViewMentionDropdown(true);
                                setViewMentionSearch("");
                                setTimeout(() => {
                                  textarea.focus();
                                  textarea.setSelectionRange(pos + 1, pos + 1);
                                }, 0);
                              }}
                              className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-[#617589] hover:text-[#111418] transition-colors rounded hover:bg-gray-100"
                            >
                              <i className="fa-solid fa-at text-sm"></i>
                            </button>
                            <button
                              type="button"
                              disabled={
                                !viewComment.trim() || submittingComment
                              }
                              onClick={submitViewComment}
                              className="flex h-8 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#137fec] hover:bg-[#0d6efd] disabled:opacity-50 disabled:cursor-not-allowed px-4 text-white transition-colors text-xs font-bold shadow-sm"
                            >
                              {submittingComment ? (
                                <span className="inline-block animate-spin">
                                  ⏳
                                </span>
                              ) : (
                                <>
                                  <i className="fa-solid fa-paper-plane text-xs"></i>
                                  <span>Post Comment</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Approval Action Section (for approvers) */}
                  {isUserApprover(selectedRequest) &&
                    selectedRequest.status === "pending" && (
                      <div className="rounded-xl border-2 border-[#137fec]/20 bg-white shadow-lg overflow-hidden ring-4 ring-[#137fec]/5">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-blue-50">
                          <div className="flex items-center gap-2">
                            <i className="fa-solid fa-gavel text-[#137fec]"></i>
                            <h3 className="text-lg font-bold text-[#111418]">
                              Review & Action
                            </h3>
                          </div>
                          <span className="text-xs font-bold uppercase tracking-wider text-[#137fec] bg-[#137fec]/10 px-2 py-1 rounded">
                            Action Required
                          </span>
                        </div>
                        <div className="p-6 flex flex-col gap-6">
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-[#111418]">
                              Approver Comments{" "}
                              <span className="font-normal text-[#617589]">
                                (Required for rejection)
                              </span>
                            </label>
                            <textarea
                              value={rejectionReason}
                              onChange={(e) =>
                                setRejectionReason(e.target.value)
                              }
                              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#111418] placeholder-[#617589] focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] min-h-[100px] resize-y outline-none transition-all"
                              placeholder="Enter your review comments, reasons for rejection, or instructions..."
                            />
                          </div>
                          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-2">
                            <button className="w-full sm:w-auto flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-6 text-[#111418] shadow-sm hover:bg-gray-50 transition-colors text-sm font-bold">
                              <i className="fa-solid fa-share"></i>
                              <span className="truncate">Delegate</span>
                            </button>
                            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                              <button
                                onClick={handleRejectRequest}
                                className="w-full sm:w-auto flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300 transition-colors text-sm font-bold shadow-sm px-6"
                              >
                                <i className="fa-solid fa-ban"></i>
                                <span className="truncate">Reject Request</span>
                              </button>
                              <button
                                onClick={() => {
                                  setShowViewModal(false);
                                  setShowApprovalModal(true);
                                }}
                                className="w-full sm:w-auto flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-green-600 px-8 text-white shadow-sm hover:bg-green-700 transition-colors text-sm font-bold"
                              >
                                <i className="fa-solid fa-circle-check"></i>
                                <span className="truncate">
                                  Approve Request
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                </div>

                {/* Right Column - Sidebar (Hidden) */}
                <div className="hidden flex-col gap-6">
                  {/* Approval History */}
                  {!(
                    isUserApprover(selectedRequest) &&
                    selectedRequest.status === "pending"
                  ) && (
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                        <i className="fa-solid fa-clock-rotate-left text-gray-500"></i>
                        <h3 className="text-lg font-bold text-[#111418]">
                          Approval History
                        </h3>
                      </div>
                      <div className="p-6">
                        <div className="relative pl-4 border-l-2 border-gray-200 space-y-8">
                          {/* Request Submitted */}
                          <div className="relative">
                            <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-green-500 ring-4 ring-white"></div>
                            <div className="flex flex-col gap-1">
                              <p className="text-sm font-bold text-[#111418]">
                                Request Submitted
                              </p>
                              <p className="text-xs text-[#617589]">
                                {new Date(
                                  selectedRequest.date ||
                                    selectedRequest.createdAt,
                                ).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="bg-gray-200 text-gray-600 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold">
                                  {selectedRequest.requestedBy
                                    ?.charAt(0)
                                    ?.toUpperCase() || "U"}
                                </div>
                                <span className="text-sm text-[#111418]">
                                  {selectedRequest.requestedBy}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Current Status */}
                          {selectedRequest.status === "pending" && (
                            <div className="relative">
                              <div className="absolute -left-[23px] top-0 h-4 w-4 rounded-full border-2 border-[#137fec] bg-white animate-pulse"></div>
                              <div className="flex flex-col gap-1">
                                <p className="text-sm font-bold text-[#137fec]">
                                  Pending Review
                                </p>
                                <p className="text-xs text-[#617589]">
                                  Awaiting Action
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-sm text-[#617589]">
                                    Assigned to:{" "}
                                    {selectedRequest.approver || "Not assigned"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {selectedRequest.status === "approved" && (
                            <div className="relative">
                              <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-green-500 ring-4 ring-white"></div>
                              <div className="flex flex-col gap-1">
                                <p className="text-sm font-bold text-[#111418]">
                                  Approved
                                </p>
                                <p className="text-xs text-[#617589]">
                                  {selectedRequest.approvedDate
                                    ? new Date(
                                        selectedRequest.approvedDate,
                                      ).toLocaleDateString()
                                    : "Recently"}
                                </p>
                                <span className="ml-auto text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded w-fit">
                                  Approved
                                </span>
                              </div>
                            </div>
                          )}

                          {selectedRequest.status === "rejected" &&
                            selectedRequest.rejectionReason && (
                              <div className="relative">
                                <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-red-500 ring-4 ring-white"></div>
                                <div className="flex flex-col gap-1">
                                  <p className="text-sm font-bold text-[#111418]">
                                    Rejected
                                  </p>
                                  <p className="text-xs text-[#617589]">
                                    {selectedRequest.rejectedDate
                                      ? new Date(
                                          selectedRequest.rejectedDate,
                                        ).toLocaleDateString()
                                      : "Recently"}
                                  </p>
                                  <div className="mt-2 rounded bg-gray-50 p-2 text-xs italic text-gray-600 border border-gray-100">
                                    "{selectedRequest.rejectionReason}"
                                  </div>
                                </div>
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Attachments */}
                  {selectedRequest.attachments &&
                    selectedRequest.attachments.length > 0 && (
                      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <i className="fa-solid fa-paperclip text-gray-500"></i>
                            <h3 className="text-lg font-bold text-[#111418]">
                              Attachments
                            </h3>
                          </div>
                          <span className="text-xs text-gray-500 font-medium">
                            {selectedRequest.attachments.length} file
                            {selectedRequest.attachments.length !== 1
                              ? "s"
                              : ""}
                          </span>
                        </div>
                        <div className="p-6">
                          <div className="space-y-2">
                            {selectedRequest.attachments.map((file, idx) => {
                              const fileName =
                                typeof file === "string" ? file : file.fileName;
                              const fileData =
                                typeof file === "string" ? null : file.fileData;
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <i className="fa-solid fa-file text-gray-400"></i>
                                    <span className="truncate text-sm text-[#111418]">
                                      {fileName}
                                    </span>
                                  </div>
                                  {fileData && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const a = document.createElement("a");
                                        a.href = fileData;
                                        a.download = fileName;
                                        a.click();
                                      }}
                                      className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                                      title="Download"
                                    >
                                      <i className="fa-solid fa-download text-sm"></i>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Preferred Vendor */}
                  {selectedRequest.preferredVendor && (
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                        <i className="fa-solid fa-store text-gray-500"></i>
                        <h3 className="text-lg font-bold text-[#111418]">
                          Preferred Vendor
                        </h3>
                      </div>
                      <div className="p-6">
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
                            <i className="fa-solid fa-building text-gray-400 text-xl"></i>
                          </div>
                          <div>
                            <p className="text-base font-bold text-[#111418]">
                              {selectedRequest.preferredVendor}
                            </p>
                            <p className="text-sm text-[#617589]">
                              Selected Vendor
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MaterialRequests;
