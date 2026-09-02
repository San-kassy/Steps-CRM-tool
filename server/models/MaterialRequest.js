const mongoose = require('mongoose');

const materialRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
    },
    requestTitle: { 
      type: String 
    },
    requestType: {
      type: String,
      required: false,
      default: 'Purchase Request',
    },
    approver: {
      type: String,
      required: false, // Made optional for rule-based approval
    },
    department: {
      type: String,
      required: false,
    },
    // Multi-level approval fields
    usesRuleBasedApproval: {
      type: Boolean,
      default: false,
    },
    approvalRuleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApprovalRule',
    },
    currentApprovalLevel: {
      type: Number,
      default: 1,
    },
    approvalChain: [{
      level: Number,
      approverRole: String,
      approverId: String,
      approverName: String,
      approverEmail: String,
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'awaiting'],
        default: 'awaiting'
      },
      approvedAt: Date,
      comments: String
    }],
    requestedBy: {
      type: String,
      required: true,
    },
    requiredByDate: { 
      type: Date 
    },
    budgetCode: { 
      type: String 
    },
    reason: { 
      type: String 
    },
    // Location fields for Internal Transfer requests
    sourceLocationId:     { type: mongoose.Schema.Types.ObjectId, ref: 'StoreLocation', default: null },
    sourceLocationName:   { type: String, default: '' },
    destinationLocationId:   { type: mongoose.Schema.Types.ObjectId, ref: 'StoreLocation', default: null },
    destinationLocationName: { type: String, default: '' },
    /** Populated after approval of an Internal Transfer — links to the generated StockTransfer */
    linkedStockTransferId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockTransfer', default: null },
    linkedRFQId: { type: mongoose.Schema.Types.ObjectId, ref: 'RFQ', default: null },
    linkedRFQIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RFQ' }],
    linkedPurchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    linkedPurchaseOrderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' }],
    preferredVendor: { type: String },
    currency: {
      type: String,
      default: 'NGN',
    },
    exchangeRateToNgn: {
      type: Number,
      default: 1,
    },
    totalAmountNgn: {
      type: Number,
      default: 0,
    },
    date: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected', 'fulfilled'],
      default: 'pending',
    },
    rejectionReason: { 
      type: String 
    },
    lineItems: [
      {
        itemName: String,
        quantity: Number,
        quantityType: String,
        amount: Number,
        amountNgn: Number,
        lineTotalNgn: Number,
        description: String,
      },
    ],
    attachments: [{
      fileName: String,
      fileData: String,
      fileType: String,
      fileSize: Number,
    }],
    message: {
      type: String,
      default: '',
    },
    comments: [{
      author: { type: String, required: true },
      authorId: { type: String },
      text: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      mentions: [String],
    }],
    activities: [{
      type: {
        type: String,
        enum: [
          'comment',
          'status_change',
          'approval',
          'rejection',
          'created',
          'po_created',
          'rfq_created',
        ],
        default: 'comment'
      },
      author: { type: String, required: true },
      authorId: { type: String },
      text: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      poId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
      poNumber: { type: String },
      rfqId: { type: mongoose.Schema.Types.ObjectId, ref: 'RFQ' },
      rfqNumber: { type: String },
      approvalLevel: { type: Number },
      pendingApprover: { type: String },
    }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for ID mapped to _id
materialRequestSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

module.exports = mongoose.model('MaterialRequest', materialRequestSchema);
