const express = require("express");
const router = express.Router();
const MaintenanceTicket = require("../models/MaintenanceTicket");
const NotificationModel = require("../models/Notification");
const { verifyToken } = require("../middleware/auth");

const createMaintenanceNotification = async ({ title, message, sourceKey, metadata = {}, targetUser = null }) => {
  try {
    const existing = await NotificationModel.findOne({ sourceKey });
    if (existing) return existing;

    return NotificationModel.create({
      title,
      message,
      type: "info",
      category: "maintenance",
      source: "maintenance-module",
      sourceKey,
      metadata,
      targetUser,
    });
  } catch (error) {
    console.error("Error creating maintenance notification:", error);
    return null;
  }
};

// Get all maintenance tickets with filtering and pagination
router.get("/", verifyToken, async (req, res) => {
  try {
    const {
      status,
      priority,
      category,
      assignedTo,
      reportedBy,
      search,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build filter object
    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (reportedBy) filter.reportedBy = reportedBy;

    // Add search functionality
    if (search) {
      filter.$or = [
        { ticketNumber: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "location.building": { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [tickets, total] = await Promise.all([
      MaintenanceTicket.find(filter)
        .populate("reportedBy", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email")
        .populate("comments.user", "firstName lastName")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      MaintenanceTicket.countDocuments(filter),
    ]);

    res.json({
      tickets,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching maintenance tickets:", error);
    res.status(500).json({ error: "Failed to fetch maintenance tickets" });
  }
});

// Get dashboard statistics
router.get("/stats", verifyToken, async (req, res) => {
  try {
    const [
      totalTickets,
      openTickets,
      inProgressTickets,
      completedTickets,
      urgentTickets,
      statusBreakdown,
      priorityBreakdown,
      categoryBreakdown,
    ] = await Promise.all([
      MaintenanceTicket.countDocuments(),
      MaintenanceTicket.countDocuments({ status: "Open" }),
      MaintenanceTicket.countDocuments({ status: "In Progress" }),
      MaintenanceTicket.countDocuments({ status: "Completed" }),
      MaintenanceTicket.countDocuments({ priority: "Urgent" }),
      MaintenanceTicket.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      MaintenanceTicket.aggregate([
        {
          $group: {
            _id: "$priority",
            count: { $sum: 1 },
          },
        },
      ]),
      MaintenanceTicket.aggregate([
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    // Calculate average completion time
    const completedWithDates = await MaintenanceTicket.find({
      status: "Completed",
      completedDate: { $exists: true },
    })
      .select("createdAt completedDate")
      .lean();

    const avgCompletionTime = completedWithDates.length
      ? completedWithDates.reduce((sum, ticket) => {
          const duration = ticket.completedDate - ticket.createdAt;
          return sum + duration;
        }, 0) / completedWithDates.length
      : 0;

    // Convert to days
    const avgDays = Math.round(avgCompletionTime / (1000 * 60 * 60 * 24));

    res.json({
      summary: {
        totalTickets,
        openTickets,
        inProgressTickets,
        completedTickets,
        urgentTickets,
        avgCompletionDays: avgDays,
      },
      breakdowns: {
        status: statusBreakdown,
        priority: priorityBreakdown,
        category: categoryBreakdown,
      },
    });
  } catch (error) {
    console.error("Error fetching statistics:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// Get single ticket by ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const ticket = await MaintenanceTicket.findById(req.params.id)
      .populate("reportedBy", "firstName lastName email department")
      .populate("assignedTo", "firstName lastName email department")
      .populate("comments.user", "firstName lastName")
      .populate("workLog.user", "firstName lastName");

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json(ticket);
  } catch (error) {
    console.error("Error fetching ticket:", error);
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

// Create new maintenance ticket
router.post("/", verifyToken, async (req, res) => {
  try {
    const ticketData = {
      ...req.body,
      reportedBy: req.user._id,
    };

    const ticket = new MaintenanceTicket(ticketData);
    await ticket.save();

    await createMaintenanceNotification({
      title: `Maintenance ticket created: ${ticket.ticketNumber}`,
      message: `${ticket.title || "A maintenance request"} was created with status ${ticket.status || "Open"}.`,
      sourceKey: `maintenance-ticket-created-${ticket._id}`,
      metadata: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
      },
      targetUser: ticket.assignedTo || null,
    });

    // Populate before sending response
    await ticket.populate("reportedBy", "firstName lastName email");

    res.status(201).json({
      message: "Maintenance ticket created successfully",
      ticket,
    });
  } catch (error) {
    console.error("Error creating ticket:", error);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// Update maintenance ticket
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // If status is being updated to "Completed", set completedDate
    if (updateData.status === "Completed" && !updateData.completedDate) {
      updateData.completedDate = new Date();
    }

    const ticket = await MaintenanceTicket.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("reportedBy", "firstName lastName email")
      .populate("assignedTo", "firstName lastName email");

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    if (String(updateData.status || "").toLowerCase() === "completed") {
      await createMaintenanceNotification({
        title: `Maintenance ticket completed: ${ticket.ticketNumber}`,
        message: `${ticket.title || "A maintenance request"} has been marked completed.`,
        sourceKey: `maintenance-ticket-completed-${ticket._id}`,
        metadata: {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          priority: ticket.priority,
        },
        targetUser: ticket.reportedBy || null,
      });
    }

    // Add to work log
    ticket.workLog.push({
      user: req.user._id,
      action: "Updated",
      description: `Ticket updated by ${req.user.firstName} ${req.user.lastName}`,
      timestamp: new Date(),
    });
    await ticket.save();

    res.json({
      message: "Ticket updated successfully",
      ticket,
    });
  } catch (error) {
    console.error("Error updating ticket:", error);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// Add comment to ticket
router.post("/:id/comments", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: "Comment cannot be empty" });
    }

    const ticket = await MaintenanceTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    ticket.comments.push({
      user: req.user._id,
      comment: comment.trim(),
      timestamp: new Date(),
    });

    await ticket.save();
    await ticket.populate("comments.user", "firstName lastName");

    res.json({
      message: "Comment added successfully",
      comments: ticket.comments,
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// Assign ticket to technician
router.post("/:id/assign", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo, assignedTeam } = req.body;

    const ticket = await MaintenanceTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    if (assignedTo) ticket.assignedTo = assignedTo;
    if (assignedTeam) ticket.assignedTeam = assignedTeam;
    
    if (ticket.status === "Open") {
      ticket.status = "Assigned";
    }

    // Add to work log
    ticket.workLog.push({
      user: req.user._id,
      action: "Assigned",
      description: `Ticket assigned by ${req.user.firstName} ${req.user.lastName}`,
      timestamp: new Date(),
    });

    await ticket.save();
    await ticket.populate("assignedTo", "firstName lastName email");

    res.json({
      message: "Ticket assigned successfully",
      ticket,
    });
  } catch (error) {
    console.error("Error assigning ticket:", error);
    res.status(500).json({ error: "Failed to assign ticket" });
  }
});

// Delete maintenance ticket
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const ticket = await MaintenanceTicket.findByIdAndDelete(req.params.id);

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json({ message: "Ticket deleted successfully" });
  } catch (error) {
    console.error("Error deleting ticket:", error);
    res.status(500).json({ error: "Failed to delete ticket" });
  }
});

module.exports = router;
