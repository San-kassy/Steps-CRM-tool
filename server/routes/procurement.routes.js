const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const MaterialRequest = require('../models/MaterialRequest');
const PurchaseOrder = require('../models/PurchaseOrder');
const RFQ = require('../models/RFQ');
const BudgetCategory = require('../models/BudgetCategory');
const Vendor = require('../models/Vendor');
const SystemSettings = require('../models/SystemSettings');
const InventoryItem = require('../models/InventoryItem');
const InventoryIssue = require('../models/InventoryIssue');
const StockTransfer = require('../models/StockTransfer');
const StockMovement = require('../models/StockMovement');
const { transporter } = require('../utils/emailService');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { logMovement } = require('./inventory.routes');
const {
  generateWaybillNumber,
  updateStockLevel,
  getStockAtLocation,
} = require('../utils/stockTransferHelpers');
const { buildApprovalChain } = require('../utils/approvalRuleHelper');

const REQUEST_TYPE_MAP = {
  'internal transfer': 'Internal Transfer',
  rfq: 'RFQ',
  'purchase request': 'Purchase Request',
  'emergency purchase': 'Emergency Purchase',
  'stock replenishment': 'Stock Replenishment',
  'service request': 'Service Request',
  'it equipment request': 'IT Equipment Request',
  'maintenance supplies': 'Maintenance Supplies',
  'office supplies': 'Office Supplies',
  'capital expenditure': 'Capital Expenditure',
  capex: 'Capital Expenditure',
};

const normalizeRequestType = (requestType) => {
  const rawValue = String(requestType || '').trim();
  const normalized = rawValue.toLowerCase();
  return REQUEST_TYPE_MAP[normalized] || rawValue || 'Purchase Request';
};

const DEFAULT_MATERIAL_REQUEST_TYPES = [
  'Internal Transfer',
  'RFQ',
  'Purchase Request',
  'Emergency Purchase',
  'Stock Replenishment',
  'Service Request',
  'IT Equipment Request',
  'Maintenance Supplies',
  'Office Supplies',
  'Capital Expenditure',
];

// Prevent duplicate generation when users double-click action buttons.
const rfqGenerationLocks = new Set();
const poGenerationLocks = new Set();

const getMaterialRequestTypes = async () => {
  const settings = await SystemSettings.findOne();
  const configured = Array.isArray(settings?.materialRequestTypes)
    ? settings.materialRequestTypes
    : [];
  return configured.length > 0 ? configured : DEFAULT_MATERIAL_REQUEST_TYPES;
};

const buildRfqPdfBuffer = async (request, vendors) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const chunks = [];

  return new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Request For Quotation (RFQ)', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#4b5563').text(`Request ID: ${request.requestId || request._id}`);
    doc.text(`Title: ${request.requestTitle || 'Material Request'}`);
    doc.text(`Type: ${request.requestType || 'N/A'}`);
    doc.text(`Department: ${request.department || 'N/A'}`);
    doc.text(`Requested By: ${request.requestedBy || 'N/A'}`);
    doc.text(`Date: ${new Date(request.createdAt || Date.now()).toLocaleString()}`);
    doc.moveDown(0.8);

    doc.fillColor('#111827').fontSize(13).text('Line Items');
    doc.moveDown(0.3);

    const lineItems = Array.isArray(request.lineItems) ? request.lineItems : [];
    let total = 0;
    lineItems.forEach((item, idx) => {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.amount) || 0;
      const lineTotal = qty * unitPrice;
      total += lineTotal;

      doc
        .fontSize(10)
        .text(
          `${idx + 1}. ${item.itemName || 'Item'} | Qty: ${qty} ${item.quantityType || ''} | Unit: ${unitPrice.toFixed(2)} | Total: ${lineTotal.toFixed(2)}`,
        );

      if (item.description) {
        doc.fillColor('#6b7280').fontSize(9).text(`    ${item.description}`);
        doc.fillColor('#111827');
      }
    });

    doc.moveDown(0.8);
    doc.fontSize(11).text(`Estimated Total: ${total.toFixed(2)} ${request.currency || 'NGN'}`);
    doc.moveDown(0.8);
    doc.fontSize(11).text('Vendors');
    vendors.forEach((v) => {
      doc.fontSize(10).text(`- ${v.companyName} (${v.email})`);
    });

    doc.end();
  });
};

