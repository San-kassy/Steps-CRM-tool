const ApprovalRule = require('../models/ApprovalRule');

/**
 * Find matching approval rule for a request
 * @param {String} moduleType - The type of request module (e.g., 'Material Requests', 'Advance Requests')
 * @param {Object} requestData - The request data to evaluate conditions against
 * @returns {Object|null} - The matching approval rule or null
 */
async function findMatchingApprovalRule(moduleType, requestData) {
  try {
    // Find all active rules for this module type
    const rules = await ApprovalRule.find({
      moduleType,
      status: 'Active'
    }).sort({ createdAt: -1 }); // Most recent first

    if (!rules || rules.length === 0) {
      return null;
    }

    // Check each rule to find the first match
    for (const rule of rules) {
      if (evaluateConditions(rule.condition, requestData)) {
        return rule;
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding approval rule:', error);
    return null;
  }
}

/**
 * Evaluate if request data matches rule conditions
 * @param {Array} conditions - Array of condition strings
 * @param {Object} requestData - The request data
 * @returns {Boolean} - True if conditions match
 */
function evaluateConditions(conditions, requestData) {
  // If no conditions or "All Requests", always match
  if (!conditions || conditions.length === 0 || conditions.includes('All Requests')) {
    return true;
  }

  // Evaluate each condition
  for (const condition of conditions) {
    if (condition === 'All Requests') {
      return true;
    }
    
    // Amount-based conditions
    if (condition === 'Amount > 1000' && requestData.amount > 1000) {
      return true;
    }
    if (condition === 'Amount > 5000' && requestData.amount > 5000) {
      return true;
    }

    // Duration-based conditions (for travel/leave requests)
    if (condition === 'Duration > 2 Days' && requestData.duration > 2) {
      return true;
    }
    if (condition === 'Duration > 5 Days' && requestData.duration > 5) {
      return true;
    }

    // Policy-based conditions
    if (condition === 'Out of Policy' && requestData.outOfPolicy === true) {
      return true;
    }
  }

  return false;
}

/**
 * Get role-based approver for a request
 * @param {String} approverRole - Role name (e.g., 'Direct Manager', 'Department Head')
 * @param {Object} requestData - Request data containing employee info
 * @returns {Object} - Approver info {id, name, email, role}
 */
async function getApproverByRole(approverRole, requestData) {
  const Employee = require('../models/Employee');
  const User = require('../models/User');

  try {
    let approver = null;

    const toDisplayName = (person = {}) => {
      const fromParts = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
      return fromParts || person.fullName || person.name || person.email || 'Unknown';
    };

    const resolveEmployeeFromRequest = async () => {
      if (requestData.employeeId) {
        const employeeId = String(requestData.employeeId).trim();
        let employee = await Employee.findOne({ employeeId });
        if (!employee && employeeId.match(/^[0-9a-fA-F]{24}$/)) {
          employee = await Employee.findById(employeeId);
        }
        if (employee) return employee;
      }

      if (requestData.userId) {
        const user = await User.findById(String(requestData.userId)).lean();
        if (user?.employeeRef) {
          const employee = await Employee.findById(user.employeeRef);
          if (employee) return employee;
        }
        if (user?.email) {
          const employee = await Employee.findOne({ email: user.email.toLowerCase() });
          if (employee) return employee;
        }
      }

      return null;
    };

    switch (approverRole) {
      case 'Direct Manager':
        // Resolve requester employee then route to their assigned manager.
        {
          const employee = await resolveEmployeeFromRequest();
          if (employee?.managerId) {
            const managerId = String(employee.managerId).trim();
            let manager = await Employee.findOne({ employeeId: managerId });
            if (!manager && managerId.match(/^[0-9a-fA-F]{24}$/)) {
              manager = await Employee.findById(managerId);
            }

            if (manager) {
              approver = {
                id: String(manager.userRef || manager._id || manager.employeeId || ''),
                name: toDisplayName(manager),
                email: manager.email,
                role: 'Direct Manager'
              };
            }
          }
        }
        break;

      case 'Department Head':
        // Find department head for the request's department
        if (requestData.department) {
          const deptHead = await Employee.findOne({
            department: requestData.department,
            $or: [
              { jobTitle: { $regex: /head|director|manager/i } },
              { role: { $regex: /head|director|manager/i } },
            ],
          }).sort({ updatedAt: -1 });
          
          if (deptHead) {
            approver = {
              id: String(deptHead.userRef || deptHead._id || deptHead.employeeId || ''),
              name: toDisplayName(deptHead),
              email: deptHead.email,
              role: 'Department Head'
            };
          }
        }
        break;

      case 'Finance Manager': {
        // Find user likely responsible for finance approvals.
        const financeManager = await User.findOne({
          $or: [
            { role: 'Finance Manager' },
            { role: 'Finance' },
            { department: { $regex: /^finance$/i } },
          ],
          status: 'Active',
        }).sort({ updatedAt: -1 });
        if (financeManager) {
          approver = {
            id: String(financeManager._id),
            name: toDisplayName(financeManager),
            email: financeManager.email,
            role: 'Finance Manager'
          };
        }
        break;
      }

      case 'HR Director': {
        // Find user likely responsible for HR approvals.
        const hrDirector = await User.findOne({
          $or: [
            { role: 'HR Director' },
            { role: 'HR' },
            { department: { $regex: /^hr$/i } },
          ],
          status: 'Active',
        }).sort({ updatedAt: -1 });
        if (hrDirector) {
          approver = {
            id: String(hrDirector._id),
            name: toDisplayName(hrDirector),
            email: hrDirector.email,
            role: 'HR Director'
          };
        }
        break;
      }

      case 'Admin': {
        // Find admin user
        const admin = await User.findOne({ role: 'Admin', status: 'Active' }).sort({ updatedAt: -1 });
        if (admin) {
          approver = {
            id: String(admin._id),
            name: toDisplayName(admin),
            email: admin.email,
            role: 'Admin'
          };
        }
        break;
      }
    }

    return approver;
  } catch (error) {
    console.error('Error getting approver by role:', error);
    return null;
  }
}

/**
 * Build approval chain for a request based on matching rule
 * @param {String} moduleType - The module type
 * @param {Object} requestData - The request data
 * @returns {Object} - { rule, approvalChain: [{level, approver, status}] }
 */
async function buildApprovalChain(moduleType, requestData) {
  try {
    const rule = await findMatchingApprovalRule(moduleType, requestData);
    
    if (!rule) {
      return {
        rule: null,
        approvalChain: [],
        usesRuleBasedApproval: false
      };
    }

    // Build approval chain from rule levels
    const approvalChain = [];
    
    for (const level of rule.levels) {
      const approver = await getApproverByRole(level.approverRole, requestData);
      
      if (approver) {
        approvalChain.push({
          level: level.level,
          approverRole: level.approverRole,
          approverId: approver.id,
          approverName: approver.name,
          approverEmail: approver.email,
          status: level.level === 1 ? 'pending' : 'awaiting', // First level is pending, others await
          approvedAt: null,
          comments: ''
        });
      } else {
        console.warn(`Could not find approver for role: ${level.approverRole}`);
      }
    }

    return {
      rule,
      approvalChain,
      usesRuleBasedApproval: true,
      currentApprovalLevel: 1
    };
  } catch (error) {
    console.error('Error building approval chain:', error);
    return {
      rule: null,
      approvalChain: [],
      usesRuleBasedApproval: false
    };
  }
}

module.exports = {
  findMatchingApprovalRule,
  evaluateConditions,
  getApproverByRole,
  buildApprovalChain
};
