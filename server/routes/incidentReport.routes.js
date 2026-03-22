const express = require('express');
const router = express.Router();
const IncidentReport = require('../models/IncidentReport');
const { verifyToken } = require('../middleware/auth');

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, severity, incidentType, search } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (incidentType) filter.incidentType = incidentType;

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { incidentType: { $regex: search, $options: 'i' } },
      ];
    }

    const [reports, total] = await Promise.all([
      IncidentReport.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      IncidentReport.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    console.error('Error fetching incident reports:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch incident reports' });
  }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const report = await IncidentReport.findById(req.params.id).lean();
    if (!report) {
      return res.status(404).json({ success: false, error: 'Incident report not found' });
    }

    res.json({ success: true, data: report });
  } catch (error) {
    console.error('Error fetching incident report:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch incident report' });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const payload = {
      ...req.body,
      reportedBy:
        req.body?.reportedBy ||
        req.user?._id ||
        req.user?.id ||
        req.user?.email ||
        null,
    };

    const created = await IncidentReport.create(payload);
    res.status(201).json({
      success: true,
      message: 'Incident report created successfully',
      data: created,
    });
  } catch (error) {
    console.error('Error creating incident report:', error);
    res.status(400).json({ success: false, error: error.message || 'Failed to create incident report' });
  }
});

router.put('/:id', verifyToken, async (req, res) => {
  try {
    const updated = await IncidentReport.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Incident report not found' });
    }

    res.json({
      success: true,
      message: 'Incident report updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Error updating incident report:', error);
    res.status(400).json({ success: false, error: error.message || 'Failed to update incident report' });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const deleted = await IncidentReport.findByIdAndDelete(req.params.id).lean();

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Incident report not found' });
    }

    res.json({ success: true, message: 'Incident report deleted successfully' });
  } catch (error) {
    console.error('Error deleting incident report:', error);
    res.status(500).json({ success: false, error: 'Failed to delete incident report' });
  }
});

module.exports = router;
