/**
 * Material Request Workflow Helper
 * Handles the complete workflow: Material Request -> RFQ -> PO -> Payment -> Receiving
 */

const MaterialRequestModel = require('../models/MaterialRequest');
const RFQModel = require('../models/RFQ');
const PurchaseOrderModel = require('../models/PurchaseOrder');
const PaymentModel = require('../models/Payment');
const POReceiptModel = require('../models/POReceipt');
const InventoryItemModel = require('../models/InventoryItem');
const VendorModel = require('../models/Vendor');
const AuditLogModel = require('../models/AuditLog');
const NotificationModel = require('../models/Notification');

const createWorkflowNotification = async ({ title, message, sourceKey, category, metadata = {}, targetUser = null, type = 'info' }) => {
  try {
    const existing = await NotificationModel.findOne({ sourceKey });
    if (existing) return existing;

    return NotificationModel.create({
      title,
      message,
      type,
      category,
      source: 'material-request-workflow',
      sourceKey,
      metadata,
      targetUser,
    });
  } catch (error) {
    console.error('Error creating workflow notification:', error);
    return null;
  }
};

/**
 * Generate RFQ from Material Request
 */
const generateRFQFromMaterialRequest = async (materialRequestId, vendorId, requestedByUser) => {
  try {
    const materialRequest = await MaterialRequestModel.findById(materialRequestId);
    if (!materialRequest) {
      throw new Error('Material Request not found');
    }

    if (materialRequest.requestType !== 'store' && materialRequest.requestType !== 'Purchase Request') {
      throw new Error('RFQ can only be generated for store/purchase requests');
    }

    if (materialRequest.status !== 'approved') {
      throw new Error('Material Request must be approved before generating RFQ');
    }

    // Fetch vendor details
    const vendor = await VendorModel.findById(vendorId);
    if (!vendor) {
      throw new Error('Vendor not found');
    }

    // Create RFQ
    const rfq = new RFQModel({
      materialRequestId,
      requestType: 'store',
      vendor: {
        vendorId: vendor._id,
        vendorName: vendor.name,
        vendorEmail: vendor.email,
        vendorPhone: vendor.phone,
      },
      requestedBy: {
        userId: requestedByUser.userId,
        userName: requestedByUser.userName,
        userEmail: requestedByUser.userEmail,
      },
      department: materialRequest.department,
      currency: materialRequest.currency,
      exchangeRateToNgn: materialRequest.exchangeRateToNgn,
      lineItems: materialRequest.lineItems.map((item) => ({
        itemName: item.itemName,
        quantity: item.quantity,
        quantityType: item.quantityType,
        estimatedAmount: item.amount,
        description: item.description,
      })),
      totalEstimatedAmount: materialRequest.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0),
      totalEstimatedAmountNgn: materialRequest.totalAmountNgn,
      requiredByDate: materialRequest.requiredByDate,
      expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      activities: [
        {
          type: 'created',
          author: requestedByUser.userName,
          authorId: requestedByUser.userId,
          description: `RFQ created from Material Request ${materialRequest.requestId}`,
        },
      ],
    });

    await rfq.save();

    // Update Material Request with RFQ reference
    await MaterialRequestModel.findByIdAndUpdate(materialRequestId, {
      $set: {
        status: 'fulfilled',
        linkedRFQId: rfq._id,
        activities: [
        ...(materialRequest.activities || []),
        {
          type: 'status_change',
          author: requestedByUser.userName,
          authorId: requestedByUser.userId,
          text: 'Material Request fulfilled - RFQ generated',
          poId: null,
          rfqId: rfq._id,
          rfqNumber: rfq.rfqNumber,
        },
        ],
      },
      $addToSet: { linkedRFQIds: rfq._id },
    });

    await createWorkflowNotification({
      title: `RFQ created: ${rfq.rfqNumber}`,
      message: `RFQ was generated for material request ${materialRequest.requestId}.`,
      sourceKey: `workflow-rfq-created-${rfq._id}`,
      category: 'procurement',
      metadata: {
        materialRequestId: materialRequest._id,
        rfqId: rfq._id,
        rfqNumber: rfq.rfqNumber,
        vendorId: vendor._id,
      },
    });

    return rfq;
  } catch (error) {
    throw new Error(`Failed to generate RFQ: ${error.message}`);
  }
};

/**
 * Accept Quotation and Generate PO
 */