const createPurchaseOrderFromRequest = async ({ request, vendor, actor }) => {
  const existingPo = await PurchaseOrder.findOne({ linkedMaterialRequestId: request._id });
  if (existingPo) {
    return { purchaseOrder: existingPo, created: false };
  }

  const totalAmount = (request.lineItems || []).reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.amount) || 0),
    0,
  );

  const poLineItems = (request.lineItems || []).map((item) => ({
    itemName: item.itemName,
    quantity: item.quantity,
    quantityType: item.quantityType,
    amount: item.amount || 0,
    description: item.description,
  }));

  const poApprovalInfo = await buildApprovalChain('Purchase Orders', {
    department: request.department,
    totalAmount,
    requestedBy: request.requestedBy,
    requestType: request.requestType,
  });

  const newPO = new PurchaseOrder({
    vendor: vendor || request.preferredVendor || 'TBD',
    status: 'draft',
    currency: request.currency || 'NGN',
    exchangeRateToNgn: request.exchangeRateToNgn || 1,
    totalAmount,
    totalAmountNgn: totalAmount * (request.exchangeRateToNgn || 1),
    linkedMaterialRequestId: request._id,
    requestBreakdown: {
      requestTitle: request.requestTitle || request.requestId || '',
      requestedBy: request.requestedBy || '',
      department: request.department || '',
      requestType: request.requestType || '',
    },
    lineItems: poLineItems,
    usesRuleBasedApproval: !!poApprovalInfo?.usesRuleBasedApproval,
    approvalRuleId: poApprovalInfo?.rule?._id,
    currentApprovalLevel: poApprovalInfo?.currentApprovalLevel || 1,
    approvalChain: Array.isArray(poApprovalInfo?.approvalChain)
      ? poApprovalInfo.approvalChain
      : [],
    activities: [
      {
        type: 'created',
        author: actor?.name || 'System',
        authorId: actor?.id,
        text: 'Purchase order generated from approved material request',
        timestamp: new Date(),
      },
    ],
  });

  await newPO.save();

  request.activities = Array.isArray(request.activities) ? request.activities : [];
  request.activities.push({
    type: 'po_created',
    author: actor?.name || 'System',
    authorId: actor?.id,
    text: `Purchase Order ${newPO.poNumber} created`,
    timestamp: new Date(),
    poId: newPO._id,
    poNumber: newPO.poNumber,
  });
  await request.save();

  return { purchaseOrder: newPO, created: true };
};

// ==========================================
// MATERIAL REQUESTS API
// ==========================================

// GET configurable material request types
router.get('/material-request-types', async (_req, res) => {
  try {
    const requestTypes = await getMaterialRequestTypes();
    return res.json({ success: true, data: requestTypes });
  } catch (err) {
    console.error('Error fetching material request types:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch request types' });
  }
});

// PUT configurable material request types (Admin only)
router.put('/material-request-types', authMiddleware, requireRole('Admin'), async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.requestTypes) ? req.body.requestTypes : [];
    const cleaned = [...new Set(incoming
      .map((value) => String(value || '').trim())
      .filter(Boolean))];

    if (cleaned.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one request type is required' });
    }

    const settings = (await SystemSettings.findOne()) || new SystemSettings();
    settings.materialRequestTypes = cleaned;
    await settings.save();

    return res.json({ success: true, data: settings.materialRequestTypes });
  } catch (err) {
    console.error('Error updating material request types:', err);
    return res.status(500).json({ success: false, message: 'Failed to update request types' });
  }
});

