const mongoose = require('mongoose');

const incidentReportSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    incidentType: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    location: { type: String, required: true, trim: true },
    reportedBy: { type: mongoose.Schema.Types.Mixed, default: null },
    severity: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Low',
      required: true,
    },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
      default: 'Open',
      required: true,
    },
    actionTaken: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

incidentReportSchema.index({ date: -1, createdAt: -1 });
incidentReportSchema.index({ title: 'text', description: 'text', location: 'text', incidentType: 'text' });

module.exports = mongoose.model('IncidentReport', incidentReportSchema);