const generatePOFromRFQ = async (rfqId, quotationIndex, createdByUser) => {
  try {
    const rfq = await RFQModel.findById(rfqId);
    if (!rfq) {
      throw new Error('RFQ not found');
    }

    if (!rfq.quotations[quotationIndex]) {
      throw new Error('Quotation index not found');
    }

    const quotation = rfq.quotations[quotationIndex];
    if (quotation.status !== 'received') {
      throw new Error('Quotation must be received before generating PO');
    }

    // Create Purchase Order
    const po = new PurchaseOrderModel({
      vendor: rfq.vendor.vendorName,
      orderDate: new Date(),
      currency: rfq.currency,
      exchangeRateToNgn: rfq.exchangeRateToNgn,
      totalAmount: quotation.quotedAmount,
      totalAmountNgn: quotation.quotedAmountNgn,
      status: 'pending',
      expectedDelivery: rfq.requiredByDate,
      linkedMaterialRequestId: rfq.materialRequestId,
      notes: quotation.notes,
      lineItems: rfq.lineItems.map((item) => ({
        itemName: item.itemName,
        quantity: item.quantity,
        quantityType: item.quantityType,
        amount: quotation.quotedAmount / (rfq.lineItems.length || 1), // Distribute amount evenly
        description: item.description,
      })),
      requestBreakdown: {
        requestTitle: '', // Will be fetched from material request
        requestedBy: rfq.requestedBy.userName,
        department: rfq.department,
        requestType: rfq.requestType,
      },
      activities: [
        {
          type: 'created',
          author: createdByUser.userName,
          authorId: createdByUser.userId,
          text: `PO created from RFQ ${rfq.rfqNumber}`,
        },
      ],
    });

    await po.save();

    // Update RFQ status
    rfq.status = 'po_generated';
    rfq.bestQuotationIndex = quotationIndex;
    rfq.linkedPOId = po._id;
    po.linkedRFQId = rfq._id;
    rfq.quotations[quotationIndex].status = 'accepted';
    rfq.activities.push({
      type: 'po_generated',
      author: createdByUser.userName,
      authorId: createdByUser.userId,
      description: `PO ${po.poNumber} created from this RFQ`,
    });
    await rfq.save();

    await MaterialRequestModel.findByIdAndUpdate(rfq.materialRequestId, {
      $set: { linkedPurchaseOrderId: po._id },
      $addToSet: { linkedPurchaseOrderIds: po._id },
    });

    await createWorkflowNotification({
      title: `Purchase Order created: ${po.poNumber}`,
      message: `PO was created from RFQ ${rfq.rfqNumber}.`,
      sourceKey: `workflow-po-created-${po._id}`,
      category: 'procurement',
      metadata: {
        materialRequestId: rfq.materialRequestId,
        rfqId: rfq._id,
        poId: po._id,
        poNumber: po.poNumber,
      },
      type: 'success',
    });

    return po;
  } catch (error) {
    throw new Error(`Failed to generate PO: ${error.message}`);
  }
};

/**
 * Record Payment for PO
 */
const recordPaymentForPO = async (poId, paymentAmount, paymentType, paidByUser, paymentMethod = 'bank_transfer') => {
  try {
    const po = await PurchaseOrderModel.findById(poId);
    if (!po) {
      throw new Error('Purchase Order not found');
    }

    // Check if payment amount is valid
    const remainingAmount = po.totalAmountNgn - po.paidAmount;
    if (paymentAmount > remainingAmount) {
      throw new Error(`Payment amount exceeds remaining balance. Remaining: ${remainingAmount}`);
    }

    // Create payment record
    const payment = new PaymentModel({
      poId,
      poNumber: po.poNumber,
      vendor: {
        vendorId: po.vendor, // This should be vendor ID if model updated
        vendorName: po.vendor,
      },
      amount: paymentAmount,
      amountNgn: paymentAmount,
      percentage: (paymentAmount / po.totalAmountNgn) * 100,
      paymentType,
      paymentMethod,
      status: 'pending',
      paymentDate: new Date(),
      paidBy: {
        userId: paidByUser.userId,
        userName: paidByUser.userName,
        userEmail: paidByUser.userEmail,
        userDepartment: paidByUser.department,
      },
      activities: [
        {
          type: 'created',
          author: paidByUser.userName,
          authorId: paidByUser.userId,
          description: `Payment of ${paymentAmount} NGN initiated`,
        },
      ],
    });

    await payment.save();

    // Update PO payment tracking
    po.paymentHistory.push({
      amount: paymentAmount,
      percentage: (paymentAmount / po.totalAmountNgn) * 100,
      paidAt: new Date(),
      paidBy: paidByUser.userName,
    });

    po.paidAmount += paymentAmount;
    po.paidPercentage = (po.paidAmount / po.totalAmountNgn) * 100;

    // Update PO status based on payment
    if (po.paidAmount >= po.totalAmountNgn) {
      po.status = 'paid';
      po.fullyPaidAt = new Date();
    } else if (po.paidAmount > 0) {
      po.status = 'partly_paid';
      if (!po.firstPartiallyPaidAt) {
        po.firstPartiallyPaidAt = new Date();
      }
    } else {
      po.status = 'payment_pending';
    }

    po.activities.push({
      type: 'status_change',
      author: paidByUser.userName,
      authorId: paidByUser.userId,
      text: `Payment of ${paymentAmount} NGN recorded`,
    });

    await po.save();

    await createWorkflowNotification({
      title: `Payment recorded: ${payment.paymentNumber}`,
      message: `Payment of ${paymentAmount} was recorded for PO ${po.poNumber}.`,
      sourceKey: `workflow-payment-recorded-${payment._id}`,
      category: 'finance',
      metadata: {
        poId: po._id,
        poNumber: po.poNumber,
        paymentId: payment._id,
        paymentNumber: payment.paymentNumber,
        amount: paymentAmount,
      },
      type: 'success',
    });

    return {
      payment,
      updatedPO: po,
      remainingBalance: po.totalAmountNgn - po.paidAmount,
    };
  } catch (error) {
    throw new Error(`Failed to record payment: ${error.message}`);
  }
};

