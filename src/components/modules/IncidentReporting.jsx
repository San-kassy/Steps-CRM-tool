import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Breadcrumb from "../Breadcrumb";
import { apiService } from "../../services/api";

const DEFAULT_FORM = {
  title: "",
  description: "",
  incidentType: "",
  date: new Date().toISOString().slice(0, 10),
  location: "",
  reportedBy: "",
  severity: "Low",
  status: "Open",
  actionTaken: "",
};

const statusOptions = ["Open", "In Progress", "Resolved", "Closed"];
const severityOptions = ["Low", "Medium", "High", "Critical"];

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

const toDateInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const escapeCsv = (value) => {
  const safe = String(value ?? "").replace(/"/g, '""');
  return `"${safe}"`;
};

const getReportedByLabel = (reportedBy) => {
  if (!reportedBy) return "-";
  if (typeof reportedBy === "string") return reportedBy;
  if (typeof reportedBy === "object") {
    const composedName = [reportedBy.firstName, reportedBy.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return composedName || reportedBy.email || reportedBy._id || "-";
  }
  return "-";
};

const IncidentReporting = () => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const isViewMode = modalMode === "view";

  const fetchIncidents = async () => {
    try {
      setLoading(true);
      const response = await apiService.get("/api/incident-reports", {
        params: {
          page: currentPage,
          limit: 10,
          search: search || undefined,
          status: statusFilter || undefined,
          severity: severityFilter || undefined,
        },
      });

      if (response?.success) {
        setIncidents(Array.isArray(response.data) ? response.data : []);
        setTotalPages(Math.max(response?.pagination?.totalPages || 1, 1));
      } else if (Array.isArray(response)) {
        setIncidents(response);
        setTotalPages(1);
      } else {
        setIncidents([]);
        setTotalPages(1);
      }
    } catch (error) {
      console.error("Failed to fetch incident reports:", error);
      toast.error("Failed to load incident reports");
      setIncidents([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, statusFilter, severityFilter]);

  const stats = useMemo(() => {
    const byStatus = incidents.reduce(
      (acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      },
      { Open: 0, "In Progress": 0, Resolved: 0, Closed: 0 },
    );

    return {
      total: incidents.length,
      open: byStatus.Open || 0,
      critical: incidents.filter((item) => item.severity === "Critical").length,
      resolved: byStatus.Resolved || 0,
    };
  }, [incidents]);

  const openCreateModal = () => {
    setModalMode("create");
    setSelectedIncidentId(null);
    setFormData({ ...DEFAULT_FORM });
    setIsModalOpen(true);
  };

  const openViewModal = (incident) => {
    setModalMode("view");
    setSelectedIncidentId(incident._id);
    setFormData({
      title: incident.title || "",
      description: incident.description || "",
      incidentType: incident.incidentType || "",
      date: toDateInput(incident.date),
      location: incident.location || "",
      reportedBy: getReportedByLabel(incident.reportedBy),
      severity: incident.severity || "Low",
      status: incident.status || "Open",
      actionTaken: incident.actionTaken || "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (incident) => {
    setModalMode("edit");
    setSelectedIncidentId(incident._id);
    setFormData({
      title: incident.title || "",
      description: incident.description || "",
      incidentType: incident.incidentType || "",
      date: toDateInput(incident.date),
      location: incident.location || "",
      reportedBy: getReportedByLabel(incident.reportedBy),
      severity: incident.severity || "Low",
      status: incident.status || "Open",
      actionTaken: incident.actionTaken || "",
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsSaving(false);
    setSelectedIncidentId(null);
    setFormData({ ...DEFAULT_FORM });
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!formData.title.trim() || !formData.description.trim()) {
      toast.error("Title and description are required");
      return;
    }

    if (!formData.date) {
      toast.error("Incident date is required");
      return;
    }

    try {
      setIsSaving(true);

      const payload = {
        ...formData,
        title: formData.title.trim(),
        description: formData.description.trim(),
        incidentType: formData.incidentType.trim(),
        location: formData.location.trim(),
        actionTaken: formData.actionTaken.trim(),
        reportedBy: formData.reportedBy.trim() || undefined,
      };

      if (modalMode === "edit" && selectedIncidentId) {
        await apiService.put(
          `/api/incident-reports/${selectedIncidentId}`,
          payload,
        );
        toast.success("Incident report updated");
      } else {
        await apiService.post("/api/incident-reports", payload);
        toast.success("Incident report created");
      }

      closeModal();
      fetchIncidents();
    } catch (error) {
      console.error("Failed to save incident report:", error);
      toast.error(error?.serverData?.error || "Failed to save incident report");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (incidentId) => {
    const confirmed = window.confirm("Delete this incident report?");
    if (!confirmed) return;

    try {
      await apiService.delete(`/api/incident-reports/${incidentId}`);
      toast.success("Incident report deleted");
      fetchIncidents();
    } catch (error) {
      console.error("Failed to delete incident report:", error);
      toast.error(
        error?.serverData?.error || "Failed to delete incident report",
      );
    }
  };

  const handleExportCsv = () => {
    if (!incidents.length) {
      toast.error("No incident reports to export");
      return;
    }

    const headers = [
      "Title",
      "Description",
      "Incident Type",
      "Date",
      "Location",
      "Reported By",
      "Severity",
      "Status",
      "Action Taken",
    ];

    const rows = incidents.map((item) => [
      item.title,
      item.description,
      item.incidentType,
      formatDate(item.date),
      item.location,
      getReportedByLabel(item.reportedBy),
      item.severity,
      item.status,
      item.actionTaken || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `incident-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("CSV export started");
  };

  const handlePrintIncident = (incident) => {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      toast.error("Unable to open print window");
      return;
    }

    const html = `
      <html>
        <head>
          <title>Incident Report - ${incident.title || "Untitled"}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin-bottom: 4px; }
            .meta { color: #475569; margin-bottom: 20px; }
            .row { margin-bottom: 12px; }
            .label { font-weight: bold; }
            .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <h1>Incident Report</h1>
          <p class="meta">Generated on ${new Date().toLocaleString()}</p>
          <div class="row"><span class="label">Title:</span> ${incident.title || "-"}</div>
          <div class="row"><span class="label">Incident Type:</span> ${incident.incidentType || "-"}</div>
          <div class="row"><span class="label">Date:</span> ${formatDate(incident.date)}</div>
          <div class="row"><span class="label">Location:</span> ${incident.location || "-"}</div>
          <div class="row"><span class="label">Reported By:</span> ${getReportedByLabel(incident.reportedBy)}</div>
          <div class="row"><span class="label">Severity:</span> ${incident.severity || "-"}</div>
          <div class="row"><span class="label">Status:</span> ${incident.status || "-"}</div>
          <div class="row"><span class="label">Description:</span></div>
          <div class="box">${incident.description || "-"}</div>
          <div class="row" style="margin-top: 16px;"><span class="label">Action Taken:</span></div>
          <div class="box">${incident.actionTaken || "-"}</div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col">
      <Breadcrumb
        items={[
          { label: "Home", href: "/home", icon: "fa-house" },
          { label: "Incident Reporting", icon: "fa-triangle-exclamation" },
        ]}
      />

      <section className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-[1800px] mx-auto w-full flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Incident Reporting
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Create, track, and print incident reports.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="px-3 py-2 rounded-md border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100"
            >
              <i className="fa-solid fa-file-csv mr-2"></i>
              Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-2 rounded-md border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100"
            >
              <i className="fa-solid fa-print mr-2"></i>
              Print List
            </button>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 rounded-md bg-primary text-white text-sm font-semibold hover:bg-blue-700"
            >
              <i className="fa-solid fa-plus mr-2"></i>
              New Incident
            </button>
          </div>
        </div>
      </section>

      <main className="flex-1 p-6">
        <div className="max-w-[1800px] mx-auto space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase font-semibold">
                Total Loaded
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {stats.total}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase font-semibold">
                Open
              </p>
              <p className="text-2xl font-bold text-amber-700 mt-1">
                {stats.open}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase font-semibold">
                Critical
              </p>
              <p className="text-2xl font-bold text-red-700 mt-1">
                {stats.critical}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase font-semibold">
                Resolved
              </p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">
                {stats.resolved}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setCurrentPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Search title, description, location..."
                className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setCurrentPage(1);
                setStatusFilter(e.target.value);
              }}
              className="px-3 py-2 rounded-md border border-slate-300 bg-white"
            >
              <option value="">All Statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(e) => {
                setCurrentPage(1);
                setSeverityFilter(e.target.value);
              }}
              className="px-3 py-2 rounded-md border border-slate-300 bg-white"
            >
              <option value="">All Severities</option>
              {severityOptions.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-700 uppercase text-xs">
                  <tr>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Title</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Severity</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Location</th>
                    <th className="text-left px-4 py-3">Reported By</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center py-8 text-slate-500"
                      >
                        Loading incident reports...
                      </td>
                    </tr>
                  )}

                  {!loading && incidents.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center py-8 text-slate-500"
                      >
                        No incident reports found.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    incidents.map((incident) => (
                      <tr
                        key={incident._id}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 text-slate-700">
                          {formatDate(incident.date)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {incident.title}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {incident.incidentType}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold">
                            {incident.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                            {incident.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {incident.location}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {getReportedByLabel(incident.reportedBy)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                              onClick={() => openViewModal(incident)}
                            >
                              View
                            </button>
                            <button
                              className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                              onClick={() => openEditModal(incident)}
                            >
                              Edit
                            </button>
                            <button
                              className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                              onClick={() => handlePrintIncident(incident)}
                            >
                              Print
                            </button>
                            <button
                              className="px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => handleDelete(incident._id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 rounded-md border border-slate-300 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 rounded-md border border-slate-300 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl bg-white rounded-lg border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {modalMode === "create" && "New Incident Report"}
                {modalMode === "edit" && "Edit Incident Report"}
                {modalMode === "view" && "Incident Report Details"}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-500 hover:text-slate-700"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 rounded-md border border-slate-300"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Incident Type
                  </label>
                  <input
                    type="text"
                    value={formData.incidentType}
                    onChange={(e) =>
                      handleChange("incidentType", e.target.value)
                    }
                    disabled={isViewMode}
                    className="w-full px-3 py-2 rounded-md border border-slate-300"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => handleChange("date", e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 rounded-md border border-slate-300"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => handleChange("location", e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 rounded-md border border-slate-300"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Reported By
                  </label>
                  <input
                    type="text"
                    value={formData.reportedBy}
                    onChange={(e) => handleChange("reportedBy", e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 rounded-md border border-slate-300"
                    placeholder="Name, email, or employee ID"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Severity
                  </label>
                  <select
                    value={formData.severity}
                    onChange={(e) => handleChange("severity", e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white"
                  >
                    {severityOptions.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleChange("status", e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) =>
                      handleChange("description", e.target.value)
                    }
                    disabled={isViewMode}
                    className="w-full px-3 py-2 rounded-md border border-slate-300"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Action Taken
                  </label>
                  <textarea
                    rows={3}
                    value={formData.actionTaken}
                    onChange={(e) =>
                      handleChange("actionTaken", e.target.value)
                    }
                    disabled={isViewMode}
                    className="w-full px-3 py-2 rounded-md border border-slate-300"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-md border border-slate-300 text-slate-700"
                >
                  Close
                </button>
                {!isViewMode && (
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 rounded-md bg-primary text-white font-semibold disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : "Save Incident"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidentReporting;
