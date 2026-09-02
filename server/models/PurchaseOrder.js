const mongoose = require('mongoose');

const poLineItemSchema = new mongoose.Schema({
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true },
  quantityType: { type: String, required: true },
  amount: { type: Number, required: true },
  description: { type: String }
});

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNumber: {
      type: String,
      required: true,
      unique: true,
    },
    vendor: {
      type: String,
      required: true,
    },
    billTo: {
      type: String,
      default: '',
      trim: true,
    },
    apInvoiceNumber: {
      type: String,
      default: null,
      trim: true,
    },
    apTaxRate: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    apTaxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: [
        'draft',
        'pending',
        'issued',
        'approved',
        'payment_pending',
        'partly_paid',
        'paid',
        'received',
        'closed',
        'cancelled',
      ],
      default: 'draft',
    },
    currency: {
      type: String,
      default: 'NGN',
    },
    exchangeRateToNgn: {
      type: Number,
      default: 1,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    paidPercentage: {
      type: Number,
      default: 0,
    },
    paidDate: {
      type: Date,
      default: null,
    },
    firstPartiallyPaidAt: {
      type: Date,
      default: null,
    },
    fullyPaidAt: {
      type: Date,
      default: null,
    },
    paymentHistory: [
      {
        amount: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 },
        paidAt: { type: Date, default: Date.now },
        paidBy: { type: String, default: '' },
      },
    ],
    totalAmountNgn: {
      type: Number,
      default: 0,
    },
    expectedDelivery: {
      type: Date,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockedBy: {
      userId: { type: String, default: '' },
      name: { type: String, default: '' },
    },
    notes: {
      type: String,
    },
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
    approvalChain: [
      {
        level: Number,
        approverRole: String,
        approverId: String,
        approverName: String,
        approverEmail: String,
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected', 'awaiting'],
          default: 'awaiting',
        },
        approvedAt: Date,
        comments: String,
      },
    ],
    activities: [
      {
        type: {
          type: String,
          enum: [
            'created',
            'lock',
            'unlock',
            'approval',
            'rejection',
            'status_change',
            'comment',
          ],
          default: 'comment',
        },
        author: { type: String, required: true },
        authorId: { type: String },
        text: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    linkedMaterialRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialRequest',
    },
    linkedRFQId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RFQ',
      default: null,
    },
    requestBreakdown: {
      requestTitle: { type: String, default: '', trim: true },
      requestedBy: { type: String, default: '', trim: true },
      department: { type: String, default: '', trim: true },
      requestType: { type: String, default: '', trim: true },
    },
    lineItems: [poLineItemSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Auto-generate PO Number if not provided
purchaseOrderSchema.pre('validate', async function (next) {
  if (!this.poNumber) {
    // Generate a secure sequence
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const yearMonth = new Date().toISOString().slice(2, 7).replace('-', '');
    this.poNumber = `PO-${yearMonth}-${randomSuffix}`;

    // Loop until unique
    let attempt = 0;
    while (attempt < 5) {
      const exists = await mongoose.models.PurchaseOrder.findOne({ poNumber: this.poNumber });
      if (!exists) break;
      this.poNumber = `PO-${yearMonth}-${Math.floor(1000 + Math.random() * 9000)}`;
      attempt++;
    }
  }
  next();
});

// Virtual ID to match frontend formatting
purchaseOrderSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
