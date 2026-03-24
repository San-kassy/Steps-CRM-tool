import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useAppContext } from "../../context/useAppContext";
import { useAuth } from "../../context/useAuth";
import Breadcrumb from "../Breadcrumb";
import { apiService } from "../../services/api";
import { toast } from "react-hot-toast";
import DataTable from "../common/DataTable";
import { useLocation, useNavigate } from "react-router-dom";

const PurchaseOrders = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { modules } = useAppContext();
  const { user } = useAuth();
  const pendingOpenPoRef = useRef({ id: "", number: "" });
  const commentInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedPo, setSelectedPo] = useState(null);
  const [loadingPoDetails, setLoadingPoDetails] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isCreatingPo, setIsCreatingPo] = useState(false);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [isTogglingLock, setIsTogglingLock] = useState(false);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({
    workflow: false,
    activity: false,
    lineItems: false,
    attachments: false,
    comment: false,
  });
  const [editForm, setEditForm] = useState({
    vendor: "",
    status: "draft",
    expectedDelivery: "",
    comment: "",
  });

  // API Data States
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [poVendorSearch, setPoVendorSearch] = useState("");
  const [activeUsers, setActiveUsers] = useState([]);
  const [unitOptions, setUnitOptions] = useState([]);
  const [unitMeta, setUnitMeta] = useState({});
  const [showCommentMentionDropdown, setShowCommentMentionDropdown] =
    useState(false);
  const [commentMentionSearch, setCommentMentionSearch] = useState("");
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);

  const handleCreateBlankPurchaseOrder = async () => {
    try {
      setIsCreatingPo(true);

      const payload = {
        vendor: "TBD",
        status: "draft",
        currency: "NGN",
        exchangeRateToNgn: 1,
        totalAmount: 0,
        totalAmountNgn: 0,
        lineItems: [],
        notes: "",
      };

      const response = await apiService.post("/api/purchase-orders", payload);
      const createdPo = response?.data || response;

      if (!createdPo?._id && !createdPo?.id) {
        throw new Error("Invalid purchase order response");
      }

      await fetchPurchaseOrders();
      await openPurchaseOrderDetails(createdPo);
      toast.success("Blank purchase order created");
    } catch (error) {
      console.error("Error creating blank purchase order:", error);
      toast.error(
        error?.serverData?.message ||
          error?.response?.data?.message ||
          "Failed to create purchase order",
      );
    } finally {
      setIsCreatingPo(false);
    }
  };

  // Fetch purchase orders from API
  const fetchPurchaseOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query parameters
      const params = {
        page: currentPage,
        limit,
      };

      if (searchQuery) params.search = searchQuery;
      if (selectedVendor) params.vendor = selectedVendor;
      if (selectedDateRange && selectedDateRange !== "all") {
        params.dateRange = selectedDateRange;
      }

      // Map activeFilter to status
      if (activeFilter && activeFilter !== "all") {
        params.status = activeFilter;
      } else if (selectedStatus) {
        params.status = selectedStatus;
      }

      const response = await apiService.get("/api/purchase-orders", {
        params,
      });

      if (response.orders) {
        setPurchaseOrders(response.orders);
        setTotal(response.total || 0);
        setTotalPages(response.totalPages || 1);
      } else if (Array.isArray(response)) {
        // Fallback for direct array response
        setPurchaseOrders(response);
        setTotal(response.length || 0);
        setTotalPages(Math.ceil(response.length / limit));
      } else {
        setPurchaseOrders([]);
        setTotal(0);
        setTotalPages(1);
      }
    } catch (err) {
      console.error("Error fetching purchase orders:", err);
      setError("Failed to load purchase orders");
      toast.error("Failed to load purchase orders");
      setPurchaseOrders([]);
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    limit,
    searchQuery,
    selectedVendor,
    selectedStatus,
    selectedDateRange,
    activeFilter,
  ]);

  useEffect(() => {
    fetchPurchaseOrders();
  }, [fetchPurchaseOrders]);

  // Fetch vendors on component mount
  useEffect(() => {
    fetchVendors();
    fetchActiveUsers();
    fetchUnitOptions();
  }, []);

  useEffect(() => {
    const poSearch = sessionStorage.getItem("purchaseOrdersSearch");
    const poOpenId = sessionStorage.getItem("purchaseOrdersOpenPoId");
    const poOpenNumber = sessionStorage.getItem("purchaseOrdersOpenPoNumber");
    const statePoId = String(location.state?.openPoId || "").trim();
    const statePoNumber = String(location.state?.openPoNumber || "").trim();

    if (poSearch) {
      setSearchQuery(poSearch);
      sessionStorage.removeItem("purchaseOrdersSearch");
    }

    if (poOpenId || poOpenNumber || statePoId || statePoNumber) {
      pendingOpenPoRef.current = {
        id: poOpenId || statePoId || "",
        number: poOpenNumber || statePoNumber || "",
      };
      sessionStorage.removeItem("purchaseOrdersOpenPoId");
      sessionStorage.removeItem("purchaseOrdersOpenPoNumber");
    }
  }, [location.state]);

  const fetchVendors = async () => {
    try {
      const response = await apiService.get("/api/vendors", {
        params: { limit: 1000 },
      });

      const payload = response?.data ?? response;
      const nextVendors = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.vendors)
          ? payload.vendors
          : Array.isArray(payload?.data?.vendors)
            ? payload.data.vendors
            : [];

      setVendors(
        nextVendors.filter((vendor) =>
          String(vendor?.companyName || vendor?.name || "").trim(),
        ),
      );
    } catch (err) {
      console.error("Error fetching vendors:", err);
      toast.error("Failed to load vendors");
      setVendors([]);
    }
  };

  const fetchActiveUsers = async () => {
    try {
      const response = await apiService.get("/api/users", {
        params: { status: "Active" },
      });
      const users = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
          ? response
          : [];
      setActiveUsers(users);
    } catch {
      setActiveUsers([]);
    }
  };

  const fetchUnitOptions = async () => {
    try {
      const response = await apiService.get("/api/inventory/units");
      const rows = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response?.data?.items)
          ? response.data.items
          : Array.isArray(response)
            ? response
            : [];

      const active = rows.filter((row) => row?.isActive !== false);
      const names = active
        .map((row) => String(row?.name || "").trim())
        .filter(Boolean);

      const nextMeta = active.reduce((acc, row) => {
        const key = String(row?.name || "").trim();
        if (!key) return acc;
        acc[key] = {
          baseQuantity: Number(row?.baseQuantity || 1),
          baseUnitLabel: String(row?.baseUnitLabel || "unit").trim(),
        };
        return acc;
      }, {});

      setUnitOptions(Array.from(new Set(names)));
      setUnitMeta(nextMeta);
    } catch {
      setUnitOptions([]);
      setUnitMeta({});
    }
  };

  const filteredPoVendors = useMemo(() => {
    const search = String(poVendorSearch || "")
      .toLowerCase()
      .trim();
    if (!search) return vendors;

    return vendors.filter((vendor) => {
      const name = String(
        vendor?.companyName || vendor?.name || "",
      ).toLowerCase();
      const email = String(vendor?.email || "").toLowerCase();
      const vendorId = String(
        vendor?.vendorId || vendor?._id || vendor?.id || "",
      ).toLowerCase();
      return (
        name.includes(search) ||
        email.includes(search) ||
        vendorId.includes(search)
      );
    });
  }, [vendors, poVendorSearch]);

  const getPoUnitLabel = (unitName) => {
    const cleaned = String(unitName || "").trim();
    if (!cleaned) return "";
    const meta = unitMeta[cleaned];
    if (!meta) return cleaned;
    return `${cleaned} (1 = ${meta.baseQuantity} ${meta.baseUnitLabel || "unit"})`;
  };

  const getRequestBreakdownValue = (field) => {
    const fromOverride = selectedPo?.requestBreakdown?.[field];
    if (
      fromOverride !== undefined &&
      fromOverride !== null &&
      fromOverride !== ""
    ) {
      return fromOverride;
    }
    return selectedPo?.linkedMaterialRequestId?.[field] || "";
  };

  // Helper function to get vendor initials
  const getVendorInitials = (vendorName) => {
    if (!vendorName) return "??";
    const words = vendorName.trim().split(" ");
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  };

  // Helper function to get random color for vendor avatar
  const getRandomVendorColor = (index) => {
    const colors = ["gray", "indigo", "orange", "teal", "purple", "pink"];
    return colors[index % colors.length];
  };

  // Format date from ISO to readable format
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Map status to UI labels and colors
  const getStatusInfo = (status) => {
    const statusMap = {
      draft: { label: "Draft", color: "yellow" },
      pending: { label: "Pending", color: "blue" },
      issued: { label: "Issued", color: "blue" },
      approved: { label: "Approved", color: "green" },
      payment_pending: { label: "Payment Pending", color: "orange" },
      partly_paid: { label: "Partly Paid", color: "orange" },
      paid: { label: "Paid", color: "green" },
      received: { label: "Received", color: "green" },
      closed: { label: "Closed", color: "gray" },
      cancelled: { label: "Cancelled", color: "red" },
      rejected: { label: "Rejected", color: "red" },
    };
    return (
      statusMap[status?.toLowerCase()] || {
        label: status || "Unknown",
        color: "gray",
      }
    );
  };

  const getStatusColorClasses = (color) => {
    const colors = {
      blue: "bg-blue-50 text-blue-700 border-blue-100",
      yellow: "bg-yellow-50 text-yellow-700 border-yellow-100",
      green: "bg-green-50 text-green-700 border-green-100",
      orange: "bg-orange-50 text-orange-700 border-orange-100",
      gray: "bg-gray-100 text-gray-700 border-gray-200",
      red: "bg-red-50 text-red-700 border-red-100",
    };
    return colors[color] || colors.gray;
  };

  const getStatusDotColor = (color) => {
    const colors = {
      blue: "bg-blue-500",
      yellow: "bg-yellow-500",
      green: "bg-green-500",
      orange: "bg-orange-500",
      gray: "bg-gray-500",
      red: "bg-red-500",
    };
    return colors[color] || colors.gray;
  };

  const getVendorBgColor = (color) => {
    const colors = {
      gray: "bg-gray-100 text-gray-600",
      indigo: "bg-indigo-50 text-indigo-600",
      orange: "bg-orange-50 text-orange-600",
      teal: "bg-teal-50 text-teal-600",
    };
    return colors[color] || colors.gray;
  };

  const formatPoCurrency = (amount, currencyCode = "NGN") => {
    const safeAmount = Number(amount) || 0;
    try {
      return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: 2,
      }).format(safeAmount);
    } catch {
      return `${currencyCode} ${safeAmount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
  };

  const resolvePoCurrency = (po) =>
    po?.currency || po?.linkedMaterialRequestId?.currency || "NGN";

  const getAttachmentName = (attachment, fallbackIndex) =>
    attachment?.fileName ||
    attachment?.name ||
    attachment?.originalName ||
    `Attachment ${fallbackIndex + 1}`;

  const getAttachmentHref = (attachment) =>
    attachment?.fileData || attachment?.url || attachment?.path || "";

  const getMaterialRequestLinkMeta = () => {
    const linkedRequest = selectedPo?.linkedMaterialRequestId;
    if (!linkedRequest) {
      return { id: "", label: "Not linked" };
    }

    if (typeof linkedRequest === "string") {
      return { id: linkedRequest, label: linkedRequest };
    }

    return {
      id: linkedRequest._id || linkedRequest.id || "",
      label: linkedRequest.requestId || linkedRequest._id || "Not linked",
    };
  };

  const openMaterialRequestDetails = async (requestId) => {
    if (!requestId) return;
    try {
      const modsRes = await apiService.get("/api/modules");
      const modules = Array.isArray(modsRes)
        ? modsRes
        : Array.isArray(modsRes?.data)
          ? modsRes.data
          : [];
      const mrModule = modules.find(
        (m) => String(m.name || "").toLowerCase() === "material requests",
      );

      if (!mrModule?.id) {
        toast.error("Material Requests module not found");
        return;
      }

      sessionStorage.setItem(
        "materialRequestsOpenRequestId",
        String(requestId),
      );
      navigate(`/home/${mrModule.id}`);
    } catch {
      toast.error("Unable to open Material Requests module");
    }
  };

  const resolveModuleIdByNames = useCallback(
    async (candidateNames = []) => {
      const normalize = (value) =>
        String(value || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");

      const targets = new Set(candidateNames.map(normalize).filter(Boolean));

      const fromContext = Array.isArray(modules) ? modules : [];
      const directMatch = fromContext.find((module) => {
        const name = normalize(module?.name);
        const component = normalize(module?.componentName);
        return targets.has(name) || targets.has(component);
      });

      if (directMatch?.id || directMatch?._id) {
        return String(directMatch.id || directMatch._id);
      }

      try {
        const modsRes = await apiService.get("/api/modules");
        const fetched = Array.isArray(modsRes)
          ? modsRes
          : Array.isArray(modsRes?.data)
            ? modsRes.data
            : [];

        const fetchedMatch = fetched.find((module) => {
          const name = normalize(module?.name);
          const component = normalize(module?.componentName);
          return targets.has(name) || targets.has(component);
        });

        if (fetchedMatch?.id || fetchedMatch?._id) {
          return String(fetchedMatch.id || fetchedMatch._id);
        }
      } catch {
        // Ignore and let caller decide fallback.
      }

      return "";
    },
    [modules],
  );

  const openInvoiceFromActivity = useCallback(
    async (invoiceNumber) => {
      const normalizedInvoiceNumber = String(invoiceNumber || "").trim();
      if (!normalizedInvoiceNumber) return;

      const financeModuleId = await resolveModuleIdByNames([
        "Finance",
        "Accounting",
      ]);

      if (!financeModuleId) {
        toast.error("Finance module not found.");
        return;
      }

      sessionStorage.setItem("financeOpenInvoicing", "1");
      sessionStorage.setItem("financeInvoiceSearch", normalizedInvoiceNumber);
      sessionStorage.setItem(
        "financeInvoiceExactNumber",
        normalizedInvoiceNumber,
      );

      navigate(`/home/${financeModuleId}`, {
        state: {
          openInvoicing: true,
          invoiceSearch: normalizedInvoiceNumber,
          invoiceExactNumber: normalizedInvoiceNumber,
        },
      });
    },
    [navigate, resolveModuleIdByNames],
  );

  const openPurchaseOrderByNumber = useCallback(
    async (poNumber) => {
      if (!poNumber) return;

      const inCurrentPage = purchaseOrders.find(
        (po) =>
          String(po.poNumber || "").toLowerCase() ===
          String(poNumber).toLowerCase(),
      );
      if (inCurrentPage) {
        await openPurchaseOrderDetails(inCurrentPage);
        return;
      }

      try {
        const response = await apiService.get("/api/purchase-orders", {
          params: {
            page: 1,
            limit: 50,
            search: poNumber,
          },
        });
        const rows = Array.isArray(response?.orders)
          ? response.orders
          : Array.isArray(response)
            ? response
            : [];
        const exactMatch = rows.find(
          (po) =>
            String(po.poNumber || "").toLowerCase() ===
            String(poNumber).toLowerCase(),
        );

        if (!exactMatch) {
          toast.error(`Purchase order ${poNumber} not found`);
          return;
        }

        await openPurchaseOrderDetails(exactMatch);
      } catch {
        toast.error("Failed to open purchase order");
      }
    },
    [purchaseOrders],
  );

  useEffect(() => {
    const runPendingOpen = async () => {
      const { id, number } = pendingOpenPoRef.current;
      if (!id && !number) return;

      if (id) {
        await openPurchaseOrderDetails({ _id: id });
        pendingOpenPoRef.current = { id: "", number: "" };
        return;
      }

      if (number) {
        await openPurchaseOrderByNumber(number);
        pendingOpenPoRef.current = { id: "", number: "" };
      }
    };

    if (!loading) {
      runPendingOpen();
    }
  }, [loading, purchaseOrders, openPurchaseOrderByNumber]);

  const filteredMentionUsers = activeUsers
    .map((activeUser) => ({
      id: activeUser?._id || activeUser?.id,
      name: activeUser?.fullName || activeUser?.name || "",
    }))
    .filter((activeUser) => Boolean(activeUser.name))
    .filter((activeUser) =>
      activeUser.name
        .toLowerCase()
        .includes(commentMentionSearch.toLowerCase()),
    )
    .slice(0, 8);

  const insertCommentAtCursor = (insertText) => {
    const textarea = commentInputRef.current;
    const currentText = editForm.comment || "";

    if (!textarea) {
      setEditForm((prev) => ({
        ...prev,
        comment: `${currentText}${insertText}`,
      }));
      return;
    }

    const cursor = textarea.selectionStart ?? currentText.length;
    const before = currentText.slice(0, cursor);
    const after = currentText.slice(cursor);
    const nextText = `${before}${insertText}${after}`;
    const nextCursor = before.length + insertText.length;

    setEditForm((prev) => ({ ...prev, comment: nextText }));

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const insertCommentMention = (name) => {
    const textarea = commentInputRef.current;
    const mentionValue = `@${name}`;
    const currentText = editForm.comment || "";

    if (!textarea) {
      setEditForm((prev) => ({
        ...prev,
        comment: `${currentText} ${mentionValue}`.trim(),
      }));
      setShowCommentMentionDropdown(false);
      setCommentMentionSearch("");
      return;
    }

    const cursor = textarea.selectionStart ?? currentText.length;
    const beforeCursor = currentText.slice(0, cursor);
    const afterCursor = currentText.slice(cursor);

    const replacedBefore = beforeCursor.replace(
      /(^|\s)@[a-zA-Z0-9._-]*$/,
      (match, leadingSpace) => `${leadingSpace}${mentionValue}`,
    );

    const nextText = `${replacedBefore} ${afterCursor}`;
    const nextCursor = replacedBefore.length + 1;

    setEditForm((prev) => ({ ...prev, comment: nextText }));
    setShowCommentMentionDropdown(false);
    setCommentMentionSearch("");

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const openPurchaseOrderDetails = async (po) => {
    try {
      const poId = po?._id || po?.id;
      if (!poId) {
        toast.error("Unable to open this purchase order");
        return;
      }

      setLoadingPoDetails(true);
      const response = await apiService.get(`/api/purchase-orders/${poId}`);
      const poData = response?.data || response;

      if (!poData?._id && !poData?.id) {
        toast.error("Purchase order details not found");
        return;
      }

      setSelectedPo(poData);
      setEditForm({
        vendor: poData.vendor || "",
        status: poData.status || "draft",
        expectedDelivery: poData.expectedDelivery
          ? new Date(poData.expectedDelivery).toISOString().split("T")[0]
          : "",
        comment: poData.notes || poData.comment || "",
      });
      setShowCommentMentionDropdown(false);
      setCommentMentionSearch("");
      setPoVendorSearch("");
      setIsEditing(false);
    } catch (err) {
      console.error("Error loading purchase order:", err);
      toast.error("Failed to open purchase order");
    } finally {
      setLoadingPoDetails(false);
    }
  };

  const toggleRowSelection = (poId) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(poId)) {
      newSelection.delete(poId);
    } else {
      newSelection.add(poId);
    }
    setSelectedRows(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === purchaseOrders.length) {
      setSelectedRows(new Set());
    } else {
      const allIds = new Set(purchaseOrders.map((po) => po._id || po.id));
      setSelectedRows(allIds);
    }
  };

  const handleDeleteSelectedRows = async () => {
    if (selectedRows.size === 0) {
      toast.error("No purchase orders selected");
      return;
    }

    try {
      setLoading(true);
      const deletePromises = Array.from(selectedRows).map((poId) =>
        apiService.delete(`/api/purchase-orders/${poId}`),
      );
      await Promise.all(deletePromises);
      toast.success(
        `${selectedRows.size} purchase order(s) deleted successfully`,
      );
      setSelectedRows(new Set());
      await fetchPurchaseOrders();
    } catch (err) {
      console.error("Error deleting purchase orders:", err);
      toast.error("Failed to delete some purchase orders");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePoEdit = async () => {
    try {
      if (!selectedPo?._id && !selectedPo?.id) return;
      if (selectedPo?.isLocked) {
        toast.error("Unlock this purchase order before editing");
        return;
      }
      setIsSavingEdit(true);

      const poId = selectedPo._id || selectedPo.id;
      const updatePayload = {
        vendor: editForm.vendor.trim(),
        status: editForm.status,
        expectedDelivery: editForm.expectedDelivery || null,
        notes: editForm.comment?.trim() || "",
        lineItems: Array.isArray(selectedPo?.lineItems)
          ? selectedPo.lineItems
          : [],
        totalAmount: (selectedPo?.lineItems || []).reduce(
          (sum, item) =>
            sum + (Number(item?.quantity) || 0) * (Number(item?.amount) || 0),
          0,
        ),
      };

      const updateResponse = await apiService.put(
        `/api/purchase-orders/${poId}`,
        updatePayload,
      );
      const updatedPo = updateResponse?.data || updateResponse;
      toast.success("Purchase order updated successfully");
      if (updatedPo?._id || updatedPo?.id) {
        setSelectedPo((prev) => ({ ...prev, ...updatedPo }));
      }
      setIsEditing(false);
      await fetchPurchaseOrders();
    } catch (err) {
      console.error("Error updating purchase order:", err);
      toast.error("Failed to update purchase order");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleSendPoComment = async () => {
    try {
      if (!selectedPo?._id && !selectedPo?.id) return;
      if (selectedPo?.isLocked) {
        toast.error("Unlock this purchase order before adding comments");
        return;
      }

      const trimmedComment = editForm.comment?.trim() || "";
      if (!trimmedComment) {
        toast.error("Comment cannot be empty");
        return;
      }

      setIsSendingComment(true);
      const poId = selectedPo._id || selectedPo.id;
      const response = await apiService.put(`/api/purchase-orders/${poId}`, {
        addActivityComment: true,
        comment: trimmedComment,
      });

      const updatedPo = response?.data || response;
      if (updatedPo?._id || updatedPo?.id) {
        setSelectedPo((prev) => ({ ...prev, ...updatedPo }));
      }

      setEditForm((prev) => ({
        ...prev,
        comment: "",
      }));
      setShowCommentMentionDropdown(false);
      setCommentMentionSearch("");

      await fetchPurchaseOrders();
      toast.success("Comment sent");
    } catch (error) {
      console.error("Error sending PO comment:", error);
      toast.error("Failed to send comment");
    } finally {
      setIsSendingComment(false);
    }
  };

  const refreshSelectedPoStatus = useCallback(async (poId) => {
    if (!poId) return;
    try {
      const response = await apiService.get(`/api/purchase-orders/${poId}`);
      const latestPo = response?.data || response;
      if (!latestPo?._id && !latestPo?.id) return;

      setSelectedPo((prev) => {
        if (!prev) return prev;
        const prevId = prev._id || prev.id;
        const nextId = latestPo._id || latestPo.id;
        if (String(prevId) !== String(nextId)) return prev;
        return { ...prev, ...latestPo };
      });

      setEditForm((prev) => ({
        ...prev,
        status: latestPo.status || prev.status,
      }));
    } catch {
      // Silent polling errors keep UX stable while user edits.
    }
  }, []);

  useEffect(() => {
    const selectedPoId = selectedPo?._id || selectedPo?.id;
    if (!selectedPoId) return undefined;

    const intervalId = setInterval(() => {
      refreshSelectedPoStatus(selectedPoId);
      fetchPurchaseOrders();
    }, 10000);

    return () => clearInterval(intervalId);
  }, [
    selectedPo?._id,
    selectedPo?.id,
    refreshSelectedPoStatus,
    fetchPurchaseOrders,
  ]);

  const handleToggleLock = async (shouldLock) => {
    try {
      if (!selectedPo?._id && !selectedPo?.id) return;
      setIsTogglingLock(true);

      const poId = selectedPo._id || selectedPo.id;
      let updatedPo = null;

      try {
        const response = await apiService.post(
          `/api/purchase-orders/${poId}/lock`,
          {
            locked: shouldLock,
          },
        );
        updatedPo = response?.data || response;
      } catch (lockError) {
        const lockStatus =
          lockError?.response?.status ||
          lockError?.status ||
          lockError?.serverData?.status;

        // Backward compatibility for running backend instances that don't have /lock yet.
        if (lockStatus !== 404) {
          throw lockError;
        }

        const fallbackPayload = shouldLock
          ? {
              status: "payment_pending",
              isLocked: true,
              lockedAt: new Date().toISOString(),
            }
          : {
              status: "draft",
              isLocked: false,
              lockedAt: null,
            };

        const fallbackResponse = await apiService.put(
          `/api/purchase-orders/${poId}`,
          fallbackPayload,
        );

        updatedPo = fallbackResponse?.data || fallbackResponse;
        toast(
          "Lock endpoint missing on current server process. Applied compatibility lock; restart backend to use full lock workflow.",
          { icon: "⚠️", duration: 4500 },
        );
      }

      if (updatedPo?._id || updatedPo?.id) {
        setSelectedPo(updatedPo);
      }
      await fetchPurchaseOrders();
      toast.success(
        shouldLock ? "Purchase order locked" : "Purchase order unlocked",
      );
    } catch (error) {
      console.error("Error toggling PO lock state:", error);
      toast.error(
        error?.serverData?.message ||
          error?.response?.data?.message ||
          "Failed to update lock state",
      );
    } finally {
      setIsTogglingLock(false);
    }
  };

  const handleApprovalDecision = async (approved) => {
    try {
      if (!selectedPo?._id && !selectedPo?.id) return;
      setIsSubmittingApproval(true);

      const poId = selectedPo._id || selectedPo.id;
      const response = await apiService.post(
        `/api/purchase-orders/${poId}/approve`,
        {
          approved,
          comment: editForm.comment?.trim() || "",
        },
      );

      const updatedPo = response?.data || response;
      if (updatedPo?._id || updatedPo?.id) {
        setSelectedPo(updatedPo);
      }
      await fetchPurchaseOrders();
      toast.success(approved ? "Approval submitted" : "Rejection submitted");
    } catch (error) {
      console.error("Error submitting PO approval:", error);
      toast.error("Failed to submit approval decision");
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const statusCounts = {
    all: total,
    draft:
      purchaseOrders?.filter((po) => po.status?.toLowerCase() === "draft")
        ?.length || 0,
    issued:
      purchaseOrders?.filter((po) => po.status?.toLowerCase() === "issued")
        ?.length || 0,
    received:
      purchaseOrders?.filter((po) => po.status?.toLowerCase() === "received")
        ?.length || 0,
  };

  const getApprovalProgressLabel = (po) => {
    const chain = Array.isArray(po?.approvalChain) ? po.approvalChain : [];
    if (chain.length === 0) return "No approval chain";
    const approved = chain.filter((step) => step.status === "approved").length;
    return `${approved}/${chain.length} approved`;
  };

  const canUserApprovePo = useCallback(
    (po) => {
      if (!po) return false;

      const normalize = (value) =>
        String(value || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
      const normalizeName = (value) =>
        normalize(value).replace(/[^a-z0-9\s]/g, "");

      const actorId = String(user?._id || user?.id || "").trim();
      const actorEmail = normalize(
        user?.primaryEmailAddress?.emailAddress || user?.email || "",
      );
      const actorName = normalizeName(
        user?.fullName ||
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          "",
      );
      const isAdmin = normalize(user?.role) === "admin";
      if (isAdmin) return true;

      const chain = Array.isArray(po?.approvalChain) ? po.approvalChain : [];
      const pendingOrAwaiting =
        chain.find(
          (step) => String(step?.status || "").toLowerCase() === "pending",
        ) ||
        chain.find(
          (step) => String(step?.status || "").toLowerCase() === "awaiting",
        );

      if (pendingOrAwaiting) {
        return (
          (pendingOrAwaiting.approverId &&
            String(pendingOrAwaiting.approverId).trim() === actorId) ||
          (pendingOrAwaiting.approverEmail &&
            normalize(pendingOrAwaiting.approverEmail) === actorEmail) ||
          (pendingOrAwaiting.approverName &&
            normalizeName(pendingOrAwaiting.approverName) === actorName)
        );
      }

      return (
        (po.approverId && String(po.approverId).trim() === actorId) ||
        (po.approverEmail && normalize(po.approverEmail) === actorEmail) ||
        (po.approver && normalizeName(po.approver) === actorName)
      );
    },
    [user],
  );

  const selectedPoStatus = String(selectedPo?.status || "").toLowerCase();
  const selectedPoComputedTotal = (selectedPo?.lineItems || []).reduce(
    (sum, item) =>
      sum + (Number(item?.quantity) || 0) * (Number(item?.amount) || 0),
    0,
  );
  const showApprovalDecisionButtons =
    !!selectedPo &&
    !selectedPo?.isLocked &&
    canUserApprovePo(selectedPo) &&
    ![
      "approved",
      "payment_pending",
      "paid",
      "rejected",
      "cancelled",
      "closed",
    ].includes(selectedPoStatus);
  const showLockControl =
    !!selectedPo && (selectedPo?.isLocked || selectedPoStatus === "approved");

  const toggleSection = (sectionKey) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const updatePoLineItem = (index, field, value) => {
    setSelectedPo((prev) => {
      if (!prev) return prev;
      const current = Array.isArray(prev.lineItems) ? [...prev.lineItems] : [];
      if (!current[index]) return prev;

      const nextValue =
        field === "quantity" || field === "amount" ? Number(value) : value;

      current[index] = {
        ...current[index],
        [field]: nextValue,
      };

      return { ...prev, lineItems: current };
    });
  };

  const addPoLineItem = () => {
    setSelectedPo((prev) => {
      if (!prev) return prev;
      const current = Array.isArray(prev.lineItems) ? [...prev.lineItems] : [];
      current.push({
        itemName: "",
        quantity: 1,
        quantityType: unitOptions[0] || "",
        amount: 0,
        description: "",
      });
      return { ...prev, lineItems: current };
    });
  };

  const removePoLineItem = (index) => {
    setSelectedPo((prev) => {
      if (!prev) return prev;
      const current = Array.isArray(prev.lineItems) ? [...prev.lineItems] : [];
      if (current.length <= 1) return prev;
      current.splice(index, 1);
      return { ...prev, lineItems: current };
    });
  };

  // Pagination handlers
  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Calculate pagination display
  const startRecord = total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const endRecord = Math.min(currentPage * limit, total);

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 3; i++) pages.push(i);
        pages.push("...");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push("...");
        for (let i = totalPages - 2; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push("...");
        pages.push(currentPage);
        pages.push("...");
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const purchaseOrderColumns = [
    {
      header: (
        <input
          type="checkbox"
          checked={
            selectedRows.size > 0 && selectedRows.size === purchaseOrders.length
          }
          onChange={toggleSelectAll}
          className="rounded border-[#dbe0e6] text-[#137fec] focus:ring-[#137fec]/20 cursor-pointer"
          title={
            selectedRows.size > 0 && selectedRows.size === purchaseOrders.length
              ? "Deselect all"
              : "Select all"
          }
        />
      ),
      accessorKey: "select",
      className: "w-[40px] pl-4 pr-3 py-3",
      cellClassName: "pl-4 pr-3 py-3",
      cell: (po) => {
        const poId = po._id || po.id;
        const isSelected = selectedRows.has(poId);
        return (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleRowSelection(poId)}
              className="rounded border-[#dbe0e6] text-[#137fec] focus:ring-[#137fec]/20 cursor-pointer"
            />
            {isSelected && (
              <button
                type="button"
                onClick={() => handleDeleteSelectedRows()}
                className="p-1 rounded-md text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                title="Delete selected"
              >
                <i className="fa-solid fa-trash text-[14px]"></i>
              </button>
            )}
          </div>
        );
      },
    },
    {
      header: (
        <div className="flex items-center gap-1 group cursor-pointer hover:text-[#137fec]">
          PO Number{" "}
          <i className="fa-solid fa-arrow-down text-[12px] opacity-0 group-hover:opacity-100 transition-opacity"></i>
        </div>
      ),
      accessorKey: "poNumber",
      className: "px-4 py-3",
      cellClassName: "px-4 py-3",
      cell: (po) => (
        <button
          type="button"
          onClick={() => openPurchaseOrderDetails(po)}
          className="text-sm font-medium text-[#137fec] hover:underline"
        >
          {po.poNumber || "N/A"}
        </button>
      ),
    },
    {
      header: (
        <div className="flex items-center gap-1 group cursor-pointer hover:text-[#137fec]">
          Request Title{" "}
          <i className="fa-solid fa-arrow-down text-[12px] opacity-0 group-hover:opacity-100 transition-opacity"></i>
        </div>
      ),
      accessorKey: "requestTitle",
      className: "px-4 py-3",
      cellClassName: "px-4 py-3",
      cell: (po, index) => {
        const requestTitle =
          po.requestTitle ||
          po.linkedMaterialRequestId?.requestTitle ||
          po.linkedMaterialRequestId?.requestId ||
          po.linkedMaterialRequestId?.reason ||
          po.linkedMaterialRequestId?.lineItems?.[0]?.description ||
          po.notes ||
          "Untitled Request";
        const vendorName = po.vendor || "Unknown Vendor";
        const vendorInitials = getVendorInitials(requestTitle);
        const vendorColor = getRandomVendorColor(index);
        return (
          <div className="flex items-center gap-3">
            <div
              className={`size-8 rounded-full ${getVendorBgColor(vendorColor)} flex items-center justify-center text-xs font-bold`}
            >
              {vendorInitials}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[#111418] font-medium truncate">
                {requestTitle}
              </p>
              <p className="text-xs text-[#617589] truncate">{vendorName}</p>
            </div>
          </div>
        );
      },
    },
    {
      header: (
        <div className="flex items-center gap-1 group cursor-pointer hover:text-[#137fec]">
          Order Date{" "}
          <i className="fa-solid fa-arrow-down text-[12px] opacity-0 group-hover:opacity-100 transition-opacity"></i>
        </div>
      ),
      accessorKey: "orderDate",
      className: "px-4 py-3",
      cellClassName: "px-4 py-3 text-sm text-[#617589]",
      cell: (po) => formatDate(po.createdAt || po.orderDate),
    },
    {
      header: "Status",
      accessorKey: "status",
      className: "px-4 py-3",
      cellClassName: "px-4 py-3",
      cell: (po) => {
        const statusInfo = getStatusInfo(po.status);
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColorClasses(statusInfo.color)}`}
          >
            <span
              className={`size-1.5 rounded-full ${getStatusDotColor(statusInfo.color)}`}
            ></span>{" "}
            {statusInfo.label}
          </span>
        );
      },
    },
    {
      header: (
        <div className="flex items-center justify-end gap-1 group cursor-pointer hover:text-[#137fec]">
          Total Amount{" "}
          <i className="fa-solid fa-arrow-down text-[12px] opacity-0 group-hover:opacity-100 transition-opacity"></i>
        </div>
      ),
      accessorKey: "totalAmount",
      className: "px-4 py-3 text-right",
      cellClassName:
        "px-4 py-3 text-sm font-medium text-[#111418] text-right font-mono",
      cell: (po) =>
        formatPoCurrency(po.totalAmount || 0, resolvePoCurrency(po)),
    },
    {
      header: "Actions",
      accessorKey: "actions",
      className: "px-4 py-3 text-center w-[80px]",
      cellClassName: "px-4 py-3 text-center",
      cell: (po) => (
        <button
          type="button"
          onClick={() => openPurchaseOrderDetails(po)}
          className="p-1 rounded-md text-[#617589] hover:bg-gray-100 transition-colors cursor-pointer"
          title="View purchase order details"
        >
          <i className="fa-solid fa-eye text-[16px]"></i>
        </button>
      ),
    },
  ];

  return (
    <div className="w-full min-h-screen bg-[#f6f7f8] flex flex-col">
      <Breadcrumb
        items={
          selectedPo
            ? [
                { label: "Home", href: "/home", icon: "fa-house" },
                {
                  label: "Purchase Orders",
                  icon: "fa-cart-shopping",
                  onClick: (e) => {
                    e.preventDefault();
                    setSelectedPo(null);
                  },
                },
                {
                  label: selectedPo.poNumber || "PO Details",
                  icon: "fa-file-invoice",
                },
              ]
            : [
                { label: "Home", href: "/home", icon: "fa-house" },
                { label: "Purchase Orders", icon: "fa-cart-shopping" },
              ]
        }
      />

      {/* Main Content */}
      <main className="flex-1 py-3 px-4 max-w-[1440px] mx-auto w-full">
        {loadingPoDetails && (
          <div className="rounded-xl border border-[#dbe0e6] bg-white p-6 mb-6 text-sm text-[#617589]">
            <i className="fa-solid fa-circle-notch fa-spin mr-2"></i>
            Loading purchase order details...
          </div>
        )}

        {selectedPo && !loadingPoDetails ? (
          <>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-[#111418] text-3xl font-black leading-tight tracking-[-0.033em]">
                  {selectedPo.poNumber || "Purchase Order"}
                </h1>
                <p className="text-[#617589] text-sm mt-1">
                  Full purchase order details and source request context.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
                    Status: {getStatusInfo(selectedPo?.status).label}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                      selectedPo?.isLocked
                        ? "bg-orange-50 text-orange-700 border-orange-100"
                        : "bg-emerald-50 text-emerald-700 border-emerald-100"
                    }`}
                  >
                    {selectedPo?.isLocked ? "Locked" : "Unlocked"}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
                    Approval: {getApprovalProgressLabel(selectedPo)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setEditForm({
                          vendor: selectedPo.vendor || "",
                          status: selectedPo.status || "draft",
                          expectedDelivery: selectedPo.expectedDelivery
                            ? new Date(selectedPo.expectedDelivery)
                                .toISOString()
                                .split("T")[0]
                            : "",
                          comment: selectedPo.notes || selectedPo.comment || "",
                        });
                      }}
                      className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-[#617589] text-sm font-semibold hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePoEdit}
                      disabled={
                        isSavingEdit ||
                        !editForm.vendor.trim() ||
                        selectedPo?.isLocked
                      }
                      className="px-4 py-2 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSavingEdit ? "Saving..." : "Save PO Changes"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    disabled={selectedPo?.isLocked}
                    className="px-4 py-2 rounded-lg border border-[#137fec] text-[#137fec] bg-white text-sm font-semibold hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Edit PO
                  </button>
                )}
                {showApprovalDecisionButtons && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleApprovalDecision(true)}
                      disabled={isSubmittingApproval}
                      className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmittingApproval ? "Submitting..." : "Approve"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprovalDecision(false)}
                      disabled={isSubmittingApproval}
                      className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmittingApproval ? "Submitting..." : "Deny"}
                    </button>
                  </>
                )}
                {showLockControl && (
                  <button
                    type="button"
                    onClick={() => handleToggleLock(!selectedPo?.isLocked)}
                    disabled={isTogglingLock || selectedPoStatus === "paid"}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-[#111418] hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTogglingLock
                      ? "Updating..."
                      : selectedPo?.isLocked
                        ? "Unlock PO"
                        : "Lock PO"}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 rounded-xl border border-[#dbe0e6] bg-white shadow-sm overflow-visible">
                <div className="px-6 py-4 border-b border-[#dbe0e6] bg-gray-50">
                  <h3 className="text-lg font-bold text-[#111418]">
                    Purchase Order Details
                  </h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-[#111418]">
                      Vendor
                    </span>
                    <input
                      type="text"
                      value={poVendorSearch}
                      disabled={!isEditing || selectedPo?.isLocked}
                      onChange={(e) => setPoVendorSearch(e.target.value)}
                      placeholder="Search vendor by name, email, or ID"
                      className="w-full rounded-lg border border-[#dbe0e6] h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:border-[#137fec] disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                    <select
                      value={editForm.vendor}
                      disabled={!isEditing || selectedPo?.isLocked}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          vendor: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-[#dbe0e6] h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:border-[#137fec] disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="">Select vendor</option>
                      {filteredPoVendors.map((vendor) => {
                        const vendorName =
                          vendor.companyName || vendor.name || "Unknown Vendor";
                        const vendorStatus = String(vendor.status || "").trim();
                        return (
                          <option
                            key={vendor._id || vendor.id || vendorName}
                            value={vendorName}
                          >
                            {vendorStatus
                              ? `${vendorName} (${vendorStatus})`
                              : vendorName}
                          </option>
                        );
                      })}
                      {editForm.vendor &&
                        !vendors.some(
                          (vendor) =>
                            (vendor.companyName || vendor.name || "") ===
                            editForm.vendor,
                        ) && (
                          <option value={editForm.vendor}>
                            {editForm.vendor}
                          </option>
                        )}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-[#111418]">
                      Status
                    </span>
                    <select
                      value={editForm.status}
                      disabled={!isEditing || selectedPo?.isLocked}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          status: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-[#dbe0e6] h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:border-[#137fec] disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="draft">Draft</option>
                      <option value="issued">Issued</option>
                      <option value="approved">Approved</option>
                      <option value="payment_pending">Payment Pending</option>
                      <option value="paid">Paid</option>
                      <option value="received">Received</option>
                      <option value="closed">Closed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </label>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-[#111418]">
                      Currency
                    </span>
                    <div className="h-10 px-3 rounded-lg border border-[#dbe0e6] bg-gray-50 flex items-center text-sm font-semibold text-[#111418]">
                      {resolvePoCurrency(selectedPo)}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-[#111418]">
                      Total Amount
                    </span>
                    <div className="h-10 px-3 rounded-lg border border-[#dbe0e6] bg-gray-50 flex items-center text-sm font-semibold text-[#111418]">
                      {formatPoCurrency(
                        selectedPoComputedTotal,
                        resolvePoCurrency(selectedPo),
                      )}
                    </div>
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-[#111418]">
                      Expected Delivery
                    </span>
                    <input
                      type="date"
                      value={editForm.expectedDelivery}
                      disabled={!isEditing || selectedPo?.isLocked}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          expectedDelivery: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-[#dbe0e6] h-10 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:border-[#137fec] disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </label>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-[#111418]">
                      Order Date
                    </span>
                    <div className="h-10 px-3 rounded-lg border border-[#dbe0e6] bg-gray-50 flex items-center text-sm font-semibold text-[#111418]">
                      {formatDate(selectedPo.orderDate || selectedPo.createdAt)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#dbe0e6] bg-white shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-[#dbe0e6] bg-gray-50 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[#111418]">Workflow</h3>
                  <button
                    type="button"
                    onClick={() => toggleSection("workflow")}
                    className="text-xs font-semibold text-[#617589] hover:text-[#111418]"
                  >
                    {collapsedSections.workflow ? "Expand" : "Collapse"}
                  </button>
                </div>
                {!collapsedSections.workflow && (
                  <div className="p-6 space-y-3 text-sm">
                    <div>
                      <p className="text-[#617589]">PO Lock Status</p>
                      <p className="text-[#111418] font-semibold">
                        {selectedPo?.isLocked ? "Locked" : "Unlocked"}
                      </p>
                    </div>
                    {Array.isArray(selectedPo?.approvalChain) &&
                    selectedPo.approvalChain.length > 0 ? (
                      <div>
                        <p className="text-[#617589] mb-1">Approval Steps</p>
                        <div className="space-y-2">
                          {selectedPo.approvalChain.map((step, idx) => (
                            <div
                              key={`${step.level || idx}-${step.approverName || step.approverRole || "approver"}`}
                              className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50"
                            >
                              <p className="text-sm font-semibold text-[#111418]">
                                Level {step.level || idx + 1}:{" "}
                                {step.approverName ||
                                  step.approverRole ||
                                  "Approver"}
                              </p>
                              <p className="text-xs text-[#617589] capitalize">
                                {step.status || "awaiting"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[#617589] text-sm">
                        No explicit approval chain configured.
                      </p>
                    )}

                    <hr className="my-3" />

                    <div>
                      <p className="text-[#617589]">Request Title</p>
                      <p className="text-[#111418] font-semibold">
                        {getRequestBreakdownValue("requestTitle") ||
                          selectedPo?.linkedMaterialRequestId?.requestId ||
                          selectedPo?.linkedMaterialRequestId?.reason ||
                          selectedPo?.linkedMaterialRequestId?.lineItems?.[0]
                            ?.description ||
                          selectedPo?.requestTitle ||
                          selectedPo?.notes ||
                          "Untitled Request"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#617589]">Material Request ID</p>
                      {(() => {
                        const materialRequestMeta =
                          getMaterialRequestLinkMeta();
                        return materialRequestMeta.id ? (
                          <button
                            type="button"
                            onClick={() =>
                              openMaterialRequestDetails(materialRequestMeta.id)
                            }
                            className="text-[#137fec] font-semibold hover:underline"
                          >
                            {materialRequestMeta.label}
                          </button>
                        ) : (
                          <p className="text-[#111418] font-semibold">
                            {materialRequestMeta.label}
                          </p>
                        );
                      })()}
                    </div>
                    <div>
                      <p className="text-[#617589]">Requested By</p>
                      <p className="text-[#111418] font-semibold">
                        {getRequestBreakdownValue("requestedBy") || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#617589]">Department</p>
                      <p className="text-[#111418] font-semibold">
                        {getRequestBreakdownValue("department") || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#617589]">Request Type</p>
                      <p className="text-[#111418] font-semibold">
                        {getRequestBreakdownValue("requestType") || "N/A"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-[#dbe0e6] bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#dbe0e6] bg-gray-50 flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#111418]">Activity</h3>
                <button
                  type="button"
                  onClick={() => toggleSection("activity")}
                  className="text-xs font-semibold text-[#617589] hover:text-[#111418]"
                >
                  {collapsedSections.activity ? "Expand" : "Collapse"}
                </button>
              </div>
              {!collapsedSections.activity && (
                <div className="p-6 space-y-3">
                  {Array.isArray(selectedPo?.activities) &&
                  selectedPo.activities.length > 0 ? (
                    selectedPo.activities
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(a.timestamp || 0).getTime() -
                          new Date(b.timestamp || 0).getTime(),
                      )
                      .map((entry, idx) => (
                        <div
                          key={`${entry.type || "activity"}-${idx}`}
                          className="flex items-start gap-3"
                        >
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                            <i className="fa-solid fa-clock text-xs text-[#617589]"></i>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-[#111418] whitespace-pre-wrap">
                              <span className="font-semibold">
                                {entry.author || "System"}
                              </span>{" "}
                              {String(entry.text || "Updated purchase order")
                                .split(
                                  /(@\w+(?:\s\w+)?|Invoice #[a-zA-Z0-9_-]+)/,
                                )
                                .map((part, pIdx) => {
                                  if (/^@\w+/.test(part)) {
                                    return (
                                      <span
                                        key={pIdx}
                                        className="text-[#137fec] font-semibold"
                                      >
                                        {part}
                                      </span>
                                    );
                                  } else if (
                                    /^Invoice #[a-zA-Z0-9_-]+/.test(part)
                                  ) {
                                    const invNum = part.replace("Invoice-", "");
                                    return (
                                      <button
                                        key={pIdx}
                                        type="button"
                                        onClick={() =>
                                          openInvoiceFromActivity(invNum)
                                        }
                                        className="inline-flex items-center text-[#137fec] hover:text-blue-700 hover:underline font-semibold mx-0.5"
                                      >
                                        {part}
                                      </button>
                                    );
                                  }
                                  return <span key={pIdx}>{part}</span>;
                                })}
                            </p>
                            <p className="text-xs text-[#617589] mt-0.5">
                              {entry.timestamp
                                ? new Date(entry.timestamp).toLocaleString()
                                : "Unknown time"}
                            </p>
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-[#617589]">No activity yet.</p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-[#dbe0e6] bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#dbe0e6] bg-gray-50 flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#111418]">Items</h3>
                <div className="flex items-center gap-3">
                  {isEditing && !selectedPo?.isLocked && (
                    <button
                      type="button"
                      onClick={addPoLineItem}
                      className="text-xs font-semibold text-[#137fec] hover:text-[#0d6efd]"
                    >
                      +
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleSection("lineItems")}
                    className="text-xs font-semibold text-[#617589] hover:text-[#111418]"
                  >
                    {collapsedSections.lineItems ? "Expand" : "Collapse"}
                  </button>
                </div>
              </div>
              {!collapsedSections.lineItems && (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#617589] uppercase">
                          Item
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#617589] uppercase">
                          Qty
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#617589] uppercase">
                          Unit
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-[#617589] uppercase">
                          Unit Cost
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-[#617589] uppercase">
                          Total
                        </th>
                        {isEditing && !selectedPo?.isLocked && (
                          <th className="px-4 py-3 text-right text-xs font-semibold text-[#617589] uppercase">
                            Remove
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {(selectedPo.lineItems || []).map((item, idx) => (
                        <tr key={`${item.itemName || "item"}-${idx}`}>
                          <td className="px-4 py-3 text-sm font-medium text-[#111418]">
                            {isEditing && !selectedPo?.isLocked ? (
                              <input
                                type="text"
                                value={item.itemName || ""}
                                onChange={(e) =>
                                  updatePoLineItem(
                                    idx,
                                    "itemName",
                                    e.target.value,
                                  )
                                }
                                className="w-full rounded border border-gray-300 px-2 py-1"
                              />
                            ) : (
                              item.itemName || "-"
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#111418]">
                            {isEditing && !selectedPo?.isLocked ? (
                              <input
                                type="number"
                                min="0"
                                value={item.quantity || 0}
                                onChange={(e) =>
                                  updatePoLineItem(
                                    idx,
                                    "quantity",
                                    e.target.value,
                                  )
                                }
                                className="w-24 rounded border border-gray-300 px-2 py-1"
                              />
                            ) : (
                              item.quantity || 0
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#617589]">
                            {isEditing && !selectedPo?.isLocked ? (
                              <select
                                value={item.quantityType || ""}
                                onChange={(e) =>
                                  updatePoLineItem(
                                    idx,
                                    "quantityType",
                                    e.target.value,
                                  )
                                }
                                className="w-56 rounded border border-gray-300 px-2 py-1"
                              >
                                <option value="">
                                  {unitOptions.length === 0
                                    ? "No active units"
                                    : "Select unit"}
                                </option>
                                {Array.from(
                                  new Set(
                                    [...unitOptions, item.quantityType].filter(
                                      Boolean,
                                    ),
                                  ),
                                ).map((option) => (
                                  <option key={option} value={option}>
                                    {getPoUnitLabel(option)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              item.quantityType || "-"
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#111418] text-right">
                            {isEditing && !selectedPo?.isLocked ? (
                              <input
                                type="number"
                                min="0"
                                step="0.0"
                                value={item.amount || 0}
                                onChange={(e) =>
                                  updatePoLineItem(
                                    idx,
                                    "amount",
                                    e.target.value,
                                  )
                                }
                                className="w-28 rounded border border-gray-300 px-2 py-1 text-right"
                              />
                            ) : (
                              formatPoCurrency(
                                item.amount || 0,
                                resolvePoCurrency(selectedPo),
                              )
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-[#111418] text-right">
                            {formatPoCurrency(
                              (Number(item.quantity) || 0) *
                                (Number(item.amount) || 0),
                              resolvePoCurrency(selectedPo),
                            )}
                          </td>
                          {isEditing && !selectedPo?.isLocked && (
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => removePoLineItem(idx)}
                                className="text-red-600 hover:text-red-700"
                                title="Remove item"
                              >
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-[#dbe0e6] bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#dbe0e6] bg-gray-50 flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#111418]">
                  Attachments
                </h3>
                <button
                  type="button"
                  onClick={() => toggleSection("attachments")}
                  className="text-xs font-semibold text-[#617589] hover:text-[#111418]"
                >
                  {collapsedSections.attachments ? "Expand" : "Collapse"}
                </button>
              </div>
              {!collapsedSections.attachments && (
                <div className="p-6">
                  {Array.isArray(
                    selectedPo?.linkedMaterialRequestId?.attachments,
                  ) &&
                  selectedPo.linkedMaterialRequestId.attachments.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {selectedPo.linkedMaterialRequestId.attachments.map(
                        (file, idx) => {
                          const attachmentHref = getAttachmentHref(file);
                          const attachmentName = getAttachmentName(file, idx);
                          return attachmentHref ? (
                            <a
                              key={`${attachmentName}-${idx}`}
                              href={attachmentHref}
                              target="_blank"
                              rel="noreferrer"
                              download={attachmentName}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-[#111418] text-sm hover:bg-gray-100"
                            >
                              <i className="fa-solid fa-paperclip text-[#617589]"></i>
                              <span>{attachmentName}</span>
                            </a>
                          ) : (
                            <div
                              key={`${attachmentName}-${idx}`}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-[#111418] text-sm"
                            >
                              <i className="fa-solid fa-file text-[#617589]"></i>
                              <span>{attachmentName}</span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-[#617589]">
                      No attachments on source request.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-[#dbe0e6] bg-white shadow-sm overflow-visible">
              <div className="px-6 py-4 border-b border-[#dbe0e6] bg-gray-50 flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#111418]">Comment</h3>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-[#617589]">
                    Use @ to mention active users
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleSection("comment")}
                    className="text-xs font-semibold text-[#617589] hover:text-[#111418]"
                  >
                    {collapsedSections.comment ? "Expand" : "Collapse"}
                  </button>
                </div>
              </div>
              {!collapsedSections.comment && (
                <div className="p-6">
                  <label className="flex flex-col gap-1.5 relative">
                    <textarea
                      ref={commentInputRef}
                      rows="4"
                      value={editForm.comment}
                      disabled={selectedPo?.isLocked}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setEditForm((prev) => ({
                          ...prev,
                          comment: nextValue,
                        }));

                        const cursor =
                          e.target.selectionStart ?? nextValue.length;
                        const beforeCursor = nextValue.slice(0, cursor);
                        const mentionMatch = beforeCursor.match(
                          /(?:^|\s)@([a-zA-Z0-9._-]*)$/,
                        );

                        if (mentionMatch) {
                          setCommentMentionSearch(mentionMatch[1] || "");
                          setShowCommentMentionDropdown(true);
                        } else {
                          setShowCommentMentionDropdown(false);
                          setCommentMentionSearch("");
                        }
                      }}
                      onKeyDown={async (e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !showCommentMentionDropdown
                        ) {
                          e.preventDefault();
                          await handleSendPoComment();
                        }
                      }}
                      placeholder={
                        selectedPo?.isLocked
                          ? "Unlock purchase order to edit comments"
                          : "Add a comment... Use @ to mention someone (Enter to send, Shift+Enter for new line)"
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#111418] placeholder-[#617589] focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] min-h-[70px] resize-y outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                    {showCommentMentionDropdown && (
                      <div className="absolute z-50 top-full left-0 right-0 -mt-2 bg-white rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                        {filteredMentionUsers.length > 0 ? (
                          filteredMentionUsers.map((activeUser) => (
                            <button
                              key={activeUser.id || activeUser.name}
                              type="button"
                              onClick={() =>
                                insertCommentMention(activeUser.name)
                              }
                              className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                            >
                              <strong className="text-[#111418] text-sm">
                                {activeUser.name}
                              </strong>
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-center text-[#617589] text-sm">
                            No users found
                          </div>
                        )}
                      </div>
                    )}
                  </label>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      disabled={selectedPo?.isLocked}
                      onClick={() => {
                        insertCommentAtCursor("@");
                        setShowCommentMentionDropdown(true);
                        setCommentMentionSearch("");
                      }}
                      className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-[#617589] hover:text-[#111418] transition-colors rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="fa-solid fa-at text-sm"></i>
                    </button>
                    <button
                      type="button"
                      onClick={handleSendPoComment}
                      disabled={
                        isSendingComment ||
                        selectedPo?.isLocked ||
                        !editForm.comment?.trim()
                      }
                      className="px-4 py-2 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSendingComment ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Page Heading */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-[#111418] text-3xl font-black leading-tight tracking-[-0.033em]">
                  Purchase Orders
                </h1>
                <p className="text-[#617589] text-sm mt-1">
                  Manage, track, and create new purchase orders.
                </p>
              </div>
              <button
                className="flex items-center justify-center gap-2 overflow-hidden rounded-lg h-10 px-5 bg-[#137fec] hover:bg-blue-600 transition-colors text-white text-sm font-bold leading-normal tracking-[0.015em] shadow-sm"
                onClick={handleCreateBlankPurchaseOrder}
                disabled={isCreatingPo}
              >
                <i
                  className={`fa-solid ${isCreatingPo ? "fa-circle-notch fa-spin" : "fa-plus"} text-[16px]`}
                ></i>
                <span className="truncate">
                  {isCreatingPo ? "Creating..." : "Create Purchase Order"}
                </span>
              </button>
            </div>

            {/* Filters & Search Toolbar */}
            <div className="bg-white rounded-xl border border-[#dbe0e6] p-4 mb-6 shadow-sm">
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Search */}
                <div className="flex-1 min-w-[280px]">
                  <div className="relative">
                    <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#617589] text-[14px]"></i>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-[#dbe0e6] bg-white h-10 pl-10 pr-4 text-sm text-[#111418] placeholder-[#617589] focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:border-[#137fec]"
                      placeholder="Search by PO #, Vendor name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* Filters Group */}
                <div className="flex flex-wrap gap-3 flex-1 lg:justify-end">
                  {/* Date Range */}
                  <div className="relative min-w-[180px] flex-1 lg:flex-none">
                    <select
                      value={selectedDateRange}
                      onChange={(e) => {
                        setSelectedDateRange(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{
                        appearance: "none",
                        WebkitAppearance: "none",
                        MozAppearance: "none",
                      }}
                      className="w-full rounded-lg border border-[#dbe0e6] bg-white h-10 pl-3 pr-8 text-sm text-[#111418] focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:border-[#137fec] cursor-pointer"
                    >
                      <option value="all">All Dates</option>
                      <option value="last7">Last 7 days</option>
                      <option value="last30">Last 30 days</option>
                      <option value="last90">Last 90 days</option>
                      <option value="thisMonth">This month</option>
                    </select>
                    <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-[#617589] pointer-events-none text-[12px]"></i>
                  </div>

                  {/* Vendor Filter */}
                  <div className="relative min-w-[160px] flex-1 lg:flex-none">
                    <select
                      value={selectedVendor}
                      onChange={(e) => {
                        setSelectedVendor(e.target.value);
                        setCurrentPage(1); // Reset to first page on filter change
                      }}
                      style={{
                        appearance: "none",
                        WebkitAppearance: "none",
                        MozAppearance: "none",
                      }}
                      className="w-full rounded-lg border border-[#dbe0e6] bg-white h-10 pl-3 pr-8 text-sm text-[#111418] focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:border-[#137fec] cursor-pointer"
                    >
                      <option value="">All Vendors</option>
                      {vendors.map((vendor) => (
                        <option key={vendor._id} value={vendor.companyName}>
                          {vendor.companyName}
                        </option>
                      ))}
                    </select>
                    <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-[#617589] pointer-events-none text-[12px]"></i>
                  </div>

                  {/* Status Filter */}
                  <div className="relative min-w-[160px] flex-1 lg:flex-none">
                    <select
                      value={selectedStatus}
                      onChange={(e) => {
                        setSelectedStatus(e.target.value);
                        setActiveFilter("all");
                        setCurrentPage(1); // Reset to first page on filter change
                      }}
                      style={{
                        appearance: "none",
                        WebkitAppearance: "none",
                        MozAppearance: "none",
                      }}
                      className="w-full rounded-lg border border-[#dbe0e6] bg-white h-10 pl-3 pr-8 text-sm text-[#111418] focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:border-[#137fec] cursor-pointer"
                    >
                      <option value="">All Statuses</option>
                      <option value="draft">Draft</option>
                      <option value="issued">Issued</option>
                      <option value="approved">Approved</option>
                      <option value="payment_pending">Payment Pending</option>
                      <option value="paid">Paid</option>
                      <option value="received">Received</option>
                      <option value="closed">Closed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-[#617589] pointer-events-none text-[12px]"></i>
                  </div>
                </div>
              </div>

              {/* Quick Status Chips */}
              <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
                <button
                  onClick={() => {
                    setActiveFilter("all");
                    setSelectedStatus("");
                    setSelectedDateRange("all");
                    setCurrentPage(1);
                  }}
                  className={`flex h-7 shrink-0 items-center justify-center gap-x-1.5 rounded-full px-3 transition-colors text-xs font-semibold ${
                    activeFilter === "all"
                      ? "bg-[#137fec] text-white border border-transparent"
                      : "bg-white hover:bg-gray-100 text-[#617589] border border-[#dbe0e6]"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setActiveFilter("draft");
                    setSelectedStatus("");
                    setCurrentPage(1);
                  }}
                  className={`flex h-7 shrink-0 items-center justify-center gap-x-1.5 rounded-full px-3 transition-colors text-xs font-medium ${
                    activeFilter === "draft"
                      ? "bg-[#137fec] text-white border border-transparent"
                      : "bg-white hover:bg-gray-100 text-[#617589] border border-[#dbe0e6]"
                  }`}
                >
                  Draft{" "}
                  <span className="bg-[#f0f2f4] px-1.5 rounded-md text-[10px] text-[#111418]">
                    {statusCounts.draft}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setActiveFilter("issued");
                    setSelectedStatus("");
                    setCurrentPage(1);
                  }}
                  className={`flex h-7 shrink-0 items-center justify-center gap-x-1.5 rounded-full px-3 transition-colors text-xs font-medium ${
                    activeFilter === "issued"
                      ? "bg-[#137fec] text-white border border-transparent"
                      : "bg-white hover:bg-gray-100 text-[#617589] border border-[#dbe0e6]"
                  }`}
                >
                  Issued{" "}
                  <span className="bg-[#f0f2f4] px-1.5 rounded-md text-[10px] text-[#111418]">
                    {statusCounts.issued}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setActiveFilter("received");
                    setSelectedStatus("");
                    setCurrentPage(1);
                  }}
                  className={`flex h-7 shrink-0 items-center justify-center gap-x-1.5 rounded-full px-3 transition-colors text-xs font-medium ${
                    activeFilter === "received"
                      ? "bg-[#137fec] text-white border border-transparent"
                      : "bg-white hover:bg-gray-100 text-[#617589] border border-[#dbe0e6]"
                  }`}
                >
                  Received{" "}
                  <span className="bg-[#f0f2f4] px-1.5 rounded-md text-[10px] text-[#111418]">
                    {statusCounts.received}
                  </span>
                </button>
              </div>
            </div>

            {/* Data Table Section */}
            <div className="bg-white rounded-xl border border-[#dbe0e6] overflow-hidden shadow-sm flex flex-col">
              <DataTable
                columns={purchaseOrderColumns}
                data={purchaseOrders}
                isLoading={loading}
                emptyMessage={
                  error
                    ? error
                    : "No purchase orders found. Try adjusting your filters or create a new purchase order."
                }
                keyExtractor={(po) => po._id || po.id}
              />

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#dbe0e6] bg-white">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[#617589]">
                    Showing{" "}
                    <span className="font-bold text-[#111418]">
                      {startRecord}-{endRecord}
                    </span>{" "}
                    of <span className="font-bold text-[#111418]">{total}</span>{" "}
                    results
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrevPage}
                    disabled={currentPage === 1}
                    className="flex items-center justify-center size-8 rounded hover:bg-[#f0f2f4] text-[#617589] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <i className="fa-solid fa-chevron-left text-[14px]"></i>
                  </button>

                  {getPageNumbers().map((page, index) => {
                    if (page === "...") {
                      return (
                        <span
                          key={`ellipsis-${index}`}
                          className="text-[#617589] px-1"
                        >
                          ...
                        </span>
                      );
                    }

                    return (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`flex items-center justify-center size-8 rounded text-sm transition-colors ${
                          currentPage === page
                            ? "bg-[#137fec]/10 text-[#137fec] font-bold"
                            : "hover:bg-[#f0f2f4] text-[#617589]"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}

                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="flex items-center justify-center size-8 rounded hover:bg-[#f0f2f4] text-[#617589] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <i className="fa-solid fa-chevron-right text-[14px]"></i>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default PurchaseOrders;
