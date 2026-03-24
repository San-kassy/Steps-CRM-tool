import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
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
  const [_error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("last30");
  const [sortBy, setSortBy] = useState("newest");
  const [showForm, setShowForm] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [budgetCategories, setBudgetCategories] = useState([]);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [requestTypeOptions, setRequestTypeOptions] = useState([]);
  const [showRequestTypeModal, setShowRequestTypeModal] = useState(false);
  const [newRequestType, setNewRequestType] = useState("");
  const [savingRequestTypes, setSavingRequestTypes] = useState(false);
  const [showRfqModal, setShowRfqModal] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [selectedRfqVendorIds, setSelectedRfqVendorIds] = useState([]);
  const [sendingRfq, setSendingRfq] = useState(false);
  const [showRfqEditModal, setShowRfqEditModal] = useState(false);
  const [loadingRfqDetails, setLoadingRfqDetails] = useState(false);
  const [savingRfqEdit, setSavingRfqEdit] = useState(false);
  const [rfqEditData, setRfqEditData] = useState(null);
  const [creatingPo, setCreatingPo] = useState(false);

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
  const [quantityTypeOptions, setQuantityTypeOptions] = useState([]);
  const [quantityTypeMeta, setQuantityTypeMeta] = useState({});

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
  const backendRetryTimerRef = useRef(null);
  const backendOfflineLoggedRef = useRef(false);
  const usersFetchErrorLoggedRef = useRef(false);

  // API integrations
  const { departments: _departments, loading: _departmentsLoading } =
    useDepartments();

  const isAdmin = useMemo(() => {
    const role = String(user?.role || "").toLowerCase();
    return role === "admin";
  }, [user?.role]);

  const getAttachmentName = (file) => {
    if (!file) return "Attachment";
    if (typeof file === "string") return file;
    return file.fileName || file.name || "Attachment";
  };

  const openAttachmentInView = (file) => {
    const fileName = getAttachmentName(file);
    const fileData =
      typeof file === "string" ? "" : String(file?.fileData || "").trim();

    if (!fileData) {
      toast.error(`${fileName} is not available to preview`);
      return;
    }

    const opened = window.open(fileData, "_blank", "noopener,noreferrer");
    if (!opened) {
      toast.error("Popup blocked. Please allow popups to view attachment.");
    }
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

  const fetchUnitOfMeasureOptions = useCallback(async () => {
    try {
      const response = await apiService.get("/api/inventory/units");
      const rows = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response?.data?.items)
          ? response.data.items
          : Array.isArray(response?.data)
            ? response.data
            : Array.isArray(response)
              ? response
              : [];

      const activeUnitNames = rows
        .filter((unit) => unit?.isActive !== false)
        .map((unit) => String(unit?.name || "").trim())
        .filter(Boolean);

      const metaLookup = rows
        .filter((unit) => unit?.isActive !== false)
        .reduce((acc, unit) => {
          const key = String(unit?.name || "").trim();
          if (!key) return acc;
          acc[key] = {
            baseQuantity: Number(unit?.baseQuantity || 1),
            baseUnitLabel: String(unit?.baseUnitLabel || "unit").trim(),
          };
          return acc;
        }, {});

      setQuantityTypeOptions(Array.from(new Set(activeUnitNames)));
      setQuantityTypeMeta(metaLookup);
    } catch {
      setQuantityTypeOptions([]);
      setQuantityTypeMeta({});
    }
  }, []);

  const getQuantityTypeLabel = useCallback(
    (unitName) => {
      const name = String(unitName || "").trim();
      if (!name) return "";
      const meta = quantityTypeMeta[name];
      if (!meta) return name;
      return `${name} (1 = ${meta.baseQuantity} ${meta.baseUnitLabel || "unit"})`;
    },
    [quantityTypeMeta],
  );

  const fetchRequestTypes = useCallback(async () => {
    try {
      const response = await apiService.get("/api/material-request-types");
      const rows = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.data?.data)
          ? response.data.data
          : Array.isArray(response)
            ? response
            : Array.isArray(response?.data)
              ? response.data
              : [];
      setRequestTypeOptions(rows);
    } catch {
      setRequestTypeOptions([]);
    }
  }, []);

  const fetchVendors = useCallback(async () => {
    try {
      const response = await apiService.get("/api/vendors", {
        params: { limit: 1000, status: "Active" },
      });
      const rows = Array.isArray(response)
        ? response
        : Array.isArray(response?.vendors)
          ? response.vendors
          : Array.isArray(response?.data?.vendors)
            ? response.data.vendors
            : Array.isArray(response?.data)
              ? response.data
              : [];
      setVendors(rows);
    } catch {
      setVendors([]);
    }
  }, []);

  const saveRequestTypes = async () => {
    if (!isAdmin) return;
    if (!Array.isArray(requestTypeOptions) || requestTypeOptions.length === 0) {
      toast.error("At least one request type is required");
      return;
    }

    setSavingRequestTypes(true);
    try {
      const response = await apiService.put("/api/material-request-types", {
        requestTypes: requestTypeOptions,
      });
      const rows = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.data?.data)
          ? response.data.data
          : Array.isArray(response)
            ? response
            : requestTypeOptions;
      setRequestTypeOptions(rows);
      toast.success("Request types updated");
      setShowRequestTypeModal(false);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to update request types",
      );
    } finally {
      setSavingRequestTypes(false);
    }
  };

  const handleGenerateRfq = async () => {
    if (!selectedRequest?._id) return;
    if (sendingRfq) return;
    if (selectedRfqVendorIds.length === 0) {
      toast.error("Select at least one vendor");
      return;
    }

    setSendingRfq(true);
    try {
      const response = await apiService.post(
        `/api/material-requests/${selectedRequest._id}/generate-rfq`,
        { vendorIds: selectedRfqVendorIds },
      );

      const updatedRequest = response?.request || response?.data?.request;
      if (updatedRequest?._id) {
        setSelectedRequest(updatedRequest);
        setRequests((prev) =>
          prev.map((req) =>
            req._id === updatedRequest._id ? updatedRequest : req,
          ),
        );
      }

      if (response?.created === false) {
        toast("RFQ already exists for selected vendor(s)");
      } else {
        toast.success(response?.message || "RFQ sent to selected vendors");
      }
      setShowRfqModal(false);
      setSelectedRfqVendorIds([]);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to generate RFQ");
    } finally {
      setSendingRfq(false);
    }
  };

  const handleCreatePoFromApproved = async () => {
    if (!selectedRequest?._id) return;
    if (creatingPo) return;
    setCreatingPo(true);
    try {
      const response = await apiService.post(
        `/api/material-requests/${selectedRequest._id}/create-po`,
        {},
      );

      const updatedRequest = response?.request || response?.data?.request;
      const po = response?.purchaseOrder || response?.data?.purchaseOrder;

      if (updatedRequest?._id) {
        setSelectedRequest(updatedRequest);
        setRequests((prev) =>
          prev.map((req) =>
            req._id === updatedRequest._id ? updatedRequest : req,
          ),
        );
      }

      if (po?._id || po?.poNumber) {
        await openPurchaseOrderFromActivity(po.poNumber, po._id || po.id);
      }

      if (response?.created === false) {
        toast("Purchase order already exists for this request");
      } else {
        toast.success(response?.message || "Purchase order created");
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to create purchase order",
      );
    } finally {
      setCreatingPo(false);
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
        name: String(user.fullName || user.name || "").trim(),
        role: user.jobTitle || user.role || "Staff",
        email: user.email,
        department: user.department,
      }));
      setUserList(formattedUsers);
      usersFetchErrorLoggedRef.current = false;
    } catch (error) {
      if (!usersFetchErrorLoggedRef.current) {
        if (!error?.response) {
          console.warn(
            "MaterialRequests: could not fetch users while backend is unavailable.",
          );
        } else {
          console.error(
            "MaterialRequests: failed to fetch users.",
            error?.response?.status,
          );
        }
        usersFetchErrorLoggedRef.current = true;
      }
      setUserList([]);
    }
  };

  const fetchMaterialRequestDetails = useCallback(async (requestId) => {
    if (!requestId) return null;
    const response = await apiService.get(
      `/api/material-requests/${requestId}`,
    );
    const payload = response?.data?._id ? response.data : response;
    return payload?._id ? payload : null;
  }, []);

  const fetchRequestForApproval = React.useCallback(
    async (requestId) => {
      try {
        const request = await fetchMaterialRequestDetails(requestId);
        if (request) {
          setSelectedRequest(request);
          setShowViewModal(true);
        } else {
          toast.error("Request not found");
        }
      } catch {
        toast.error("Failed to load request");
      }
    },
    [fetchMaterialRequestDetails],
  );

  // Check for approval action from email link
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get("action");
    const requestId = params.get("id");

    if (action === "approve" && requestId) {
      // Fetch the specific request and open the unified details/review page
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
        toast.success(
          "Request approved. You can now generate RFQ or create Purchase Order.",
        );
      }

      const updatedRequest = response?.request || response?.data?.request;
      if (updatedRequest?._id) {
        setSelectedRequest(updatedRequest);
        setRequests((prev) =>
          prev.map((request) =>
            request._id === updatedRequest._id ? updatedRequest : request,
          ),
        );
      } else {
        fetchRequests();
      }
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
      setShowViewModal(false);
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
    fetchUnitOfMeasureOptions();
    fetchRequestTypes();
    fetchVendors();

    // Keep create flow fresh: clear legacy persisted in-progress form state.
    localStorage.removeItem("materialRequestsState");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fetchCurrencies,
    fetchRequestTypes,
    fetchUnitOfMeasureOptions,
    fetchVendors,
  ]);

  useEffect(() => {
    return () => {
      if (backendRetryTimerRef.current) {
        clearTimeout(backendRetryTimerRef.current);
        backendRetryTimerRef.current = null;
      }
    };
  }, []);

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

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiService.get("/api/material-requests", {
        params: { page: 1, limit: 50 },
      });
      // Handle new paginated response format
      const requestData =
        response?.data || response?.data?.data || response || [];
      setRequests(Array.isArray(requestData) ? requestData : []);
      setError(null);
      backendOfflineLoggedRef.current = false;
      if (backendRetryTimerRef.current) {
        clearTimeout(backendRetryTimerRef.current);
        backendRetryTimerRef.current = null;
      }
    } catch (err) {
      const status = err?.response?.status;
      const serverMessage =
        err?.serverData?.message || err?.response?.data?.message || "";

      if (status === 401) {
        setError("Session expired. Please sign in again.");
      } else if (status === 403) {
        setError("You do not have permission to view material requests.");
      } else if (!err?.response) {
        if (!backendOfflineLoggedRef.current) {
          console.warn(
            "MaterialRequests: backend unavailable at http://localhost:4000. Auto-retrying every 5 seconds.",
          );
          backendOfflineLoggedRef.current = true;
        }
        setError(null);
        if (!backendRetryTimerRef.current) {
          backendRetryTimerRef.current = setTimeout(() => {
            backendRetryTimerRef.current = null;
            fetchRequests();
          }, 5000);
        }
      } else {
        setError(serverMessage || "Failed to load material requests");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveApproverDisplay = useCallback(
    (request) => {
      if (!request) return "-";

      const normalize = (value) =>
        String(value || "")
          .toLowerCase()
          .trim();

      const lookupByEmail = (email) => {
        const normalizedEmail = normalize(email);
        if (!normalizedEmail) return "";
        const matched = userList.find(
          (u) => normalize(u?.email) === normalizedEmail,
        );
        return matched?.name || "";
      };

      const lookupById = (id) => {
        const normalizedId = String(id || "").trim();
        if (!normalizedId) return "";
        const matched = userList.find(
          (u) => String(u?.id || "").trim() === normalizedId,
        );
        return matched?.name || "";
      };

      const pendingApprover = request.approvalChain?.find(
        (entry) => entry?.status === "pending",
      )?.approverName;
      if (pendingApprover) return pendingApprover;

      const pendingApproverByEmail = lookupByEmail(
        request.approvalChain?.find((entry) => entry?.status === "pending")
          ?.approverEmail,
      );
      if (pendingApproverByEmail) return pendingApproverByEmail;

      const firstChainApprover = request.approvalChain?.find(
        (entry) => entry?.approverName,
      )?.approverName;
      if (firstChainApprover) return firstChainApprover;

      const chainApproverByEmail = lookupByEmail(
        request.approvalChain?.find((entry) => entry?.approverEmail)
          ?.approverEmail,
      );
      if (chainApproverByEmail) return chainApproverByEmail;

      const directApproverById = lookupById(request.approverId);
      if (directApproverById) return directApproverById;

      const directApproverByEmail = lookupByEmail(request.approverEmail);
      if (directApproverByEmail) return directApproverByEmail;

      const directApprover = String(request.approver || "").trim();
      if (directApprover) {
        const mapped =
          lookupByEmail(directApprover) || lookupById(directApprover);
        return mapped || directApprover;
      }

      return "-";
    },
    [userList],
  );

  const filteredRequests = useMemo(() => {
    const normalizedSearch = String(searchQuery || "")
      .toLowerCase()
      .trim();
    const now = new Date();

    const lowerBound = (() => {
      if (dateFilter === "last7") {
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
      if (dateFilter === "last30") {
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      if (dateFilter === "last90") {
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      }
      return null;
    })();

    const filtered = requests.filter((req) => {
      const requestStatus = String(req.status || "").toLowerCase();
      if (filterStatus !== "all" && requestStatus !== String(filterStatus)) {
        return false;
      }

      if (lowerBound) {
        const requestDate = new Date(req.date || req.createdAt || Date.now());
        if (Number.isNaN(requestDate.getTime()) || requestDate < lowerBound) {
          return false;
        }
      }

      if (!normalizedSearch) return true;

      const searchable = [
        req.requestId,
        req.requestTitle,
        req.requestedBy,
        req.reason,
        req.department,
        req.budgetCode,
        resolveApproverDisplay(req),
        ...(Array.isArray(req.lineItems)
          ? req.lineItems.flatMap((item) => [item?.itemName, item?.description])
          : []),
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      return searchable.includes(normalizedSearch);
    });

    const sorted = [...filtered];
    if (sortBy === "oldest") {
      sorted.sort(
        (a, b) =>
          new Date(a.date || a.createdAt || 0).getTime() -
          new Date(b.date || b.createdAt || 0).getTime(),
      );
    } else if (sortBy === "requester") {
      sorted.sort((a, b) =>
        String(a.requestedBy || "").localeCompare(String(b.requestedBy || "")),
      );
    } else if (sortBy === "status") {
      sorted.sort((a, b) =>
        String(a.status || "").localeCompare(String(b.status || "")),
      );
    } else {
      sorted.sort(
        (a, b) =>
          new Date(b.date || b.createdAt || 0).getTime() -
          new Date(a.date || a.createdAt || 0).getTime(),
      );
    }

    return sorted;
  }, [
    requests,
    searchQuery,
    filterStatus,
    dateFilter,
    sortBy,
    resolveApproverDisplay,
  ]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const parseRateToNgn = useCallback((currencyCode, rateInput) => {
    if (currencyCode === "NGN") return 1;
    const parsedRate = parseFloat(rateInput);
    return parsedRate > 0 ? parsedRate : null;
  }, []);

  const getCurrencyOptionRateToNgn = useCallback(
    (currencyCode) => {
      if (currencyCode === "NGN") return 1;
      const option = (currencyOptions || []).find(
        (entry) => String(entry?.code || "").trim() === currencyCode,
      );
      const fallbackRate = parseFloat(
        option?.exchangeRateToNgn ||
          option?.rateToNgn ||
          option?.exchangeRate ||
          option?.rate ||
          "",
      );
      return fallbackRate > 0 ? fallbackRate : null;
    },
    [currencyOptions],
  );

  const formatConvertedAmount = useCallback((value) => {
    if (!Number.isFinite(value)) return "";
    return String(Number(value.toFixed(4)));
  }, []);

  const convertLineItemAmountsBetweenCurrencies = useCallback(
    ({ fromCurrency, toCurrency, fromRateToNgn, toRateToNgn }) => {
      if (
        !fromCurrency ||
        !toCurrency ||
        fromCurrency === toCurrency ||
        !(fromRateToNgn > 0) ||
        !(toRateToNgn > 0)
      ) {
        return false;
      }

      setLineItems((prevItems) =>
        prevItems.map((item) => {
          const originalAmount = parseFloat(item?.amount);
          if (!Number.isFinite(originalAmount)) return item;

          // Preserve value in NGN, then express it in target currency.
          const amountInNgn = originalAmount * fromRateToNgn;
          const convertedAmount = amountInNgn / toRateToNgn;

          return {
            ...item,
            amount: formatConvertedAmount(convertedAmount),
          };
        }),
      );

      return true;
    },
    [formatConvertedAmount],
  );

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
        department: formData.department || user?.department || "",
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

  const handleViewRequest = async (request) => {
    const requestId = String(request?._id || request?.id || "").trim();
    try {
      const fullRequest = await fetchMaterialRequestDetails(requestId);
      setSelectedRequest(fullRequest || request);
      setShowViewModal(true);
      setActiveDropdown(null);
    } catch {
      setSelectedRequest(request);
      setShowViewModal(true);
      setActiveDropdown(null);
    }
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

  const handleApproveClick = async (request) => {
    await handleViewRequest(request);
    fetchBudgetCategories();
    setActiveDropdown(null);
  };

  const handleRejectClick = async (request) => {
    await handleViewRequest(request);
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
    const normalize = (value) =>
      String(value || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const normalizeName = (value) =>
      normalize(value).replace(/[^a-z0-9\s]/g, "");

    const currentUserId = String(user?._id || user?.id || "").trim();
    const currentUserEmail = normalize(
      user?.primaryEmailAddress?.emailAddress || user?.email || "",
    );
    const currentUserName = normalizeName(
      user?.fullName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
        "",
    );
    const isAdmin = normalize(user?.role) === "admin";

    if (isAdmin) return true;

    const currentStep = getCurrentPendingApprover(request);

    if (currentStep) {
      return (
        (currentStep.approverId &&
          String(currentStep.approverId).trim() === currentUserId) ||
        (currentStep.approverEmail &&
          normalize(currentStep.approverEmail) === currentUserEmail) ||
        (currentStep.approverName &&
          normalizeName(currentStep.approverName) === currentUserName)
      );
    }

    return (
      normalizeName(request?.approver || "") === currentUserName ||
      normalize(request?.approverEmail || "") === currentUserEmail ||
      String(request?.approverId || "").trim() === currentUserId
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

  const hasRfqBeenSent = (request) => {
    if (!request) return false;

    if (
      request.rfqSentAt ||
      request.rfqGeneratedAt ||
      request.rfqGenerated === true ||
      (Array.isArray(request.rfqs) && request.rfqs.length > 0)
    ) {
      return true;
    }

    const activities = Array.isArray(request.activities)
      ? request.activities
      : [];
    return activities.some((activity) => {
      const activityType = String(activity?.type || "")
        .toLowerCase()
        .trim();
      const activityText = String(activity?.text || "").toLowerCase();
      return (
        activityType === "rfq_sent" ||
        activityType === "rfq_generated" ||
        /\brfq\b/.test(activityType) ||
        /\brfq sent\b/.test(activityText) ||
        /request for quotation/.test(activityText)
      );
    });
  };

  const hasPurchaseOrderBeenCreated = (request) => {
    if (!request) return false;

    if (
      request.poId ||
      request.purchaseOrderId ||
      request.purchaseOrder?._id ||
      request.purchaseOrder?.id
    ) {
      return true;
    }

    const activities = Array.isArray(request.activities)
      ? request.activities
      : [];
    return activities.some((activity) => {
      const activityType = String(activity?.type || "")
        .toLowerCase()
        .trim();
      const activityText = String(activity?.text || "").toLowerCase();
      return (
        activityType === "po_created" || /purchase\s*order/.test(activityText)
      );
    });
  };

  const getApprovalDisplayInfo = (request) => {
    if (!request) {
      return { approverName: "Approver", approvedAtLabel: "Recently" };
    }

    const parseTime = (value) => {
      const time = new Date(value || "").getTime();
      return Number.isFinite(time) && !Number.isNaN(time) ? time : 0;
    };

    let latestName = "";
    let latestTime = 0;

    if (Array.isArray(request.approvalChain)) {
      request.approvalChain.forEach((step) => {
        if (String(step?.status || "").toLowerCase() !== "approved") return;
        const candidateTime = parseTime(step?.approvedAt);
        if (candidateTime >= latestTime) {
          latestTime = candidateTime;
          latestName = String(step?.approverName || "").trim();
        }
      });
    }

    if (Array.isArray(request.activities)) {
      request.activities.forEach((activity) => {
        if (String(activity?.type || "").toLowerCase() !== "approval") return;
        const candidateTime = parseTime(activity?.timestamp);
        if (candidateTime >= latestTime) {
          latestTime = candidateTime;
          latestName = String(activity?.author || "").trim();
        }
      });
    }

    if (!latestTime) {
      latestTime = parseTime(request?.approvedDate || request?.updatedAt);
    }

    if (!latestName) {
      latestName = String(
        request?.approvedBy || request?.approver || "",
      ).trim();
    }

    return {
      approverName: latestName || "Approver",
      approvedAtLabel: latestTime
        ? new Date(latestTime).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Recently",
    };
  };

  const selectedApprovalInfo = useMemo(
    () => getApprovalDisplayInfo(selectedRequest),
    [selectedRequest],
  );

  const getRejectionDisplayInfo = (request) => {
    if (!request) {
      return { rejectorName: "Approver", rejectedAtLabel: "Recently" };
    }

    const parseTime = (value) => {
      const time = new Date(value || "").getTime();
      return Number.isFinite(time) && !Number.isNaN(time) ? time : 0;
    };

    let latestName = "";
    let latestTime = 0;

    if (Array.isArray(request.approvalChain)) {
      request.approvalChain.forEach((step) => {
        if (String(step?.status || "").toLowerCase() !== "rejected") return;
        const candidateTime = parseTime(
          step?.approvedAt || request?.rejectedDate,
        );
        if (candidateTime >= latestTime) {
          latestTime = candidateTime;
          latestName = String(step?.approverName || "").trim();
        }
      });
    }

    if (Array.isArray(request.activities)) {
      request.activities.forEach((activity) => {
        if (String(activity?.type || "").toLowerCase() !== "rejection") return;
        const candidateTime = parseTime(activity?.timestamp);
        if (candidateTime >= latestTime) {
          latestTime = candidateTime;
          latestName = String(activity?.author || "").trim();
        }
      });
    }

    if (!latestTime) {
      latestTime = parseTime(request?.rejectedDate || request?.updatedAt);
    }

    if (!latestName) {
      latestName = String(
        request?.rejectedBy || request?.approver || "",
      ).trim();
    }

    return {
      rejectorName: latestName || "Approver",
      rejectedAtLabel: latestTime
        ? new Date(latestTime).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Recently",
    };
  };

  const selectedRejectionInfo = useMemo(
    () => getRejectionDisplayInfo(selectedRequest),
    [selectedRequest],
  );

  const selectedPurchaseOrderLinks = useMemo(() => {
    if (!selectedRequest) return [];
    const activities = Array.isArray(selectedRequest.activities)
      ? selectedRequest.activities
      : [];

    const seen = new Set();
    return [...activities]
      .reverse()
      .filter((activity) => {
        const number = String(activity?.poNumber || "").trim();
        if (!number) return false;
        if (seen.has(number)) return false;
        seen.add(number);
        return true;
      })
      .map((activity) => ({
        poNumber: activity.poNumber,
        poId: activity.poId,
      }));
  }, [selectedRequest]);

  const selectedRfqLinks = useMemo(() => {
    if (!selectedRequest) return [];
    const activities = Array.isArray(selectedRequest.activities)
      ? selectedRequest.activities
      : [];

    const seen = new Set();
    return [...activities]
      .reverse()
      .filter((activity) => {
        const number = String(activity?.rfqNumber || "").trim();
        if (!number) return false;
        if (seen.has(number)) return false;
        seen.add(number);
        return true;
      })
      .map((activity) => ({
        rfqNumber: activity.rfqNumber,
        rfqId: activity.rfqId,
      }));
  }, [selectedRequest]);

  const openPurchaseOrderFromActivity = async (poNumber, poId) => {
    let poModuleId = 11;

    const normalizedPoNumber = String(poNumber || "").trim();
    const candidatePoId = (() => {
      if (typeof poId === "string") return poId;
      if (poId?._id || poId?.id) return poId._id || poId.id;
      if (poId && typeof poId.toString === "function") {
        const asText = String(poId.toString() || "").trim();
        if (asText && asText !== "[object Object]") return asText;
      }
      return "";
    })();
    const normalizedPoId = String(candidatePoId || "").trim();
    const hasUsablePoId =
      normalizedPoId &&
      normalizedPoId !== "[object Object]" &&
      /^[a-fA-F0-9]{24}$/.test(normalizedPoId);

    if (normalizedPoNumber) {
      sessionStorage.setItem("purchaseOrdersSearch", normalizedPoNumber);
      sessionStorage.setItem("purchaseOrdersOpenPoNumber", normalizedPoNumber);
    }

    if (hasUsablePoId) {
      sessionStorage.setItem("purchaseOrdersOpenPoId", normalizedPoId);
    }

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

      if (poModule?.id || poModule?._id) {
        poModuleId = poModule.id ?? poModule._id;
      }
    } catch {
      // Keep fallback module id and continue navigation.
    }

    navigate(`/home/${poModuleId}`, {
      state: {
        openPoId: hasUsablePoId ? normalizedPoId : "",
        openPoNumber: normalizedPoNumber,
      },
    });
  };

  const openRfqFromActivity = async (rfqNumber, rfqId) => {
    const normalizedRfqNumber = String(rfqNumber || "").trim();
    const candidateRfqId =
      typeof rfqId === "string" ? rfqId : rfqId?._id || rfqId?.id || "";
    const normalizedRfqId = String(candidateRfqId || "").trim();
    const hasUsableRfqId =
      normalizedRfqId &&
      normalizedRfqId !== "[object Object]" &&
      /^[a-fA-F0-9]{24}$/.test(normalizedRfqId);

    setLoadingRfqDetails(true);
    try {
      let rfqResponse = null;

      if (hasUsableRfqId) {
        rfqResponse = await apiService.get(
          `/api/workflow/rfqs/${normalizedRfqId}`,
        );
      } else if (normalizedRfqNumber) {
        const listResponse = await apiService.get("/api/workflow/rfqs", {
          params: { rfqNumber: normalizedRfqNumber, limit: 5 },
        });
        const list = Array.isArray(listResponse?.data?.rfqs)
          ? listResponse.data.rfqs
          : Array.isArray(listResponse?.rfqs)
            ? listResponse.rfqs
            : Array.isArray(listResponse?.data?.data?.rfqs)
              ? listResponse.data.data.rfqs
              : Array.isArray(listResponse?.data)
                ? listResponse.data
                : [];
        const match = list.find(
          (entry) =>
            String(entry?.rfqNumber || "").toLowerCase() ===
            normalizedRfqNumber.toLowerCase(),
        );
        if (match?._id || match?.id) {
          rfqResponse = await apiService.get(
            `/api/workflow/rfqs/${match._id || match.id}`,
          );
        }
      }

      const rfq = rfqResponse?.data || rfqResponse?.data?.data || rfqResponse;
      if (!rfq?._id && !rfq?.id) {
        toast.error("RFQ not found");
        return;
      }

      setRfqEditData({
        id: String(rfq._id || rfq.id || ""),
        rfqNumber: rfq.rfqNumber || normalizedRfqNumber || "",
        vendorName: rfq?.vendor?.vendorName || "",
        status: rfq.status || "draft",
        notes: rfq.notes || "",
        requiredByDate: rfq.requiredByDate
          ? new Date(rfq.requiredByDate).toISOString().slice(0, 10)
          : "",
        expiryDate: rfq.expiryDate
          ? new Date(rfq.expiryDate).toISOString().slice(0, 10)
          : "",
      });
      setShowRfqEditModal(true);
    } catch {
      toast.error("Failed to open RFQ");
    } finally {
      setLoadingRfqDetails(false);
    }
  };

  const handleSaveRfqEdit = async () => {
    if (!rfqEditData?.id) return;

    setSavingRfqEdit(true);
    try {
      const payload = {
        status: rfqEditData.status,
        notes: rfqEditData.notes || "",
        requiredByDate: rfqEditData.requiredByDate || null,
        expiryDate: rfqEditData.expiryDate || null,
      };

      await apiService.put(`/api/workflow/rfqs/${rfqEditData.id}`, payload);

      toast.success("RFQ updated successfully");
      setShowRfqEditModal(false);
      setRfqEditData(null);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to update RFQ");
    } finally {
      setSavingRfqEdit(false);
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

    (async () => {
      try {
        const fullRequest = await fetchMaterialRequestDetails(
          matchedRequest._id || matchedRequest.id,
        );
        setSelectedRequest(fullRequest || matchedRequest);
      } catch {
        setSelectedRequest(matchedRequest);
      }
      setShowViewModal(true);
    })();
  }, [loading, requests, fetchMaterialRequestDetails]);

  if (loading) {
    return (
      <ModuleLoader moduleName="Material Requests" subtitle="Please wait..." />
    );
  }

  const materialRequestColumns = [
    {
      header: "Request ID",
      accessorKey: "requestId",
      cell: (req) => (
        <span className="text-sm font-semibold text-[#137fec]">
          {req.requestId}
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
          {isUserApprover(req) &&
            String(req.status || "").toLowerCase() === "pending" && (
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

        {!showForm && !showViewModal && (
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
                Create Request
              </button>
            </div>

            {/* Search & Filters Bar */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search Input */}
                <div className="flex-1 min-w-[200px]">
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
                    {/* Clear filters */}
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <DataTable
                columns={materialRequestColumns}
                data={filteredRequests}
                isLoading={false}
                emptyMessage={
                  searchQuery ||
                  filterStatus !== "all" ||
                  dateFilter !== "last30"
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
                      <span className="flex items-center justify-between gap-2 text-sm font-medium text-[#111418]">
                        <span>
                          Request Type <span className="text-red-500">*</span>
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setShowRequestTypeModal(true)}
                            className="text-xs font-semibold text-[#137fec] hover:text-[#0d6efd]"
                          >
                            Manage types
                          </button>
                        )}
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
                          {requestTypeOptions.map((typeOption) => (
                            <option key={typeOption} value={typeOption}>
                              {typeOption}
                            </option>
                          ))}
                        </select>
                        {/* <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#617589] text-xs"></i> */}
                      </div>
                      {formData.requestType === "Internal Transfer" && (
                        <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                          <i className="fa-solid fa-info-circle"></i>
                          {/* Items will be pulled from existing inventory if
                          available */}
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

                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-[#111418]">
                        Approver
                      </span>
                      <div className="relative">
                        <i className="fa-solid fa-user-check absolute left-3 top-1/2 -translate-y-1/2 text-[#617589] text-sm"></i>
                        <select
                          name="approver"
                          value={formData.approver || ""}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] pl-10 pr-8 py-2.5 appearance-none"
                        >
                          <option value="">Select Approver</option>
                          {(userList || [])
                            .filter((usr) => String(usr?.name || "").trim())
                            .map((usr) => (
                              <option key={usr._id || usr.id} value={usr.name}>
                                {usr.name}
                              </option>
                            ))}
                        </select>
                        {/* <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#617589] text-xs"></i> */}
                      </div>
                    </label>

                    <label className="flex flex-col gap-2 sm:col-span-2">
                      <span className="text-sm font-medium text-[#111418]">
                        Budget
                      </span>
                      <div className="relative">
                        <i className="fa-solid fa-wallet absolute left-3 top-1/2 -translate-y-1/2 text-[#617589] text-sm"></i>
                        <select
                          name="budgetCode"
                          value={formData.budgetCode || ""}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] pl-10 pr-8 py-2.5 appearance-none"
                        >
                          <option value="">-- Select Budget --</option>
                          {budgetLoading ? (
                            <option disabled>Loading Budget...</option>
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
                            const nextCurrency = e.target.value;
                            const previousCurrency =
                              formData.currency || appCurrency || "NGN";
                            const previousRateToNgn = parseRateToNgn(
                              previousCurrency,
                              formData.exchangeRate,
                            );
                            const inferredNextRateToNgn =
                              getCurrencyOptionRateToNgn(nextCurrency);

                            if (
                              previousCurrency !== nextCurrency &&
                              previousRateToNgn > 0 &&
                              inferredNextRateToNgn > 0
                            ) {
                              convertLineItemAmountsBetweenCurrencies({
                                fromCurrency: previousCurrency,
                                toCurrency: nextCurrency,
                                fromRateToNgn: previousRateToNgn,
                                toRateToNgn: inferredNextRateToNgn,
                              });
                            } else if (
                              previousCurrency !== nextCurrency &&
                              previousCurrency !== "NGN" &&
                              nextCurrency === "NGN" &&
                              previousRateToNgn > 0
                            ) {
                              convertLineItemAmountsBetweenCurrencies({
                                fromCurrency: previousCurrency,
                                toCurrency: nextCurrency,
                                fromRateToNgn: previousRateToNgn,
                                toRateToNgn: 1,
                              });
                            }

                            setFormData((prev) => {
                              const shouldKeepRate =
                                nextCurrency !== "NGN" &&
                                inferredNextRateToNgn > 0;
                              return {
                                ...prev,
                                currency: nextCurrency,
                                exchangeRate: shouldKeepRate
                                  ? String(inferredNextRateToNgn)
                                  : "",
                              };
                            });
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
                            min="0.0"
                            step="0.0"
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
                    Material Request Breakdown
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
                            min="0"
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
                            disabled={quantityTypeOptions.length === 0}
                            required
                          >
                            <option value="">
                              {quantityTypeOptions.length === 0
                                ? "No active units"
                                : "Select..."}
                            </option>
                            {Array.from(
                              new Set(
                                [
                                  ...quantityTypeOptions,
                                  item.quantityType,
                                ].filter(Boolean),
                              ),
                            ).map((option) => (
                              <option key={option} value={option}>
                                {getQuantityTypeLabel(option)}
                              </option>
                            ))}
                          </select>
                          {quantityTypeOptions.length === 0 && (
                            <span className="text-[11px] text-amber-700">
                              Ask admin to add units in Unit Setup.
                            </span>
                          )}
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
                            decimalScale={1}
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
                            Total
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
                      {/* Add Another Item */}
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
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden pt-3">
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
                        <div className="absolute z-50 bottom-full left-0 right-0 -mt-3 py-2 bg-white rounded-xl shadow-lg max-h-[150px] overflow-y-auto w-[150px]">
                          {userList
                            .filter((u) =>
                              u.name?.toLowerCase().includes(formMentionSearch),
                            )
                            .slice(0, 5)
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
                                  const nextValue = replaced + after;
                                  const nextCaretPosition = replaced.length;
                                  setMessage(nextValue);
                                  setShowFormMentionDropdown(false);
                                  setTimeout(() => {
                                    textarea.focus();
                                    textarea.setSelectionRange(
                                      nextCaretPosition,
                                      nextCaretPosition,
                                    );
                                  }, 0);
                                }}
                              >
                                <p className="text-[#111418] text-sm">
                                  {u.name}
                                </p>
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
                          ? "Complete & Submit"
                          : "Update Request"
                        : "Submit Request"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>

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
                    label: `${selectedRequest.requestId || selectedRequest._id}`,
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
                        {/* Material Request # */}
                        {selectedRequest.requestId || selectedRequest._id}
                      </h1>
                      {Array.isArray(selectedRequest.attachments) &&
                        selectedRequest.attachments.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            <i className="fa-solid fa-paperclip"></i>
                            {selectedRequest.attachments.length}
                          </span>
                        )}
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
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {selectedPurchaseOrderLinks.map((po) => (
                        <button
                          key={String(po.poNumber)}
                          type="button"
                          onClick={() =>
                            openPurchaseOrderFromActivity(po.poNumber, po.poId)
                          }
                          className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          PO: {po.poNumber}
                        </button>
                      ))}
                      {selectedRfqLinks.map((rfq) => (
                        <button
                          key={String(rfq.rfqNumber)}
                          type="button"
                          onClick={() =>
                            openRfqFromActivity(rfq.rfqNumber, rfq.rfqId)
                          }
                          className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                        >
                          RFQ: {rfq.rfqNumber}
                        </button>
                      ))}
                    </div>
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

                            <h3>Request Breakdown</h3>
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
                  {["approved", "fulfilled"].includes(
                    String(selectedRequest.status || "").toLowerCase(),
                  ) &&
                    String(selectedRequest.requestType || "")
                      .toLowerCase()
                      .trim() !== "internal transfer" &&
                    !hasRfqBeenSent(selectedRequest) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRfqVendorIds([]);
                          setShowRfqModal(true);
                        }}
                        className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-white shadow-sm hover:bg-indigo-700 transition-colors text-sm font-bold"
                      >
                        <i className="fa-solid fa-file-export"></i>
                        <span className="truncate">RFQ</span>
                      </button>
                    )}
                  {["approved", "fulfilled"].includes(
                    String(selectedRequest.status || "").toLowerCase(),
                  ) &&
                    String(selectedRequest.requestType || "")
                      .toLowerCase()
                      .trim() !== "internal transfer" &&
                    !hasPurchaseOrderBeenCreated(selectedRequest) && (
                      <button
                        type="button"
                        onClick={handleCreatePoFromApproved}
                        disabled={creatingPo}
                        className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#137fec] px-5 text-white shadow-sm hover:bg-[#0d6efd] transition-colors text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {creatingPo ? (
                          <i className="fa-solid fa-circle-notch fa-spin"></i>
                        ) : (
                          <i className="fa-solid fa-file-invoice"></i>
                        )}
                        <span className="truncate">
                          {creatingPo ? "Creating PO..." : "Create PO"}
                        </span>
                      </button>
                    )}
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
                        <p className="text-[#617589] text-sm">Request Type</p>
                        <p className="text-[#111418] text-base font-medium">
                          {selectedRequest.requestType ||
                            selectedRequest.type ||
                            "Not specified"}
                        </p>
                      </div>
                      {!Array.isArray(selectedRequest.approvalChain) ||
                      selectedRequest.approvalChain.length === 0 ? (
                        <div className="flex flex-col gap-1">
                          <p className="text-[#617589] text-sm">Approver</p>
                          <p className="text-[#111418] text-base font-medium">
                            {selectedRequest.approver || "Not specified"}
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <p className="text-[#617589] text-sm">
                            Current Approver
                          </p>
                          <p className="text-[#111418] text-base font-medium">
                            {resolveApproverDisplay(selectedRequest)}
                          </p>
                        </div>
                      )}
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
                        <p className="text-[#617589] text-sm">Budget</p>
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

                  {Array.isArray(selectedRequest.attachments) &&
                    selectedRequest.attachments.length > 0 && (
                      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <i className="fa-solid fa-paperclip text-gray-500"></i>
                            <h3 className="text-lg font-bold text-[#111418]">
                              Attachments
                            </h3>
                          </div>
                          <span className="text-sm text-gray-500 font-medium">
                            {selectedRequest.attachments.length} file
                            {selectedRequest.attachments.length === 1
                              ? ""
                              : "s"}
                          </span>
                        </div>
                        <div className="p-6 space-y-2">
                          {selectedRequest.attachments.map((file, idx) => {
                            const fileName =
                              typeof file === "string"
                                ? file
                                : file?.fileName || file?.name || "Attachment";
                            const fileData =
                              typeof file === "string"
                                ? null
                                : file?.fileData || null;

                            return (
                              <div
                                key={`${fileName}-${idx}`}
                                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"
                              >
                                <div className="min-w-0 flex items-center gap-2">
                                  <i className="fa-solid fa-paperclip text-[#617589] text-sm"></i>
                                  <button
                                    type="button"
                                    onClick={() => openAttachmentInView(file)}
                                    className="truncate text-sm text-[#137fec] hover:text-[#0d6efd] underline text-left"
                                  >
                                    {fileName}
                                  </button>
                                </div>
                                {fileData ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openAttachmentInView(file)}
                                      className="rounded-md px-2 py-1 text-xs font-semibold text-[#137fec] hover:bg-blue-50"
                                    >
                                      View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const a = document.createElement("a");
                                        a.href = fileData;
                                        a.download = fileName;
                                        a.click();
                                      }}
                                      className="rounded-md px-2 py-1 text-xs font-semibold text-[#137fec] hover:bg-blue-50"
                                    >
                                      Download
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-[#617589]">
                                    Not downloadable
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {/* Material Details Table */}
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-box text-gray-500"></i>
                        <h3 className="text-lg font-bold text-[#111418]">
                          Request Details
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
                              Total Cost
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
                                {selectedApprovalInfo.approvedAtLabel}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="bg-green-100 text-green-700 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold">
                                  {selectedApprovalInfo.approverName
                                    ?.charAt(0)
                                    ?.toUpperCase() || "A"}
                                </div>
                                <span className="text-sm text-[#111418]">
                                  {selectedApprovalInfo.approverName}
                                </span>
                              </div>
                              <span className="ml-auto text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded w-fit">
                                {/* Approved */}
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
                                  {selectedRejectionInfo.rejectedAtLabel}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="bg-red-100 text-red-700 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold">
                                    {selectedRejectionInfo.rejectorName
                                      ?.charAt(0)
                                      ?.toUpperCase() || "R"}
                                  </div>
                                  <span className="text-sm text-[#111418]">
                                    {selectedRejectionInfo.rejectorName}
                                  </span>
                                </div>
                                <div className="mt-2 rounded bg-gray-50 p-2 text-xs italic text-gray-600 border border-gray-100">
                                  "{selectedRequest.rejectionReason}"
                                </div>
                              </div>
                            </div>
                          )}
                      </div>
                    </div>
                  </div>

                  {/* Activity & Comments */}
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-timeline text-gray-500"></i>
                        <h3 className="text-lg font-bold text-[#111418]">
                          Activity & Comments
                        </h3>
                      </div>
                      {(() => {
                        const totalEntries =
                          (selectedRequest.activities?.length || 0) +
                          (selectedRequest.comments?.length || 0);
                        if (totalEntries <= 0) return null;
                        return (
                          <span className="text-sm text-gray-500 font-medium">
                            {totalEntries}{" "}
                            {totalEntries === 1 ? "Entry" : "Entries"}
                          </span>
                        );
                      })()}
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

                        const nonCommentActivities = activities.filter(
                          (entry) => entry.type !== "comment",
                        );

                        const combined = [
                          ...nonCommentActivities,
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
                              rfq_created: "fa-file-signature text-sky-600",
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
                                    {entry.type === "rfq_created" &&
                                      entry.rfqNumber && (
                                        <button
                                          type="button"
                                          disabled={loadingRfqDetails}
                                          onClick={() =>
                                            openRfqFromActivity(
                                              entry.rfqNumber,
                                              entry.rfqId,
                                            )
                                          }
                                          className="ml-2 text-[#137fec] hover:text-[#0d6efd] underline font-semibold disabled:opacity-60"
                                        >
                                          {entry.rfqNumber}
                                        </button>
                                      )}
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
                                            className="text-[#137fec] font-semibold"
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
                    <div className="p-6 border-t border-gray-200">
                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-[#111418]">
                          Comment
                        </span>
                        <div className="relative">
                          <textarea
                            ref={viewCommentRef}
                            className="w-full rounded-lg border border-gray-300 bg-white text-[#111418] focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] px-4 py-3 min-h-[100px]"
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
                            <div className="absolute z-50 bottom-full left-0 right-0 -mt-3 py-2 bg-white rounded-xl shadow-lg max-h-[150px] overflow-y-auto w-[150px]">
                              {userList
                                .filter((u) =>
                                  u.name
                                    ?.toLowerCase()
                                    .includes(viewMentionSearch),
                                )
                                .slice(0, 5)
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
                                      const nextValue = replaced + after;
                                      const nextCaretPosition = replaced.length;
                                      setViewComment(nextValue);
                                      setShowViewMentionDropdown(false);
                                      setTimeout(() => {
                                        textarea.focus();
                                        textarea.setSelectionRange(
                                          nextCaretPosition,
                                          nextCaretPosition,
                                        );
                                      }, 0);
                                    }}
                                  >
                                    <p className="text-[#111418] text-sm">
                                      {u.name}
                                    </p>
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
                        </div>
                        <div className="flex justify-end items-center mt-1">
                          <button
                            type="button"
                            disabled={!viewComment.trim() || submittingComment}
                            onClick={submitViewComment}
                            className="rounded-lg bg-[#137fec] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d6efd] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {submittingComment ? "Posting..." : "Post"}
                          </button>
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
                                {/* (Required for rejection) */}
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
                                <span className="truncate">Reject</span>
                              </button>
                              <button
                                onClick={handleApproveRequest}
                                disabled={isApproving || isRejecting}
                                className="w-full sm:w-auto flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-green-600 px-8 text-white shadow-sm hover:bg-green-700 transition-colors text-sm font-bold"
                              >
                                {isApproving ? (
                                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                                ) : (
                                  <i className="fa-solid fa-circle-check"></i>
                                )}
                                <span className="truncate">
                                  {isApproving ? "Approving..." : "Approve"}
                                </span>
                              </button>
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

      {showRequestTypeModal && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#111418]">
                Manage Request Types
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowRequestTypeModal(false);
                  setNewRequestType("");
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRequestType}
                  onChange={(e) => setNewRequestType(e.target.value)}
                  placeholder="Add new request type"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = String(newRequestType || "").trim();
                    if (!next) return;
                    if (
                      requestTypeOptions.some(
                        (entry) =>
                          String(entry).toLowerCase() === next.toLowerCase(),
                      )
                    ) {
                      toast.error("Request type already exists");
                      return;
                    }
                    setRequestTypeOptions((prev) => [...prev, next]);
                    setNewRequestType("");
                  }}
                  className="rounded-lg bg-[#137fec] px-4 py-2 text-white text-sm font-semibold"
                >
                  Add
                </button>
              </div>

              <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 p-2">
                {requestTypeOptions.map((entry) => (
                  <div
                    key={entry}
                    className="flex items-center justify-between rounded px-2 py-2 hover:bg-gray-50"
                  >
                    <span className="text-sm text-[#111418]">{entry}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setRequestTypeOptions((prev) =>
                          prev.filter((item) => item !== entry),
                        )
                      }
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowRequestTypeModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingRequestTypes}
                onClick={saveRequestTypes}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingRequestTypes ? "Saving..." : "Save Types"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRfqModal && selectedRequest && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#111418]">Generate RFQ</h3>
              <button
                type="button"
                onClick={() => {
                  setShowRfqModal(false);
                  setSelectedRfqVendorIds([]);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-[#617589]">
                Select vendors to email the RFQ PDF for request
                <span className="font-semibold text-[#111418]">
                  {` #${selectedRequest.requestId || selectedRequest._id}`}
                </span>
                .
              </p>
              <div className="max-h-72 overflow-auto rounded-lg border border-gray-200">
                {(vendors || []).length === 0 ? (
                  <p className="p-4 text-sm text-[#617589]">
                    No active vendors available.
                  </p>
                ) : (
                  vendors.map((vendor) => {
                    const id = String(vendor._id || vendor.id || "");
                    const checked = selectedRfqVendorIds.includes(id);
                    return (
                      <label
                        key={id}
                        className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRfqVendorIds((prev) => [...prev, id]);
                            } else {
                              setSelectedRfqVendorIds((prev) =>
                                prev.filter((entry) => entry !== id),
                              );
                            }
                          }}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#111418] truncate">
                            {vendor.companyName || "Vendor"}
                          </p>
                          <p className="text-xs text-[#617589] truncate">
                            {vendor.email || "No email"}
                          </p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowRfqModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateRfq}
                disabled={sendingRfq}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sendingRfq ? "Sending..." : "Send RFQ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRfqEditModal && rfqEditData && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#111418]">
                Edit RFQ {rfqEditData.rfqNumber || ""}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowRfqEditModal(false);
                  setRfqEditData(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-[#617589]">
                    Vendor
                  </label>
                  <p className="mt-1 text-sm text-[#111418]">
                    {rfqEditData.vendorName || "N/A"}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#617589]">
                    RFQ Number
                  </label>
                  <p className="mt-1 text-sm text-[#111418]">
                    {rfqEditData.rfqNumber || "N/A"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-[#617589]">
                    Status
                  </label>
                  <select
                    value={rfqEditData.status}
                    onChange={(e) =>
                      setRfqEditData((prev) => ({
                        ...prev,
                        status: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="quotation_received">
                      Quotation Received
                    </option>
                    <option value="quotation_accepted">
                      Quotation Accepted
                    </option>
                    <option value="po_generated">PO Generated</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#617589]">
                    Required By Date
                  </label>
                  <input
                    type="date"
                    value={rfqEditData.requiredByDate}
                    onChange={(e) =>
                      setRfqEditData((prev) => ({
                        ...prev,
                        requiredByDate: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#617589]">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={rfqEditData.expiryDate}
                    onChange={(e) =>
                      setRfqEditData((prev) => ({
                        ...prev,
                        expiryDate: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#617589]">
                  Notes
                </label>
                <textarea
                  rows={4}
                  value={rfqEditData.notes}
                  onChange={(e) =>
                    setRfqEditData((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowRfqEditModal(false);
                  setRfqEditData(null);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRfqEdit}
                disabled={savingRfqEdit}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingRfqEdit ? "Saving..." : "Save RFQ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MaterialRequests;
