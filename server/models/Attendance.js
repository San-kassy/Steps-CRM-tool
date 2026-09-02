const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  id: { type: Number, unique: true, sparse: true },
  user: { type: String },
  name: { type: String, default: '' },
  employeeId: { type: String, default: '' },
  date: { type: String, default: '' },
  checkInTime: { type: Date, default: Date.now },
  status: { type: String, required: true },
  source: { type: String, default: 'local' },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Attendance', AttendanceSchema);
