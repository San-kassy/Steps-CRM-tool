const express = require('express');
const router = express.Router();
const PayrollRun = require('../models/PayrollRun');
const Employee = require('../models/Employee');
const { checkSecurityRole } = require('../middleware/securityAuth');

const normalizePayrollSchedule = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const match = {
    monthly: 'Monthly',
    'semi-monthly': 'Semi-monthly',
    semimonthly: 'Semi-monthly',
    'bi-weekly': 'Bi-weekly',
    biweekly: 'Bi-weekly',
    weekly: 'Weekly',
  }[normalized.toLowerCase()];
  return match || normalized;
};

const buildPayrollEmployeeRow = (emp, overrides = {}) => {
  const mergedSalary = Number(overrides.baseSalary ?? emp.salary ?? 0);
  const mergedBonus = Number(overrides.bonus ?? emp.bonus ?? 0);
  const mergedAllowances = Number(overrides.allowances ?? emp.allowances ?? 0);

  return {
    id: emp._id,
    name: overrides.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email,
    department: overrides.department ?? emp.department ?? '',
    paySchedule: normalizePayrollSchedule(overrides.paySchedule ?? emp.paySchedule),
    baseSalary: mergedSalary,
    bonus: mergedBonus,
    allowances: mergedAllowances,
    regularHours: Number(overrides.regularHours ?? 0),
    overtime: Number(overrides.overtime ?? 0),
    commission: Number(overrides.commission ?? 0),
    status: mergedSalary > 0 ? 'Ready' : 'Incomplete',
  };
};

const hydratePayrollEmployees = async (employees = []) => {
  const rows = Array.isArray(employees) ? employees : [];
  const hydrated = [];

  for (const row of rows) {
    const employeeId = String(row?.id || row?._id || '').trim();
    if (!employeeId) {
      hydrated.push({ ...row });
      continue;
    }

    const employee = await Employee.findById(employeeId).lean();
    if (!employee) {
      hydrated.push({ ...row });
      continue;
    }

    hydrated.push(buildPayrollEmployeeRow(employee, row));
  }

  return hydrated;
};

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
      const row = buildPayrollEmployeeRow(emp);
      const grossPay = row.baseSalary + row.bonus + row.allowances;

      return {
        ...row,
        grossPay,
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
    draftData.employees = await hydratePayrollEmployees(draftData.employees);

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
    runData.employees = await hydratePayrollEmployees(runData.employees);
    
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
