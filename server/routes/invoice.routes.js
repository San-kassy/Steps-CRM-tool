/* eslint-disable */
const express = require('express');
const router  = express.Router();
const Invoice  = require('../models/Invoice');
const InventoryIssue = require('../models/InventoryIssue');
const NotificationModel = require('../models/Notification');
const { authMiddleware } = require('../middleware/auth');

const createInvoiceNotification = async ({ title, message, sourceKey, metadata = {} }) => {
  try {
    const existing = await NotificationModel.findOne({ sourceKey });
    if (existing) return existing;

    return NotificationModel.create({
      title,
      message,
      type: 'success',
      category: 'finance',
      source: 'invoice-module',
      sourceKey,
      metadata,
    });
  } catch (error) {
    console.error('Error creating invoice notification:', error);
    return null;
  }
};

// ── GET all invoices ────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { billTo:        { $regex: search, $options: 'i' } },
      ];
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum)
        .populate('linkedIssueId', 'issueNumber'),
      Invoice.countDocuments(query),
    ]);

    res.json({ invoices, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    console.error('Error fetching invoices:', err);
    res.status(500).json({ message: 'Failed to fetch invoices' });
  }
});

// ── GET single invoice ──────────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('linkedIssueId', 'issueNumber issuedTo')
      .populate('generatedBy', 'firstName lastName');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch invoice' });
  }
});

// ── PATCH update invoice status ─────────────────────────────────────────────
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['draft', 'sent', 'paid', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ message: `Invalid status. Must be one of: ${valid.join(', ')}` });

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    if (invoice.status === 'paid') return res.status(400).json({ message: 'Cannot change status of a paid invoice' });

    invoice.status = status;
    if (status === 'paid') invoice.paidAt = new Date();
    await invoice.save();

    if (status === 'paid') {
      await createInvoiceNotification({
        title: `Invoice paid: ${invoice.invoiceNumber}`,
        message: `Invoice ${invoice.invoiceNumber} for ${invoice.billTo} has been marked as paid.`,
        sourceKey: `invoice-paid-${invoice._id}`,
        metadata: {
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          billTo: invoice.billTo,
          totalAmount: invoice.totalAmount,
        },
      });
    }

    res.json({ message: `Invoice marked as ${status}`, data: invoice });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update invoice status' });
  }
});

// ── GET printable invoice HTML ──────────────────────────────────────────────
router.get('/:id/print', authMiddleware, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const companyName = 'Steps CRM';
    const rows = invoice.lineItems.map(li => `
      <tr>
        <td>${li.description}</td>
        <td style="text-align:center">${li.qty}</td>
        <td style="text-align:right">${li.unitPrice.toFixed(2)}</td>
        <td style="text-align:right">${li.totalPrice.toFixed(2)}</td>
      </tr>`).join('');

    const statusColor = { draft: '#6b7280', sent: '#1d4ed8', paid: '#16a34a', cancelled: '#dc2626' };

    const qrData = encodeURIComponent(`${invoice.invoiceNumber} | ${invoice.billTo} | Total: ${invoice.totalAmount}`);
    const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${qrData}&margin=4&format=svg`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
    .company { font-size: 22px; font-weight: bold; color: #1d4ed8; }
    .doc-info { display: flex; align-items: flex-start; gap: 16px; }
    .doc-info-text { text-align: right; }
    .doc-info h2 { font-size: 18px; font-weight: bold; text-transform: uppercase; color: #374151; }
    .doc-info p { margin-top: 4px; color: #6b7280; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: bold; color: #fff; background: ${statusColor[invoice.status] || '#6b7280'}; text-transform: uppercase; margin-top: 6px; }
    .qr-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px; background: #fff; }
    .qr-label { font-size: 8px; text-align: center; color: #9ca3af; margin-top: 2px; font-weight: bold; text-transform: uppercase; }
    .bill-to { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; }
    .bill-to label { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #6b7280; display: block; margin-bottom: 4px; }
    .bill-to span { font-size: 14px; font-weight: 600; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .meta-item label { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #6b7280; display: block; margin-bottom: 2px; }
    .meta-item span { font-size: 13px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #1d4ed8; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; }
    td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }
    .totals { width: 260px; margin-left: auto; margin-bottom: 28px; }
    .totals tr td { border: none; padding: 4px 8px; }
    .totals tr:last-child td { font-size: 14px; font-weight: bold; border-top: 2px solid #111; padding-top: 8px; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 32px; }
    .sig-box { border-top: 2px solid #111; padding-top: 8px; }
    .sig-box label { font-size: 10px; text-transform: uppercase; color: #6b7280; }
    .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    @media print { button { display: none !important; } body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company">${companyName}</div>
      <div style="color:#6b7280;margin-top:4px;">Tax Invoice</div>
    </div>
    <div class="doc-info">
      <div class="doc-info-text">
        <h2>Invoice</h2>
        <p><strong>${invoice.invoiceNumber}</strong></p>
        <p>Date: ${new Date(invoice.createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</p>
        ${invoice.dueDate ? `<p>Due: ${new Date(invoice.dueDate).toLocaleDateString('en-GB', { day:'2-digit',month:'short',year:'numeric' })}</p>` : ''}
        <span class="status-badge">${invoice.status}</span>
      </div>
      <div class="qr-box">
        <img src="${qrUrl}" width="100" height="100" alt="QR Code" />
        <div class="qr-label">Scan to verify</div>
      </div>
    </div>
  </div>

  <div class="bill-to">
    <label>Bill To</label>
    <span>${invoice.billTo}</span>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><label>Payment Terms</label><span>${invoice.paymentTerms || 'Net 30'}</span></div>
    <div class="meta-item"><label>Generated By</label><span>${invoice.generatedByName || '—'}</span></div>
    <div class="meta-item"><label>Notes</label><span>${invoice.notes || '—'}</span></div>
  </div>

  <table>
    <thead><tr>
      <th>Description</th>
      <th style="text-align:center">Qty</th>
      <th style="text-align:right">Unit Price</th>
      <th style="text-align:right">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">${invoice.subtotal.toFixed(2)}</td></tr>
    ${invoice.taxRate > 0 ? `<tr><td>Tax (${invoice.taxRate}%)</td><td style="text-align:right">${invoice.taxAmount.toFixed(2)}</td></tr>` : ''}
    <tr><td>Total</td><td style="text-align:right">${invoice.totalAmount.toFixed(2)}</td></tr>
  </table>

  <div class="sig-grid">
    <div class="sig-box"><label>Authorised By</label><br/><br/><br/><span style="font-size:10px;color:#6b7280">Name &amp; Signature / Date</span></div>
    <div class="sig-box"><label>Received By</label><br/><br/><br/><span style="font-size:10px;color:#6b7280">Name &amp; Signature / Date</span></div>
  </div>

  <div class="footer">
    Generated by ${companyName} &bull; ${invoice.invoiceNumber} &bull; ${new Date().toLocaleString()}
  </div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('Error printing invoice:', err);
    res.status(500).json({ message: 'Failed to generate printable invoice' });
  }
});

module.exports = router;
