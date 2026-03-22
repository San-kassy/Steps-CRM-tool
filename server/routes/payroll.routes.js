const express = require('express');
const router = express.Router();
const PayrollRun = require('../models/PayrollRun');
const Employee = require('../models/Employee');
const { checkSecurityRole } = require('../middleware/securityAuth');

// GET prepared employee list for a new payroll run
// Query param: paymentSchedule (optional) — filters to matching employees only
router.get('/prepare', async (req, res) => {
  try {
    const { paymentSchedule } = req.query;

    // Build filter: only Active employees
    const filter = { status: 'Active' };

    // If a schedule is given, include employees that match or have no schedule set
    if (paymentSchedule) {
      filter.$or = [
        { paySchedule: paymentSchedule },
        { paySchedule: { $exists: false } },
        { paySchedule: null },
        { paySchedule: '' },
      ];
    }

    const employees = await Employee.find(filter).lean();

    const prepared = employees.map((emp) => {
      const baseSalary = emp.salary || 0;
      const bonus = emp.bonus || 0;
      const allowances = emp.allowances || 0;
      const grossPay = baseSalary + bonus + allowances;

      return {
        id: emp._id,
        name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email,
        department: emp.department || '',
        paySchedule: emp.paySchedule || null,
        baseSalary,
        bonus,
        allowances,
        regularHours: 0,
        overtime: 0,
        commission: 0,
        grossPay,
        status: baseSalary > 0 ? 'Ready' : 'Incomplete',
      };
    });

    res.json({ success: true, data: prepared });
  } catch (err) {
    console.error('Error preparing payroll employees:', err);
    res.status(500).json({ success: false, message: 'Failed to prepare payroll employees' });
  }
});


// GET all historical payroll runs
router.get('/runs', async (req, res) => {
  try {
    const runs = await PayrollRun.find().sort({ createdAt: -1 });
    res.json(runs);
  } catch (err) {
    console.error('Error fetching payroll runs:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET active draft (if any)
router.get('/draft', async (req, res) => {
  try {
    const draft = await PayrollRun.findOne({ status: 'draft' }).sort({ updatedAt: -1 });
    res.json({ data: draft });
  } catch (err) {
    console.error('Error fetching draft:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET single payroll run by ID
router.get('/runs/:id', async (req, res) => {
  try {
    const run = await PayrollRun.findById(req.params.id);
    if (!run) return res.status(404).json({ success: false, message: 'Not found' });
    res.json(run);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST to save/update a draft
router.post('/draft', async (req, res) => {
  try {
    const draftData = req.body;
    draftData.status = 'draft';

    // Check if a draft already exists, if so overwrite it
    let draft = await PayrollRun.findOne({ status: 'draft' });

    if (draft) {
      draft = await PayrollRun.findByIdAndUpdate(
        draft._id,
        { $set: draftData },
        { new: true, runValidators: true }
      );
    } else {
      draft = new PayrollRun(draftData);
      await draft.save();
    }
    
    res.json({ success: true, draft });
  } catch (err) {
    console.error('Error saving payroll draft:', err);
    res.status(400).json({ success: false, message: 'Error saving draft', error: err.message });
  }
});

// POST to submit a final run
router.post('/submit', async (req, res) => {
  try {
    const runData = req.body;
    runData.status = 'pending_approval';
    
    // For submitting, we either update the existing draft to pending_approval or create a new one
    let run;
    if (runData._id || runData.id) {
        run = await PayrollRun.findByIdAndUpdate(
            runData._id || runData.id,
            { $set: runData },
            { new: true, runValidators: true }
        );
    } else {
        run = new PayrollRun(runData);
        await run.save();
    }
    
    // Optionally delete any remaining 'draft' if we just submitted one
    await PayrollRun.deleteMany({ status: 'draft', _id: { $ne: run._id } });

    res.status(201).json({ success: true, run });
  } catch (err) {
    console.error('Error submitting payroll:', err);
    res.status(400).json({ success: false, message: 'Error submitting payroll', error: err.message });
  }
});

// PUT to update status (Admin only)
router.put('/runs/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        // Validate valid status transitions here if needed
        const updatedRun = await PayrollRun.findByIdAndUpdate(
            req.params.id,
            { $set: { status } },
            { new: true }
        );

        if (!updatedRun) return res.status(404).json({ success: false, message: 'Not found' });
        res.json(updatedRun);
    } catch (err) {
        res.status(400).json({ success: false, message: 'Error updating status', error: err.message });
    }
});

module.exports = router;
