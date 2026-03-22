// Validation utilities for form inputs

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhone = (phone) => {
  // Accept international numbers (E.164-ish) while allowing spaces, dashes and parentheses.
  const value = String(phone || '').trim();
  if (!value) return true;

  const normalized = value.replace(/[\s().-]/g, '');
  const phoneRegex = /^\+?[0-9]{7,15}$/;
  return phoneRegex.test(normalized);
};

export const validateRequired = (value) => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
};

export const validateDate = (date) => {
  const dateObj = new Date(date);
  return dateObj instanceof Date && !isNaN(dateObj);
};

export const validateSalary = (salary) => {
  const num = parseFloat(salary);
  return !isNaN(num) && num >= 0;
};

export const validateEmployeeProfile = (employee, isHR = false) => {
  const errors = {};

  // Required fields for all users
  if (!validateRequired(employee.firstName) || !validateRequired(employee.lastName)) {
    if (!validateRequired(employee.name)) {
      errors.name = 'First name and last name are required';
    }
  }

  if (!validateRequired(employee.email)) {
    errors.email = 'Email is required';
  } else if (!validateEmail(employee.email)) {
    errors.email = 'Invalid email format';
  }

  if (employee.phone && !validatePhone(employee.phone)) {
    errors.phone = 'Invalid phone format';
  }

  if (employee.dateOfBirth && !validateDate(employee.dateOfBirth)) {
    errors.dateOfBirth = 'Invalid date format';
  }

  // HR-specific validations
  if (isHR) {
    if (employee.salary !== undefined && !validateSalary(employee.salary)) {
      errors.salary = 'Invalid salary amount';
    }

    if (employee.status && !['Active', 'On Leave', 'Inactive', 'Terminated'].includes(employee.status)) {
      errors.status = 'Invalid status value';
    }
  }

  // Emergency contact validation
  if (employee.emergencyContact) {
    if (employee.emergencyContact.phone && !validatePhone(employee.emergencyContact.phone)) {
      errors.emergencyContactPhone = 'Invalid emergency contact phone format';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

export const validateBulkUpdate = (updates) => {
  const errors = {};

  if (updates.status && !['Active', 'On Leave', 'Inactive', 'Terminated'].includes(updates.status)) {
    errors.status = 'Invalid status value';
  }

  if (updates.department && !validateRequired(updates.department)) {
    errors.department = 'Department cannot be empty';
  }

  if (updates.jobTitle && !validateRequired(updates.jobTitle)) {
    errors.jobTitle = 'Job title cannot be empty';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

export const validateFile = (file, maxSizeMB = 2, allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']) => {
  const errors = {};

  if (!file) {
    return { isValid: true, errors };
  }

  // Check file size
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    errors.size = `File size must be less than ${maxSizeMB}MB`;
  }

  // Check file type
  if (!allowedTypes.includes(file.type)) {
    errors.type = `File type must be one of: ${allowedTypes.join(', ')}`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};