// GET all Material Requests (paginated, without attachments/comments)
router.get('/material-requests', authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 20, 10)));
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      MaterialRequest.find()
        .select('-attachments -comments -activities')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MaterialRequest.countDocuments(),
    ]);

    res.json({
      data: requests,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Error fetching material requests:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET single Material Request
router.get('/material-requests/:id', async (req, res) => {
  try {
    const request = await MaterialRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Not found' });
    res.json(request);
  } catch (_err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST new Material Request
router.post('/material-requests', async (req, res) => {
  try {
    // Generate request ID with format MR-MMDDYYYY-COUNT
    const count = await MaterialRequest.countDocuments();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const requestId = `MR-${month}${day}${year}-${String(count + 1).padStart(3, '0')}`;

    const payload = {
      ...req.body,
      requestId,
      requestType: normalizeRequestType(req.body?.requestType),
      date: req.body?.date || now.toISOString().split('T')[0],
    };

    const newRequest = new MaterialRequest(payload);

    // Ensure activity timeline starts with creation + initial comment.
    const requestAuthor = payload.requestedBy || 'Unknown User';
    newRequest.activities = Array.isArray(newRequest.activities) ? newRequest.activities : [];
    newRequest.comments = Array.isArray(newRequest.comments) ? newRequest.comments : [];

    newRequest.activities.push({
      type: 'created',
      author: requestAuthor,
      authorId: req.user?._id,
      text: `Request ${requestId} was created`,
      timestamp: new Date(),
    });

    if (payload.message && String(payload.message).trim()) {
      const cleanMessage = String(payload.message).trim();
      newRequest.comments.push({
        author: requestAuthor,
        authorId: req.user?._id,
        text: cleanMessage,
        timestamp: new Date(),
      });
      newRequest.activities.push({
        type: 'comment',
        author: requestAuthor,
        authorId: req.user?._id,
        text: cleanMessage,
        timestamp: new Date(),
      });
    }

    const savedRequest = await newRequest.save();
    res.status(201).json(savedRequest);
  } catch (err) {
    console.error('Error creating material request:', err);
    res.status(400).json({ success: false, message: 'Error creating request', error: err.message });
  }
});

// PUT update Material Request
router.put('/material-requests/:id', async (req, res) => {
  try {
    const updatePayload = {
      ...req.body,
      ...(req.body?.requestType
        ? { requestType: normalizeRequestType(req.body.requestType) }
        : {}),
    };

    const updatedRequest = await MaterialRequest.findByIdAndUpdate(
      req.params.id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    );
    if (!updatedRequest) return res.status(404).json({ success: false, message: 'Not found' });
    res.json(updatedRequest);
  } catch (err) {
    console.error('Error updating material request:', err);
    res.status(400).json({ success: false, message: 'Error updating request', error: err.message });
  }
});

// POST Approve Material Request -> Auto Generate Purchase Order OR Fulfill from Inventory
router.post('/material-requests/:id/approve', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid request id' });
    }
    
    // 1. Find and update the request
    const request = await MaterialRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    // Normalize legacy values like "rfq" before saving to enum-constrained schema.
    request.requestType = normalizeRequestType(request.requestType);
    
    if (request.status === 'approved' || request.status === 'fulfilled') {
        return res.status(400).json({ success: false, message: 'Already approved' });
    }

    const actorName =
      req.user?.fullName || (req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : null) || req.user?.email || req.body?.approver || 'Approver';
    const actorId = req.user?._id;

    request.activities = Array.isArray(request.activities) ? request.activities : [];

    // Multi-level approval progression: approve current step, move to next pending if any.
    if (Array.isArray(request.approvalChain) && request.approvalChain.length > 0) {
      let currentIdx = request.approvalChain.findIndex((s) => s.status === 'pending');
      if (currentIdx === -1) {
        currentIdx = request.approvalChain.findIndex((s) => s.status === 'awaiting');
        if (currentIdx >= 0) request.approvalChain[currentIdx].status = 'pending';
      }

      if (currentIdx >= 0) {
        const currentStep = request.approvalChain[currentIdx];
        currentStep.status = 'approved';
        currentStep.approvedAt = new Date();
        if (req.body?.comment) currentStep.comments = String(req.body.comment);

        request.activities.push({
          type: 'approval',
          author: actorName,
          authorId: actorId,
          text: `has approved level ${currentStep.level || currentIdx + 1}`,
          timestamp: new Date(),
          approvalLevel: currentStep.level || currentIdx + 1,
        });

        const nextIdx = request.approvalChain.findIndex(
          (s, idx) => idx > currentIdx && (s.status === 'awaiting' || s.status === 'pending'),
        );

        if (nextIdx >= 0) {
          const nextStep = request.approvalChain[nextIdx];
          nextStep.status = 'pending';
          request.currentApprovalLevel = nextStep.level || nextIdx + 1;
          request.approver = nextStep.approverName || request.approver;
          request.status = 'pending';
          request.activities.push({
            type: 'status_change',
            author: 'System',
            text: `Pending ${nextStep.approverName || 'next approver'} at level ${nextStep.level || nextIdx + 1}`,
            timestamp: new Date(),
            approvalLevel: nextStep.level || nextIdx + 1,
            pendingApprover: nextStep.approverName || '',
          });
          await request.save();
          return res.json({
            success: true,
            message: 'Approval recorded and moved to next approver',
            request,
            type: 'approval_progress',
          });
        }
      }
    }
    
    request.status = 'approved';
    request.activities.push({
      type: 'approval',
      author: actorName,
      authorId: actorId,
      text: 'has approved request',
      timestamp: new Date(),
    });
    const updatedRequest = await request.save();

    // 2. Check if this is an Internal Transfer - pull from inventory (location-aware)
    if (request.requestType === 'Internal Transfer') {
      const inventoryIssues = [];
      const insufficientItems = [];

      const srcLocId   = request.sourceLocationId;
      const srcLocName = request.sourceLocationName || 'Default Store';
      const dstLocId   = request.destinationLocationId;
      const dstLocName = request.destinationLocationName || 'Destination';

      // Pre-validate ALL items before touching anything
      for (const item of request.lineItems) {
        const inventoryItem = await InventoryItem.findOne({
          name: { $regex: new RegExp('^' + item.itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
          isDeleted: false,
        });
        if (!inventoryItem) {
          insufficientItems.push({ item: item.itemName, reason: 'Not found in inventory' });
        } else {
          const available = srcLocId
            ? getStockAtLocation(inventoryItem, srcLocId)
            : inventoryItem.quantity;
          if (available < item.quantity) {
            insufficientItems.push({
              item: item.itemName,
              reason: `Insufficient stock at ${srcLocName} (Available: ${available}, Requested: ${item.quantity})`,
            });
          }
        }
      }

      if (insufficientItems.length === 0) {
        const transferLineItems = [];

        for (const item of request.lineItems) {
          const inventoryItem = await InventoryItem.findOne({
            name: { $regex: new RegExp('^' + item.itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
            isDeleted: false,
          });
          if (!inventoryItem) throw new Error(`Item ${item.itemName} not found during approval`);

          const prevQty = inventoryItem.quantity;
          if (srcLocId) {
            updateStockLevel(inventoryItem, srcLocId, srcLocName, -item.quantity);
            if (dstLocId) updateStockLevel(inventoryItem, dstLocId, dstLocName, +item.quantity);
          } else {
            inventoryItem.quantity = Math.max(0, inventoryItem.quantity - item.quantity);
            inventoryItem.lastUpdated = new Date();
          }
          await inventoryItem.save();
          inventoryIssues.push({ item: item.itemName, quantityIssued: item.quantity, inventoryItemId: inventoryItem._id, unitPrice: inventoryItem.unitPrice || 0 });
          transferLineItems.push({
            inventoryItemId: inventoryItem._id,
            itemName: inventoryItem.name,
            itemCode: inventoryItem.itemId,
            unit: inventoryItem.unit || 'pcs',
            requestedQty: item.quantity,
            transferredQty: item.quantity,
          });
          await logMovement(inventoryItem._id, 'transfer', -item.quantity, prevQty, null,
            `Internal Transfer MR-${request.requestId}: ${srcLocName} → ${dstLocName}`);
        }

        // Auto-create a StockTransfer record + waybill
        let autoTransfer = null;
        let waybillUrl = null;
        try {
          const waybillNumber = await generateWaybillNumber();
          autoTransfer = await StockTransfer.create({
            fromLocationId: srcLocId || undefined,
            fromLocationName: srcLocName,
            toLocationId: dstLocId || undefined,
            toLocationName: dstLocName,
            requestedByName: request.requestedBy,
            status: 'completed',
            lineItems: transferLineItems,
            linkedMaterialRequestId: request._id,
            waybillNumber,
            waybillGeneratedAt: new Date(),
            completedAt: new Date(),
            notes: `Auto-created from MR ${request.requestId}`,
          });
          request.linkedStockTransferId = autoTransfer._id;
          waybillUrl = `/api/stock-transfers/${autoTransfer._id}/waybill`;
        } catch (wbErr) {
          console.error('Waybill record creation failed (non-critical):', wbErr.message);
        }

        // Auto-create an InventoryIssue
        try {
          const issueLineItems = inventoryIssues.map(issue => ({
            inventoryItemId: issue.inventoryItemId,
            itemName: issue.item,
            qty: issue.quantityIssued,
            unitPrice: issue.unitPrice,
            totalPrice: issue.quantityIssued * issue.unitPrice,
          }));

          await InventoryIssue.create({
            issuedTo: request.department || request.requestedBy,
            issuedToType: request.department ? 'department' : 'person',
            issuedBy: req.user?._id,
            issuedByName: req.user ? `${req.user.firstName} ${req.user.lastName}` : '',
            lineItems: issueLineItems,
            linkedMaterialRequestId: request._id,
            linkedStockTransferId: autoTransfer ? autoTransfer._id : null,
            notes: `Auto-issued from Material Request ${request.requestId}`,
          });
        } catch (issueErr) {
          console.error('InventoryIssue creation failed (non-critical):', issueErr.message);
        }

        request.status = 'fulfilled';
        request.activities.push({
          type: 'status_change',
          author: 'System',
          text: 'Request fulfilled from inventory',
          timestamp: new Date(),
        });
        await request.save();

        return res.json({
          success: true,
          message: 'Internal transfer approved and items issued from inventory',
          request, inventoryIssues, insufficientItems: [],
          type: 'internal_transfer',
          stockTransfer: autoTransfer,
          waybillUrl,
        });
      } else {
        request.status = 'approved';
        request.activities.push({
          type: 'status_change',
          author: 'System',
          text: 'Approved with partial fulfillment due to insufficient stock',
          timestamp: new Date(),
        });
        await request.save();
        return res.json({
          success: true,
          message: 'Partial fulfillment - some items unavailable',
          request, inventoryIssues, insufficientItems,
          type: 'internal_transfer',
        });
      }
    }

    return res.json({
      success: true,
      message: 'Request approved. You can now generate RFQ or create Purchase Order.',
      request: updatedRequest,
      type: 'approved',
    });
  } catch (err) {
    console.error('Error approving request:', err);
    res.status(500).json({ success: false, message: 'Error approving request', error: err.message });
  }
});

// POST Generate RFQ for approved request and send PDF to selected vendors
router.post('/material-requests/:id/generate-rfq', authMiddleware, async (req, res) => {
  const requestId = String(req.params.id || '').trim();
  if (rfqGenerationLocks.has(requestId)) {
    return res.status(409).json({
      success: false,
      message: 'RFQ generation already in progress for this request',
    });
  }

  rfqGenerationLocks.add(requestId);
  try {
    const { vendorIds = [] } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid request id' });
    }

    const request = await MaterialRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (!['approved', 'fulfilled'].includes(String(request.status || '').toLowerCase())) {
      return res.status(400).json({ success: false, message: 'RFQ can only be generated for approved requests' });
    }

    const ids = Array.isArray(vendorIds)
      ? vendorIds.filter((id) => mongoose.Types.ObjectId.isValid(id))
      : [];
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one vendor' });
    }

    const vendors = await Vendor.find({ _id: { $in: ids }, status: 'Active' });
    const recipients = vendors.filter((v) => String(v.email || '').trim());
    if (recipients.length === 0) {
      return res.status(400).json({ success: false, message: 'No active vendors with valid emails selected' });
    }

    const pdfBuffer = await buildRfqPdfBuffer(request, recipients);
    const actorName = req.user?.fullName || req.user?.email || 'System';

    const existingRfqs = await RFQ.find({ materialRequestId: request._id })
      .select('vendor.vendorId')
      .lean();
    const existingVendorIdSet = new Set(
      (existingRfqs || [])
        .map((rfq) => String(rfq?.vendor?.vendorId || ''))
        .filter(Boolean),
    );

    const recipientsToProcess = recipients.filter((vendor) => {
      const vendorObjectId = String(vendor?._id || '');
      return vendorObjectId && !existingVendorIdSet.has(vendorObjectId);
    });

    if (recipientsToProcess.length === 0) {
      return res.json({
        success: true,
        created: false,
        message: 'RFQ already exists for selected vendor(s)',
        request,
        results: [],
      });
    }

    const createdRfqs = [];
    for (const vendor of recipientsToProcess) {
      const vendorObjectId = String(vendor?._id || '');
      if (!vendorObjectId || existingVendorIdSet.has(vendorObjectId)) {
        continue;
      }

      const rfq = await RFQ.create({
        materialRequestId: request._id,
        requestType: 'store',
        vendor: {
          vendorId: vendor._id,
          vendorName: vendor.companyName || 'Vendor',
          vendorEmail: vendor.email || '',
          vendorPhone: vendor.phone || '',
        },
        requestedBy: {
          userId: String(req.user?._id || ''),
          userName: actorName,
          userEmail: req.user?.email || '',
        },
        department: request.department || '',
        currency: request.currency || 'NGN',
        exchangeRateToNgn: Number(request.exchangeRateToNgn) || 1,
        lineItems: (request.lineItems || []).map((item) => ({
          itemName: item.itemName,
          quantity: Number(item.quantity) || 0,
          quantityType: item.quantityType,
          estimatedAmount: Number(item.amount) || 0,
          description: item.description || '',
        })),
        totalEstimatedAmount: (request.lineItems || []).reduce(
          (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.amount) || 0),
          0,
        ),
        totalEstimatedAmountNgn: Number(request.totalAmountNgn) || 0,
        requiredByDate: request.requiredByDate || null,
        expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        status: 'sent',
        sentDate: new Date(),
        notes: request.message || '',
        activities: [
          {
            type: 'created',
            author: actorName,
            authorId: req.user?._id,
            description: `RFQ created from Material Request ${request.requestId || request._id}`,
          },
          {
            type: 'sent',
            author: actorName,
            authorId: req.user?._id,
            description: `RFQ sent to ${vendor.companyName || 'vendor'}`,
          },
        ],
      });

      createdRfqs.push({
        id: rfq._id,
        number: rfq.rfqNumber,
      });
      existingVendorIdSet.add(vendorObjectId);
    }

    const sendResults = [];
    for (const vendor of recipientsToProcess) {
      try {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: vendor.email,
          subject: `RFQ: ${request.requestTitle || request.requestId}`,
          html: `
            <p>Dear ${vendor.contactPerson || vendor.companyName},</p>
            <p>Please find attached Request for Quotation for material request <strong>${request.requestId}</strong>.</p>
            <p>Kindly review and send your quotation.</p>
          `,
          attachments: [
            {
              filename: `RFQ-${request.requestId || request._id}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ],
        };

        if (process.env.NODE_ENV !== 'production') {
          console.log(`📧 RFQ email would be sent to ${vendor.email}`);
          sendResults.push({ vendorId: vendor._id, email: vendor.email, success: true, devMode: true });
        } else {
          await transporter.sendMail(mailOptions);
          sendResults.push({ vendorId: vendor._id, email: vendor.email, success: true });
        }
      } catch (sendErr) {
        sendResults.push({ vendorId: vendor._id, email: vendor.email, success: false, error: sendErr.message });
      }
    }

    const successCount = sendResults.filter((r) => r.success).length;
    request.activities = Array.isArray(request.activities) ? request.activities : [];
    createdRfqs.forEach((rfq) => {
      request.activities.push({
        type: 'rfq_created',
        author: actorName,
        authorId: req.user?._id,
        text: `RFQ ${rfq.number} created`,
        timestamp: new Date(),
        rfqId: rfq.id,
        rfqNumber: rfq.number,
      });
    });
    request.activities.push({
      type: 'status_change',
      author: actorName,
      authorId: req.user?._id,
      text: `RFQ sent to ${successCount}/${recipientsToProcess.length} selected vendor(s)`,
      timestamp: new Date(),
    });
    await request.save();

    return res.json({
      success: true,
      created: true,
      message: `RFQ processed for ${successCount} vendor(s)`,
      request,
      results: sendResults,
    });
  } catch (err) {
    console.error('Error generating RFQ:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate RFQ', error: err.message });
  } finally {
    rfqGenerationLocks.delete(requestId);
  }
});

// POST Create Purchase Order from approved request
router.post('/material-requests/:id/create-po', authMiddleware, async (req, res) => {
  const requestId = String(req.params.id || '').trim();
  if (poGenerationLocks.has(requestId)) {
    return res.status(409).json({
      success: false,
      message: 'Purchase order generation already in progress for this request',
    });
  }

  poGenerationLocks.add(requestId);
  try {
    const { vendor } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid request id' });
    }

    const request = await MaterialRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    const normalizedStatus = String(request.status || '').toLowerCase();
    if (!['approved', 'fulfilled'].includes(normalizedStatus)) {
      return res.status(400).json({ success: false, message: 'Only approved requests can create a purchase order' });
    }

    if (request.requestType === 'Internal Transfer') {
      return res.status(400).json({ success: false, message: 'Internal Transfer requests do not create purchase orders' });
    }

    const actor = {
      name: req.user?.fullName || req.user?.email || 'System',
      id: req.user?._id,
    };

    const { purchaseOrder, created } = await createPurchaseOrderFromRequest({
      request,
      vendor,
      actor,
    });

    return res.json({
      success: true,
      created,
      message: created ? 'Purchase order created successfully' : 'Purchase order already exists',
      request,
      purchaseOrder,
      type: 'purchase_order',
    });
  } catch (err) {
    console.error('Error creating purchase order from request:', err);
    return res.status(500).json({ success: false, message: 'Failed to create purchase order', error: err.message });
  } finally {
    poGenerationLocks.delete(requestId);
  }
});

// POST Reject Material Request
router.post('/material-requests/:id/reject', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid request id' });
    }

    const { reason } = req.body || {};
    const request = await MaterialRequest.findById(req.params.id);
    
    if (!request) return res.status(404).json({ success: false, message: 'Not found' });
    request.requestType = normalizeRequestType(request.requestType);
    const rejectionText = reason || 'No reason provided';
    request.status = 'rejected';
    request.rejectionReason = rejectionText;

    if (Array.isArray(request.approvalChain) && request.approvalChain.length > 0) {
      const pendingIdx = request.approvalChain.findIndex((s) => s.status === 'pending');
      if (pendingIdx >= 0) {
        request.approvalChain[pendingIdx].status = 'rejected';
        request.approvalChain[pendingIdx].comments = rejectionText;
      }
    }

    request.activities = Array.isArray(request.activities) ? request.activities : [];
    request.activities.push({
      type: 'rejection',
      author: req.user?.fullName || (req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : null) || req.user?.email || 'Approver',
      authorId: req.user?._id,
      text: `has rejected request: ${rejectionText}`,
      timestamp: new Date(),
    });

    await request.save();
    res.json(request);
  } catch (err) {
    console.error('Error rejecting request:', err);
    res.status(500).json({ success: false, message: 'Error rejecting request', error: err.message });
  }
});

// ==========================================
// PURCHASE ORDERS API
// ==========================================

// GET Purchase Orders List (with filters and pagination)
router.get('/purchase-orders', async (req, res) => {
  try {
    const { page = 1, limit = 10, search, vendor, status, dateRange } = req.query;
    const query = {};

    // Apply search filter
    if (search) {
      query.$or = [
        { poNumber: { $regex: search, $options: 'i' } },
        { vendor: { $regex: search, $options: 'i' } }
      ];
    }

    // Apply exact match filters
    if (vendor) query.vendor = vendor;
    if (status && status !== 'all') query.status = status;

    if (dateRange && dateRange !== 'all') {
      const now = new Date();
      let startDate = null;

      if (dateRange === 'last7') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (dateRange === 'last30') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (dateRange === 'last90') {
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      } else if (dateRange === 'thisMonth') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      if (startDate) {
        query.$and = [
          ...(Array.isArray(query.$and) ? query.$and : []),
          {
            $or: [
              { orderDate: { $gte: startDate } },
              { createdAt: { $gte: startDate } },
            ],
          },
        ];
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      PurchaseOrder.find(query)
        .populate(
          'linkedMaterialRequestId',
          'currency requestTitle requestId reason requestedBy department requestType lineItems'
        )
        .sort({ orderDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      PurchaseOrder.countDocuments(query)
    ]);

    res.json({
        orders,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    console.error('Error fetching purchase orders:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET POs pending payment (for Finance module) - MUST be before /:id route
router.get('/purchase-orders/pending-payment', async (req, res) => {
  try {
    const orders = await PurchaseOrder.find({ 
      status: { $in: ['payment_pending', 'partly_paid'] },
    }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error('Error fetching pending payment orders:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// GET Single Purchase Order
router.get('/purchase-orders/:id', async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id)
        .populate('linkedMaterialRequestId');
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    res.json(order);
  } catch (_err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST Create Purchase Order
router.post('/purchase-orders', async (req, res) => {
  try {
    const newOrder = new PurchaseOrder(req.body);
    
    // Auto calculate total if not provided but lineItems exist
    if (!req.body.totalAmount && req.body.lineItems && req.body.lineItems.length > 0) {
        newOrder.totalAmount = req.body.lineItems.reduce(
          (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.amount) || 0),
          0,
        );
    }

    if (!req.body.currency) {
      newOrder.currency = 'NGN';
    }
    if (!req.body.exchangeRateToNgn) {
      newOrder.exchangeRateToNgn = 1;
    }
    if (!req.body.totalAmountNgn) {
      newOrder.totalAmountNgn = (Number(newOrder.totalAmount) || 0) * (Number(newOrder.exchangeRateToNgn) || 1);
    }
    
    const savedOrder = await newOrder.save();
    res.status(201).json(savedOrder);
  } catch (err) {
    console.error('Error creating purchase order:', err);
    res.status(400).json({ success: false, message: 'Error creating order', error: err.message });
  }
});

// POST Review and approve PO (Finance workflow) - Specific action route before generic update
router.post('/purchase-orders/:id/review', async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found' });
    }

    // Update PO with review changes
    if (req.body.lineItems) po.lineItems = req.body.lineItems;
    if (req.body.vendor) po.vendor = req.body.vendor;
    if (req.body.expectedDelivery) po.expectedDelivery = req.body.expectedDelivery;
    if (req.body.reviewNotes) po.reviewNotes = req.body.reviewNotes;
    
    // Calculate new total from line items
    if (po.lineItems && po.lineItems.length > 0) {
      po.totalAmount = po.lineItems.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.amount) || 0),
        0,
      );
      po.totalAmountNgn = (Number(po.totalAmount) || 0) * (Number(po.exchangeRateToNgn) || 1);
    }
    
    // Update status to reviewed (ready for payment)
    po.status = 'payment_pending';
    await po.save();

    res.json({ success: true, message: 'Purchase order reviewed and sent to finance', data: po });
  } catch (err) {
    console.error('Error reviewing purchase order:', err);
    res.status(500).json({ success: false, message: 'Failed to review purchase order', error: err.message });
  }
});

// POST Mark PO as paid - Specific action route
router.post('/purchase-orders/:id/mark-paid', async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id)
      .populate('linkedMaterialRequestId', 'budgetCode');

    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found' });
    }

    if (po.status === 'paid') {
      return res.json({
        success: true,
        message: 'Purchase order was already paid',
        data: po,
      });
    }

    if (po.status !== 'payment_pending') {
      return res.status(400).json({
        success: false,
        message: 'Only payment pending purchase orders can be marked as paid',
      });
    }

    po.status = 'paid';
    po.paidDate = new Date();
    await po.save();

    let budgetUpdate = null;
    const budgetCode = String(po?.linkedMaterialRequestId?.budgetCode || '').trim();

    if (budgetCode) {
      let updatedBudget = null;
      const spendAmount = Number(po.totalAmount) || 0;

      if (spendAmount > 0) {
        if (mongoose.Types.ObjectId.isValid(budgetCode)) {
          updatedBudget = await BudgetCategory.findByIdAndUpdate(
            budgetCode,
            { $inc: { spent: spendAmount } },
            { new: true },
          );
        }

        if (!updatedBudget) {
          const escapedBudgetCode = budgetCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          updatedBudget = await BudgetCategory.findOneAndUpdate(
            { name: { $regex: `^${escapedBudgetCode}$`, $options: 'i' } },
            { $inc: { spent: spendAmount } },
            { new: true },
          );
        }

        budgetUpdate = {
          budgetCode,
          amount: spendAmount,
          updated: Boolean(updatedBudget),
        };
      }
    }

    res.json({ success: true, message: 'Payment recorded', data: po, budgetUpdate });
  } catch (err) {
    console.error('Error marking PO as paid:', err);
    res.status(500).json({ success: false, message: 'Failed to update payment status', error: err.message });
  }
});

// POST Lock/Unlock Purchase Order
router.post('/purchase-orders/:id/lock', async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found' });
    }

    const shouldLock = req.body?.locked !== false;
    po.activities = Array.isArray(po.activities) ? po.activities : [];
    const actorName = req.user?.fullName || req.user?.email || 'System';
    const actorId = req.user?._id;

    if (shouldLock) {
      po.isLocked = true;
      po.lockedAt = new Date();
      po.lockedBy = { userId: String(actorId || ''), name: actorName };

      const hasApprovalChain = Array.isArray(po.approvalChain) && po.approvalChain.length > 0;
      if (hasApprovalChain) {
        const allApproved = po.approvalChain.every((step) => step.status === 'approved');
        const hasPending = po.approvalChain.some((step) => step.status === 'pending');
        if (!allApproved && !hasPending) {
          const firstAwaiting = po.approvalChain.find((step) => step.status === 'awaiting');
          if (firstAwaiting) {
            firstAwaiting.status = 'pending';
            po.currentApprovalLevel = firstAwaiting.level || 1;
          }
        }
        po.status = allApproved ? 'payment_pending' : 'issued';
      } else {
        po.status = 'payment_pending';
      }

      po.activities.push({
        type: 'lock',
        author: actorName,
        authorId: actorId,
        text: 'Purchase order locked for approvals/payment',
        timestamp: new Date(),
      });
    } else {
      po.isLocked = false;
      po.lockedAt = null;
      po.lockedBy = { userId: '', name: '' };

      if (Array.isArray(po.approvalChain) && po.approvalChain.length > 0) {
        po.approvalChain = po.approvalChain.map((step, idx) => ({
          ...step,
          status: idx === 0 ? 'pending' : 'awaiting',
          approvedAt: undefined,
          comments: '',
        }));
        po.currentApprovalLevel = 1;
      }

      if (po.status !== 'paid') {
        po.status = 'draft';
      }

      po.activities.push({
        type: 'unlock',
        author: actorName,
        authorId: actorId,
        text: 'Purchase order unlocked for editing',
        timestamp: new Date(),
      });
    }

    await po.save();
    return res.json({ success: true, data: po });
  } catch (err) {
    console.error('Error locking/unlocking purchase order:', err);
    return res.status(500).json({ success: false, message: 'Failed to update lock state', error: err.message });
  }
});

// POST Approve/Reject Purchase Order step
router.post('/purchase-orders/:id/approve', async (req, res) => {
  try {
    const { approved = true, comment = '' } = req.body || {};
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase order not found' });
    }

    po.activities = Array.isArray(po.activities) ? po.activities : [];
    const actorName = req.user?.fullName || req.user?.email || 'Approver';
    const actorId = req.user?._id;

    if (!Array.isArray(po.approvalChain) || po.approvalChain.length === 0) {
      po.status = approved ? 'approved' : 'cancelled';
      po.activities.push({
        type: approved ? 'approval' : 'rejection',
        author: actorName,
        authorId: actorId,
        text: approved
          ? 'Purchase order approved. Lock to move it to Accounts Payable.'
          : `Purchase order rejected${comment ? `: ${comment}` : ''}`,
        timestamp: new Date(),
      });
      await po.save();
      return res.json({ success: true, data: po });
    }

    let currentIdx = po.approvalChain.findIndex((step) => step.status === 'pending');
    if (currentIdx === -1) {
      currentIdx = po.approvalChain.findIndex((step) => step.status === 'awaiting');
      if (currentIdx >= 0) {
        po.approvalChain[currentIdx].status = 'pending';
      }
    }

    if (currentIdx === -1) {
      return res.status(400).json({ success: false, message: 'No pending approval step found' });
    }

    const currentStep = po.approvalChain[currentIdx];

    if (approved) {
      currentStep.status = 'approved';
      currentStep.approvedAt = new Date();
      currentStep.comments = comment || currentStep.comments;

      const nextIdx = po.approvalChain.findIndex(
        (step, idx) => idx > currentIdx && (step.status === 'awaiting' || step.status === 'pending'),
      );

      if (nextIdx >= 0) {
        po.approvalChain[nextIdx].status = 'pending';
        po.currentApprovalLevel = po.approvalChain[nextIdx].level || nextIdx + 1;
        po.status = 'issued';
        po.activities.push({
          type: 'approval',
          author: actorName,
          authorId: actorId,
          text: `Approval granted at level ${currentStep.level || currentIdx + 1}. Next approver notified.`,
          timestamp: new Date(),
        });
      } else {
        po.status = 'approved';
        po.activities.push({
          type: 'approval',
          author: actorName,
          authorId: actorId,
          text: 'Final approval complete. Lock purchase order to move it to Accounts Payable.',
          timestamp: new Date(),
        });
      }
    } else {
      currentStep.status = 'rejected';
      currentStep.approvedAt = new Date();
      currentStep.comments = comment || 'Rejected';
      po.status = 'cancelled';
      po.isLocked = false;
      po.activities.push({
        type: 'rejection',
        author: actorName,
        authorId: actorId,
        text: `Purchase order rejected${comment ? `: ${comment}` : ''}`,
        timestamp: new Date(),
      });
    }

    await po.save();
    return res.json({ success: true, data: po });
  } catch (err) {
    console.error('Error processing purchase order approval:', err);
    return res.status(500).json({ success: false, message: 'Failed to process approval', error: err.message });
  }
});

// PUT Update Purchase Order
router.put('/purchase-orders/:id', async (req, res) => {
  try {
    // If updating line items, might need to recalculate total
    const updates = { ...req.body };
    const shouldAddActivityComment = Boolean(updates.addActivityComment);
    const activityComment = String(updates.comment || '').trim();

    delete updates.addActivityComment;
    delete updates.comment;

    const existingOrder = await PurchaseOrder.findById(req.params.id);
    if (!existingOrder) return res.status(404).json({ success: false, message: 'Not found' });

    if (existingOrder.isLocked) {
      const lockProtectedFields = ['vendor', 'lineItems', 'expectedDelivery', 'notes', 'currency', 'exchangeRateToNgn', 'totalAmount'];
      const attemptingProtectedEdit = lockProtectedFields.some((field) => Object.prototype.hasOwnProperty.call(updates, field));
      if (attemptingProtectedEdit) {
        return res.status(400).json({ success: false, message: 'Purchase order is locked. Unlock before editing.' });
      }
    }

    if (updates.lineItems && !updates.totalAmount) {
        updates.totalAmount = updates.lineItems.reduce(
          (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.amount) || 0),
          0,
        );
    }

    if (updates.totalAmount !== undefined && updates.totalAmountNgn === undefined) {
      const exchangeRate =
        updates.exchangeRateToNgn !== undefined
          ? Number(updates.exchangeRateToNgn) || 1
          : Number(existingOrder.exchangeRateToNgn) || 1;
      updates.totalAmountNgn = (Number(updates.totalAmount) || 0) * exchangeRate;
    }

    if (shouldAddActivityComment && activityComment) {
      const nextActivities = Array.isArray(existingOrder.activities)
        ? [...existingOrder.activities]
        : [];
      nextActivities.push({
        type: 'comment',
        author: req.user?.fullName || req.user?.email || 'User',
        authorId: req.user?._id,
        text: activityComment,
        timestamp: new Date(),
      });
      updates.activities = nextActivities;
    }

    const updatedOrder = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updatedOrder) return res.status(404).json({ success: false, message: 'Not found' });
    res.json(updatedOrder);
  } catch (err) {
    console.error('Error updating purchase order:', err);
    res.status(400).json({ success: false, message: 'Error updating order', error: err.message });
  }
});

// DELETE Purchase Order
router.delete('/purchase-orders/:id', async (req, res) => {
  try {
    const deletedOrder = await PurchaseOrder.findByIdAndDelete(req.params.id);
    if (!deletedOrder) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Purchase order deleted successfully' });
  } catch (err) {
    console.error('Error deleting purchase order:', err);
    res.status(500).json({ success: false, message: 'Error deleting order' });
  }
});

module.exports = router;