/**
 * Receive items into inventory from PO
 */
const receiveItemsFromPO = async (poId, receivedItems, storeLocation, receivedByUser, qualityInspection = {}) => {
  try {
    const po = await PurchaseOrderModel.findById(poId);
    if (!po) {
      throw new Error('Purchase Order not found');
    }

    if (po.status === 'draft' || po.status === 'pending' || po.status === 'payment_pending') {
      throw new Error('Purchase Order must be approved and payment received before receiving items');
    }

    if (po.paidAmount <= 0 && po.status !== 'partly_paid') {
      throw new Error('Payment must be made before receiving items. At least partial payment required.');
    }

    // Create PO Receipt
    const receipt = new POReceiptModel({
      poId,
      poNumber: po.poNumber,
      vendor: {
        vendorName: po.vendor,
      },
      receivedBy: {
        userId: receivedByUser.userId,
        userName: receivedByUser.userName,
        userEmail: receivedByUser.userEmail,
        department: receivedByUser.department,
      },
      deliveryDate: new Date(),
      storeLocation,
      receivedItems,
      status: 'received',
      qualityInspection,
      activities: [
        {
          type: 'received',
          author: receivedByUser.userName,
          authorId: receivedByUser.userId,
          description: 'Items received at warehouse',
        },
      ],
    });

    if (qualityInspection && qualityInspection.passed) {
      receipt.status = 'inspected';
      receipt.qualityInspection.status = qualityInspection.status || 'accepted';
      receipt.activities.push({
        type: 'inspected',
        author: receivedByUser.userName,
        authorId: receivedByUser.userId,
        description: 'Quality inspection passed',
      });
    }

    await receipt.save();

    // Update inventory for received items
    for (const item of receivedItems) {
      // Find or create inventory item
      let inventoryItem = await InventoryItemModel.findOne({
        itemName: item.itemName,
        storeLocation: storeLocation.locationName,
      });

      if (!inventoryItem) {
        inventoryItem = new InventoryItemModel({
          itemName: item.itemName,
          storeLocation: storeLocation.locationName,
          currentStock: item.quantityReceived,
          quantityType: item.quantityType,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          unitPrice: item.unitPrice,
          DateReceived: new Date(),
          poNumber: po.poNumber,
          poReceiptId: receipt._id,
          receivedBy: receivedByUser.userName,
        });
      } else {
        inventoryItem.currentStock += item.quantityReceived;
        if (item.batchNumber) {
          inventoryItem.batchNumber = item.batchNumber;
        }
        if (item.expiryDate) {
          inventoryItem.expiryDate = item.expiryDate;
        }
      }

      await inventoryItem.save();
    }

    // Update PO status
    po.status = 'received';
    po.activities.push({
      type: 'status_change',
      author: receivedByUser.userName,
      authorId: receivedByUser.userId,
      text: `Items received into inventory - Receipt #${receipt.receiptNumber}`,
    });
    await po.save();

    // Mark inventory as updated
    receipt.inventoryUpdated = true;
    receipt.inventoryUpdateDate = new Date();
    await receipt.save();

    await createWorkflowNotification({
      title: `Items received: ${receipt.receiptNumber}`,
      message: `Inventory was updated for PO ${po.poNumber}.`,
      sourceKey: `workflow-receipt-created-${receipt._id}`,
      category: 'inventory',
      metadata: {
        poId: po._id,
        poNumber: po.poNumber,
        receiptId: receipt._id,
        receiptNumber: receipt.receiptNumber,
      },
      type: 'success',
    });

    return {
      receipt,
      updatedPO: po,
      itemsAdded: receivedItems.length,
    };
  } catch (error) {
    throw new Error(`Failed to receive items: ${error.message}`);
  }
};

module.exports = {
  generateRFQFromMaterialRequest,
  generatePOFromRFQ,
  recordPaymentForPO,
  receiveItemsFromPO,
};
