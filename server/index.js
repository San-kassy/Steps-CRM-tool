/* eslint-disable */
// Server migrated to use MongoDB via Mongoose.
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
// Ensure .env is loaded even when the server is started from the repo root
dotenv.config({ path: path.join(__dirname, '.env') });

const { validate, validationRules } = require('./middleware/validation');
const { checkSecurityPermission, checkSecurityRole } = require('./middleware/securityAuth');
const api = require('./api');
const ModuleModel = require('./models/Module');
const AnalyticsModel = require('./models/Analytics');
const AttendanceModel = require('./models/Attendance');
const MaterialRequestModel = require('./models/MaterialRequest');
const PurchaseOrderModel = require('./models/PurchaseOrder');
const AdvanceRequestModel = require('./models/AdvanceRequest');
const RefundRequestModel = require('./models/RefundRequest');
const RetirementBreakdownModel = require('./models/RetirementBreakdown');
const DocumentModel = require('./models/Document');
const UserModel = require('./models/User');
const SecuritySettingsModel = require('./models/SecuritySettings');
const AuditLogModel = require('./models/AuditLog');
const ArchivedLogModel = require('./models/ArchivedLog');
const PolicyModel = require('./models/Policy');
const EmployeeModel = require('./models/Employee');
const JobRequisitionModel = require('./models/JobRequisition');
const TrainingModel = require('./models/Training');
const DepartmentModel = require('./models/Department');
const JobTitleModel = require('./models/JobTitle');
const RoleModel = require('./models/Role');
const BudgetCategoryModel = require('./models/BudgetCategory');
const InventoryItemModel = require('./models/InventoryItem');
const NotificationModel = require('./models/Notification');
const { validatePassword, getPasswordPolicy } = require('./utils/passwordValidator');

// Static lists used to seed the DB when empty
const DEFAULT_ROLES = [
  {
    name: 'Admin',
    description: 'Full access to all settings and user management.',
    isSystem: true,
    permissions: {
      userManagement: { viewUsers: true, editUsers: true, inviteUsers: true },
      billingFinance: { viewInvoices: true, manageSubscription: true },
      systemSettings: { globalConfiguration: true },
      security: {
        viewLogs: true,
        exportLogs: true,
        manageSettings: true,
        manageNotifications: true,
        viewAnalytics: true,
        manageSessions: true,
        generateReports: true,
      },
    }
  },
  {
    name: 'Editor',
    description: 'Can edit content but usually cannot manage system users.',
    isSystem: true,
    permissions: {
      userManagement: { viewUsers: true, editUsers: false, inviteUsers: false },
      billingFinance: { viewInvoices: false, manageSubscription: false },
      systemSettings: { globalConfiguration: false },
      security: {
        viewLogs: true,
        exportLogs: false,
        manageSettings: false,
        manageNotifications: false,
        viewAnalytics: true,
        manageSessions: false,
        generateReports: true,
      },
    }
  },
  {
    name: 'Viewer',
    description: 'Read-only access to published content.',
    isSystem: true,
    permissions: {
      userManagement: { viewUsers: true, editUsers: false, inviteUsers: false },
      billingFinance: { viewInvoices: false, manageSubscription: false },
      systemSettings: { globalConfiguration: false },
      security: {
        viewLogs: false,
        exportLogs: false,
        manageSettings: false,
        manageNotifications: false,
        viewAnalytics: false,
        manageSessions: false,
        generateReports: false,
      },
    }
  }
];

const DEFAULT_DEPARTMENTS = [
  { name: 'IT Security', code: 'ITS', icon: 'fa-shield-halved', color: 'blue' },
  { name: 'HR', code: 'HR', icon: 'fa-users', color: 'purple' },
  { name: 'Finance', code: 'FIN', icon: 'fa-dollar-sign', color: 'green' },
  { name: 'Legal', code: 'LEG', icon: 'fa-gavel', color: 'red' },
  { name: 'Marketing', code: 'MKT', icon: 'fa-bullhorn', color: 'orange' },
  { name: 'Operations', code: 'OPS', icon: 'fa-cogs', color: 'gray' },
];

const DEFAULT_JOB_TITLES = [
  'Software Engineer',
  'HR Manager',
  'Finance Manager',
  'Legal Counsel',
  'Marketing Specialist',
  'Operations Manager',
  'Accountant',
  'Product Manager',
];
const VendorModel = require('./models/Vendor');
const approvalRuleRoutes = require('./routes/approvalRule.routes');
const { sendApprovalEmail, sendPOReviewEmail, sendPasswordResetEmail, sendSecurityAlertEmail, sendNotificationRuleEmail, sendEmailOTP, sendInventoryExpiryAlertEmail, sendWelcomeVerificationEmail } = require('./utils/emailService');
const { sendSMSOTP } = require('./utils/smsService');
const { buildApprovalChain } = require('./utils/approvalRuleHelper');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
const httpServer = http.createServer(app);
const isServerlessRuntime = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
let startupPromise = null;

// Security Middleware
app.use(helmet()); // Secure HTTP headers
app.use(mongoSanitize()); // Sanitize MongoDB queries

// CORS configuration (MUST BE BEFORE RATE LIMITER OR CORS WILL FAIL ON 429)
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

if (allowedOrigins.length === 0 && !isServerlessRuntime) {
  console.error('FRONTEND_URL not set in .env file');
  process.exit(1);
}
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

// Apply rate limiter to all requests
app.use(limiter);

// More strict rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // increased for developement convenience
  skipSuccessfulRequests: true,
  message: 'Too many failed requests, please try again later.',
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(morgan('dev'));

// Request timeout middleware - prevent hanging requests
app.use((req, res, next) => {
  req.setTimeout(60000, () => {
    res.status(408).json({ success: false, error: 'Request timeout' });
  });
  res.setTimeout(60000, () => {
    res.status(408).json({ success: false, error: 'Response timeout' });
  });
  next();
});

// File upload helper - validates base64 data
const validateBase64File = (base64String, maxSizeMB, allowedTypes) => {
  if (!base64String || !base64String.startsWith('data:')) {
    throw new Error('Invalid file format. Expected base64 data URL.');
  }

  // Extract mime type and validate
  const mimeMatch = base64String.match(/data:([^;]+);/);
  if (!mimeMatch) {
    throw new Error('Invalid file format.');
  }
  
  const mimeType = mimeMatch[1];
  if (allowedTypes && !allowedTypes.test(mimeType)) {
    throw new Error(`File type ${mimeType} not allowed.`);
  }

  // Check file size (base64 is ~33% larger than binary)
  const sizeMatch = base64String.match(/base64,(.+)$/);
  if (sizeMatch) {
    const base64Data = sizeMatch[1];
    const sizeInBytes = (base64Data.length * 3) / 4;
    const sizeInMB = sizeInBytes / (1024 * 1024);
    
    if (sizeInMB > maxSizeMB) {
      throw new Error(`File size exceeds ${maxSizeMB}MB limit.`);
    }
  }

  return { mimeType, valid: true };
};

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in .env file');
  if (!isServerlessRuntime) {
    process.exit(1);
  }
}

async function start() {
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 30000, // Increased to 30 seconds
        socketTimeoutMS: 45000,
        family: 4, // Use IPv4, skip trying IPv6
        maxPoolSize: 10,
        minPoolSize: 2,
        tls: true, // Enable TLS/SSL
        tlsAllowInvalidCertificates: false,
        retryWrites: true,
        w: 'majority',
      });
      console.log('✓ Connected to MongoDB');

      // Handle MongoDB connection events
      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected. Attempting to reconnect...');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('✓ MongoDB reconnected');
      });

      // Basic seed data for modules (minimal auto-seeding)
      const seedModules = [
        { id: 1, name: "Approval", componentName: "Approval" },
        { id: 2, name: "Inventory", componentName: "Inventory" },
        { id: 3, name: "HRM", componentName: "HRM" },
        { id: 4, name: "FM", componentName: "FM" },
        { id: 5, name: "Finance", componentName: "Finance" },
        { id: 6, name: "Security", componentName: "Security" },
        { id: 7, name: "Admin", componentName: "Admin" },
        { id: 8, name: "Attendance", componentName: "Attendance" },
        { id: 9, name: "DocSign", componentName: "DocSign" },
        { id: 10, name: "Material Requests", componentName: "MaterialRequests" },
        { id: 11, name: "Purchase Orders", componentName: "PurchaseOrders" },
        { id: 12, name: "Analytics", componentName: "Analytics" },
        { id: 13, name: "Policy", componentName: "Policy" },
        { id: 14, name: "Incident Reporting", componentName: "IncidentReporting" },
      ];

      // Seed modules if empty or update with new modules
      const moduleCount = await ModuleModel.countDocuments();
      if (moduleCount === 0) {
        await ModuleModel.insertMany(seedModules);
        console.log('Seeded modules');
      } else {
        // Upsert modules: update existing ones and add new ones
        for (const module of seedModules) {
          await ModuleModel.findOneAndUpdate(
            { id: module.id },
            module,
            { upsert: true, new: true }
          );
        }
        // Remove any stale modules not in the current seed list
        const validIds = seedModules.map((m) => m.id);
        await ModuleModel.deleteMany({ id: { $nin: validIds } });
        console.log('Updated modules to match seed data');
      }
    } catch (err) {
      console.error('✗ Failed to connect to MongoDB');
      console.error('  Error:', err.message);
      console.error('  Please ensure MongoDB is running and MONGODB_URI is set correctly in .env');
      if (!isServerlessRuntime) {
        process.exit(1);
      }
      throw err;
    }
  }

  // API endpoints using centralized server API helpers
  const api = require('./api');
  const { authMiddleware, generateToken, generateMfaPendingToken, verifyMfaPendingToken } = require('./middleware/auth');
  const crypto = require('crypto');

  // ==================== HEALTH CHECK ROUTE ====================

  // Health check endpoint
  app.get('/api/health', async (req, res) => {
    try {
      const dbStatus = mongoose.connection.readyState === 1;
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      
      const health = {
        status: dbStatus ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime),
        database: {
          connected: dbStatus,
          state: mongoose.connection.readyState // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
        },
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
          rss: Math.round(memoryUsage.rss / 1024 / 1024) // MB
        }
      };

      const statusCode = dbStatus ? 200 : 503;
      res.status(statusCode).json({ success: true, data: health });
    } catch (error) {
      console.error('Health check error:', error);
      res.status(503).json({ success: false, error: 'Health check failed' });
    }
  });

  // ==================== AUTHENTICATION ROUTES ====================

  // Public endpoint: password policy (for signup / reset password pages)
  app.get('/api/auth/password-policy', async (req, res) => {
    try {
      const policy = await getPasswordPolicy();
      res.json(policy);
    } catch (err) {
      console.error('Error fetching password policy:', err);
      res.json({ enabled: false, minLength: 8 });
    }
  });

  // Signup
  app.post('/api/auth/signup', async (req, res) => {
    try {
      console.log('Signup payload:', req.body);

      // Sanitize inputs
      const firstName = (req.body.firstName || '').toString().trim();
      const lastName = (req.body.lastName || '').toString().trim();
      const email = (req.body.email || '').toString().trim().toLowerCase();
      const password = (req.body.password || '').toString();
      const rawRole = (req.body.role || 'user').toString().trim();
      const roleMap = {
        admin: 'Admin',
        'security admin': 'Security Admin',
        'security analyst': 'Security Analyst',
        editor: 'Editor',
        viewer: 'Viewer',
        user: 'user',
      };
      const role = roleMap[rawRole.toLowerCase()] || 'user';
      const department = (req.body.department || '').toString().trim() || null;
      const jobTitle = (req.body.jobTitle || '').toString().trim() || null;

      // Validate input
      if (!firstName || !lastName || !email || !password) {
        console.warn('Signup validation failed. Missing fields. Payload:', { firstName, lastName, email: req.body.email ? '[REDACTED]' : '', password: password ? '[PROVIDED]' : '' });
        return res.status(400).json({
          success: false,
          error: 'All fields are required',
        });
      }

      // Basic email format check
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        console.warn('Signup validation failed. Invalid email:', email);
        return res.status(400).json({ success: false, error: 'Invalid email address' });
      }

      // Password policy check
      const pwResult = await validatePassword(password);
      if (!pwResult.valid) {
        console.warn('Signup validation failed. Password policy:', pwResult.error);
        return res.status(400).json({ success: false, error: pwResult.error });
      }

      // Helper to escape user input for regex
      const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Validate department if provided (check DB)
      if (department) {
        const q = {
          $or: [
            { name: new RegExp(`^${escapeRegex(department)}$`, 'i') },
            { code: new RegExp(`^${escapeRegex(department)}$`, 'i') },
          ],
        };
        // also try to match by id if looks like an ObjectId
        if (/^[0-9a-fA-F]{24}$/.test(department)) q.$or.push({ _id: department });
        const foundDept = await DepartmentModel.findOne(q).lean();
        if (!foundDept) {
          console.warn('Signup validation failed. Invalid department:', department);
          return res.status(400).json({ success: false, error: 'Invalid department' });
        }
      }

      // Validate job title (required) against DB
      if (!jobTitle) {
        console.warn('Signup validation failed. Missing job title');
        return res.status(400).json({ success: false, error: 'Job title is required' });
      }
      const foundJT = await JobTitleModel.findOne({ title: new RegExp(`^${escapeRegex(jobTitle)}$`, 'i') }).lean();
      if (!foundJT) {
        console.warn('Signup validation failed. Invalid job title:', jobTitle);
        return res.status(400).json({ success: false, error: 'Invalid job title' });
      }

      // Check if user already exists
      const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Email already registered',
        });
      }

      const verificationToken = require('crypto').randomBytes(32).toString('hex');
      const user = new UserModel({
        firstName,
        lastName,
        email: email.toLowerCase(),
        password,
        role: role || 'user',
        status: 'Active',
        department: (typeof foundDept !== 'undefined' && foundDept) ? foundDept.name : (department || null),
        jobTitle: (typeof foundJT !== 'undefined' && foundJT) ? foundJT.title : (jobTitle || null),
        emailVerificationToken: verificationToken,
        emailVerificationExpires: Date.now() + 48 * 60 * 60 * 1000 // 48 hours
      });

      await user.save();

      // Ensure signup creates/links an individual employee profile for this user.
      try {
        let employee = await EmployeeModel.findOne({ email: email.toLowerCase() });
        if (employee) {
          const employeeUpdates = {
            userRef: user._id,
            firstName,
            lastName,
            department: user.department || employee.department,
            jobTitle: user.jobTitle || employee.jobTitle,
            role: user.role,
            status: user.status === 'Inactive' ? 'Terminated' : 'Active',
            updatedAt: new Date(),
          };
          await EmployeeModel.findByIdAndUpdate(employee._id, employeeUpdates, { new: true });
          user.employeeRef = employee._id;
          await user.save();
        } else {
          const count = await EmployeeModel.countDocuments();
          const employeeId = `EMP${String(count + 1).padStart(5, '0')}`;
          employee = await EmployeeModel.create({
            firstName,
            lastName,
            email: email.toLowerCase(),
            employeeId,
            department: user.department || null,
            jobTitle: user.jobTitle || null,
            role: user.role,
            status: 'Active',
            userRef: user._id,
          });

          user.employeeRef = employee._id;
          await user.save();
        }
      } catch (employeeLinkError) {
        console.error('Signup employee link error:', employeeLinkError);
      }

      // Send welcome verification email asynchronously (do not await so it doesn't block response)
      sendWelcomeVerificationEmail(user.email, user.firstName || user.fullName, user.emailVerificationToken)
        .catch(err => console.error('Failed to send welcome email:', err));

      // Generate token with role
      const token = generateToken(user._id, user.role);

      // Return user data without password
      const userData = {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
        department: user.department || null,
        jobTitle: user.jobTitle || null,
        isEmailVerified: user.isEmailVerified || false,
      };

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: {
          user: userData,
          token,
        },
      });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create account',
      });
    }
  });

  // Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      console.log('Login payload:', req.body);

      // Sanitize inputs
      const email = (req.body.email || '').toString().trim().toLowerCase();
      const password = (req.body.password || '').toString();

      // Validate input
      if (!email || !password) {
        console.warn('Login validation failed. Missing fields. Payload:', { email: req.body.email ? '[REDACTED]' : '', password: password ? '[PROVIDED]' : '' });
        return res.status(400).json({
          success: false,
          error: 'Email and password are required',
        });
      }

      // Basic email format check
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        console.warn('Login validation failed. Invalid email:', email);
        return res.status(400).json({ success: false, error: 'Invalid email address' });
      }

      // Find user with password field
      const user = await UserModel.findOne({ email: email.toLowerCase() }).select('+password');
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password',
        });
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password',
        });
      }

      // Check if account is active
      if (user.status !== 'Active') {
        return res.status(403).json({
          success: false,
          error: 'Account is not active',
        });
      }

      // Check if MFA is required for this user
      const userWithMfa = await UserModel.findById(user._id).select('+mfaSecret mfaEnabled');
      if (userWithMfa.mfaEnabled && userWithMfa.mfaSecret) {
        // MFA is enabled — return a pending token instead of full access
        const mfaPendingToken = generateMfaPendingToken(user._id);
        return res.json({
          success: true,
          mfaRequired: true,
          data: {
            mfaPendingToken,
            userId: user._id,
          },
        });
      }

      // Check if MFA is enforced by org policy but user hasn't set it up yet
      const orgSettings = await SecuritySettingsModel.findOne();
      const mfaPolicy = orgSettings?.mfaSettings;
      if (mfaPolicy?.enabled) {
        const mustEnroll = mfaPolicy.enforcement === 'All Users' ||
          (mfaPolicy.enforcement === 'Admins Only' && user.role === 'Admin');
        if (mustEnroll && !userWithMfa.mfaEnabled) {
          // User needs to setup MFA — give them a full token but flag it
          const token = generateToken(user._id, user.role);
          user.lastLogin = new Date();
          await user.save();
          const userData = {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            status: user.status,
            profilePicture: user.profilePicture,
            department: user.department,
            jobTitle: user.jobTitle,
            mfaEnabled: false,
            permissions: user.permissions || {},
            isEmailVerified: user.isEmailVerified || false,
          };
          return res.json({
            success: true,
            mfaSetupRequired: true,
            message: 'MFA setup is required by your organization',
            data: { user: userData, token },
          });
        }
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate token with role for enhanced security
      const token = generateToken(user._id, user.role);

      // Return user data without password
      const userData = {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
        profilePicture: user.profilePicture,
        department: user.department,
        jobTitle: user.jobTitle,
        mfaEnabled: !!userWithMfa.mfaEnabled,
        permissions: user.permissions || {},
        isEmailVerified: user.isEmailVerified || false,
      };

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: userData,
          token,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed',
      });
    }
  });

  // Verify token
  app.get('/api/auth/verify', authMiddleware, async (req, res) => {
    try {
      const userData = {
        _id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        fullName: req.user.fullName,
        email: req.user.email,
        role: req.user.role,
        status: req.user.status,
        profilePicture: req.user.profilePicture,
        department: req.user.department,
        jobTitle: req.user.jobTitle,
        permissions: req.user.permissions || {},
        isEmailVerified: req.user.isEmailVerified || false,
      };

      res.json({
        success: true,
        data: {
          user: userData,
        },
      });
    } catch (error) {
      console.error('Verify token error:', error);
      res.status(500).json({
        success: false,
        error: 'Verification failed',
      });
    }
  });

  // Verify Email
  app.get('/api/auth/verify-email/:token', async (req, res) => {
    try {
      const { token } = req.params;
      if (!token) {
        return res.status(400).json({ success: false, error: 'Verification token is required' });
      }

      const user = await UserModel.findOne({
        emailVerificationToken: token,
        emailVerificationExpires: { $gt: Date.now() },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          error: 'Verification token is invalid or has expired',
        });
      }

      // Mark as verified and clear tokens
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();

      res.json({
        success: true,
        message: 'Email verified successfully',
      });
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ success: false, error: 'Failed to verify email' });
    }
  });

  // Resend Verification Email
  app.post('/api/auth/resend-verification', authMiddleware, async (req, res) => {
    try {
      const user = await UserModel.findById(req.user._id);
      
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      if (user.isEmailVerified) {
        return res.status(400).json({ success: false, error: 'Email is already verified' });
      }

      // Generate new token
      const verificationToken = require('crypto').randomBytes(32).toString('hex');
      user.emailVerificationToken = verificationToken;
      user.emailVerificationExpires = Date.now() + 48 * 60 * 60 * 1000; // 48 hours
      await user.save();

      // Send email
      await sendWelcomeVerificationEmail(user.email, user.firstName || user.fullName, verificationToken);

      res.json({
        success: true,
        message: 'Verification email sent successfully',
      });
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ success: false, error: 'Failed to resend verification email' });
    }
  });

  // Logout
  app.post('/api/auth/logout', authMiddleware, async (req, res) => {
    try {
      // In a JWT-based system, logout is handled client-side by removing the token
      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        error: 'Logout failed',
      });
    }
  });

  // Forgot password
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email is required',
        });
      }

      const user = await UserModel.findOne({ email: email.toLowerCase() });
      if (!user) {
        // Don't reveal that user doesn't exist
        return res.json({
          success: true,
          message: 'If an account exists with this email, a password reset link has been sent',
        });
      }

      // Generate reset token
      const resetToken = user.generateResetToken();
      await user.save();

      // Send reset email
      const emailResult = await sendPasswordResetEmail(user, resetToken);
      if (!emailResult?.success) {
        throw new Error(emailResult?.error || 'Failed to send password reset email');
      }

      res.json({
        success: true,
        message: 'Password reset email sent',
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process request',
      });
    }
  });

  // Reset password
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Token and new password are required',
        });
      }

      // Hash token
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // Find user with valid token
      const user = await UserModel.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired token',
        });
      }

      // Validate new password against policy
      const pwCheck = await validatePassword(newPassword);
      if (!pwCheck.valid) {
        return res.status(400).json({ success: false, error: pwCheck.error });
      }

      // Update password
      user.password = newPassword;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      res.json({
        success: true,
        message: 'Password reset successful',
      });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset password',
      });
    }
  });

  // ==================== END AUTHENTICATION ROUTES ====================

  // ==================== NOTIFICATION CENTER ROUTES ====================
  app.get('/api/notifications', authMiddleware, async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit || 50);
      const limit = Math.max(1, Math.min(100, Number.isNaN(limitRaw) ? 50 : limitRaw));
      const userId = req.user._id;
      const now = new Date();

      const docs = await NotificationModel.find({
        $or: [{ targetUser: null }, { targetUser: userId }],
        $and: [
          { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
          { dismissedBy: { $ne: userId } },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      const notifications = docs.map((n) => ({
        _id: n._id,
        title: n.title,
        message: n.message,
        type: n.type,
        category: n.category,
        source: n.source,
        metadata: n.metadata || {},
        createdAt: n.createdAt,
        read: Array.isArray(n.readBy)
          ? n.readBy.some((id) => id && id.toString() === userId.toString())
          : false,
      }));

      res.json({ notifications });
    } catch (err) {
      console.error('Error fetching notifications:', err);
      res.status(500).json({ message: 'Failed to fetch notifications' });
    }
  });

  app.patch('/api/notifications/:id/read', authMiddleware, async (req, res) => {
    try {
      const userId = req.user._id;
      const notification = await NotificationModel.findOneAndUpdate(
        { _id: req.params.id },
        { $addToSet: { readBy: userId }, $pull: { dismissedBy: userId } },
        { new: true },
      );

      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
      }

      res.json({ message: 'Notification marked as read' });
    } catch (err) {
      console.error('Error marking notification as read:', err);
      res.status(500).json({ message: 'Failed to mark notification as read' });
    }
  });

  app.post('/api/notifications/clear-all', authMiddleware, async (req, res) => {
    try {
      const userId = req.user._id;
      await NotificationModel.updateMany(
        {
          $or: [{ targetUser: null }, { targetUser: userId }],
          dismissedBy: { $ne: userId },
        },
        {
          $addToSet: { readBy: userId, dismissedBy: userId },
        },
      );

      res.json({ message: 'Notifications cleared' });
    } catch (err) {
      console.error('Error clearing notifications:', err);
      res.status(500).json({ message: 'Failed to clear notifications' });
    }
  });

  app.get('/api/modules', async (req, res) => {
    const mods = await api.getModules();
    res.json(mods);
  });

  app.get('/api/modules/:id', async (req, res) => {
    const id = req.params.id;
    const mod = await api.getModuleById(id);
    if (!mod) return res.status(404).json({ message: 'Not found' });
    res.json(mod);
  });

  // ============ APPROVAL SETTINGS ROUTES ============
  app.use("/api/approval-settings", checkSecurityRole(['Admin']), approvalRuleRoutes);

  // ============ PUBLIC VISITOR SIGN-IN (no auth required) ============
  const VisitorPassModel = require('./models/VisitorPass');
  const { SecurityLog: SecurityLogModel } = require('./models/PhysicalSecurity');

  // GET - Fetch visitor pass info by token (public)
  app.get('/api/visitor/sign-in/:token', async (req, res) => {
    try {
      const pass = await VisitorPassModel.findOne({ token: req.params.token });
      if (!pass) return res.status(404).json({ message: 'Visitor pass not found or expired' });
      if (pass.status === 'signed-in') return res.status(400).json({ message: 'This pass has already been used to sign in', pass });
      if (pass.status === 'checked-out') return res.status(400).json({ message: 'This pass has been checked out', pass });
      if (pass.status === 'expired' || new Date() > pass.expiresAt) return res.status(400).json({ message: 'This visitor pass has expired' });
      res.json({ pass: { _id: pass._id, token: pass.token, status: pass.status, expiresAt: pass.expiresAt, createdBy: pass.createdBy } });
    } catch (err) {
      console.error('Error fetching visitor pass:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // POST - Visitor submits sign-in form (public)
  app.post('/api/visitor/sign-in/:token', async (req, res) => {
    try {
      const pass = await VisitorPassModel.findOne({ token: req.params.token });
      if (!pass) return res.status(404).json({ message: 'Visitor pass not found or expired' });
      if (pass.status !== 'pending') return res.status(400).json({ message: 'This pass has already been used' });
      if (new Date() > pass.expiresAt) return res.status(400).json({ message: 'This visitor pass has expired' });

      const { visitorName, visitorEmail, visitorPhone, company, purpose, hostName } = req.body;
      if (!visitorName || !visitorName.trim()) return res.status(400).json({ message: 'Visitor name is required' });

      pass.visitorName = visitorName.trim();
      pass.visitorEmail = (visitorEmail || '').trim();
      pass.visitorPhone = (visitorPhone || '').trim();
      pass.company = (company || '').trim();
      pass.purpose = (purpose || '').trim();
      pass.hostName = (hostName || '').trim();
      pass.status = 'signed-in';
      pass.signedInAt = new Date();
      await pass.save();

      // Create activity log
      await SecurityLogModel.create({
        time: new Date().toLocaleTimeString(),
        type: 'Visitor',
        details: `Visitor ${pass.visitorName} signed in${pass.company ? ` from ${pass.company}` : ''}${pass.hostName ? ` to meet ${pass.hostName}` : ''}`,
        severity: 'info',
      });

      res.json({ message: 'Signed in successfully', pass });
    } catch (err) {
      console.error('Error processing visitor sign-in:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ============ PHYSICAL SECURITY ROUTES ============
  const physicalSecurityRoutes = require('./routes/physicalSecurity.routes');
  app.use('/api/physical-security', physicalSecurityRoutes);

  // ============ ADMIN ROUTES (logs + backup) ============
  const adminRoutes = require('./routes/admin.routes');
  app.use('/api/admin', adminRoutes);

  // ============ BUDGET ROUTES ============
  const budgetRoutes = require('./routes/budget.routes');
  app.use('/api/budget', budgetRoutes);

  // ============ HR ROUTES ============
  // HR routes are defined inline below (line ~4300+) with full audit logging,
  // avatar handling, and real database queries. The routes file is kept for reference.
  // const hrRoutes = require('./routes/hr.routes');
  // app.use('/api/hr', hrRoutes);

  // ============ PAYROLL ROUTES ============
  const payrollRoutes = require('./routes/payroll.routes');
  app.use('/api/payroll', payrollRoutes);

  // ============ PROCUREMENT ROUTES ============
  const procurementRoutes = require('./routes/procurement.routes');
  app.use('/api', procurementRoutes);

  // ============ STORE LOCATION ROUTES ============
  const storeLocationRoutes = require('./routes/storeLocation.routes');
  app.use('/api/store-locations', storeLocationRoutes);

  // ============ STOCK TRANSFER ROUTES ============
  const stockTransferRoutes = require('./routes/stockTransfer.routes');
  app.use('/api/stock-transfers', stockTransferRoutes);

  // ============ STOCK MOVEMENT ROUTES ============
  const stockMovementRoutes = require('./routes/stockMovement.routes');
  app.use('/api/inventory-movements', stockMovementRoutes);

  // ============ INVENTORY ISSUE ROUTES ============
  const inventoryIssueRoutes = require('./routes/inventoryIssue.routes');
  app.use('/api/inventory-issues', inventoryIssueRoutes);

  // ============ INVOICE ROUTES ============
  const invoiceRoutes = require('./routes/invoice.routes');
  app.use('/api/invoices', invoiceRoutes);

  // ============ MAINTENANCE ROUTES ============
  const maintenanceRoutes = require('./routes/maintenance.routes');
  app.use('/api/maintenance', maintenanceRoutes);

  // ============ INCIDENT REPORT ROUTES ============
  const incidentReportRoutes = require('./routes/incidentReport.routes');
  app.use('/api/incident-reports', incidentReportRoutes);

  // ============ SKU ITEMS ROUTES ============
  const SkuItemModel = require('./models/SkuItem');
  const SkuCategoryModel = require('./models/SkuCategory');

  // Get SKU categories (active by default)
  app.get('/api/sku-categories', async (req, res) => {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const filter = activeOnly ? { isActive: true } : {};
      const categories = await SkuCategoryModel.find(filter).sort({ name: 1 });
      res.json(categories);
    } catch (err) {
      console.error('Error fetching SKU categories:', err);
      res.status(500).json({ message: 'Failed to fetch SKU categories' });
    }
  });

  // Create SKU category
  app.post('/api/sku-categories', async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      if (!name) {
        return res.status(400).json({ message: 'Category name is required' });
      }

      const existing = await SkuCategoryModel.findOne({ name: new RegExp(`^${name}$`, 'i') });
      if (existing) {
        if (!existing.isActive) {
          existing.isActive = true;
          await existing.save();
        }
        return res.status(200).json(existing);
      }

      const category = await SkuCategoryModel.create({ name, isActive: true });
      res.status(201).json(category);
    } catch (err) {
      console.error('Error creating SKU category:', err);
      res.status(500).json({ message: 'Failed to create SKU category' });
    }
  });

  // Get all SKU items (optionally filter by active)
  app.get('/api/sku-items', async (req, res) => {
    try {
      const filter = req.query.activeOnly === 'true' ? { isActive: true } : {};
      const items = await SkuItemModel.find(filter).sort({ name: 1 });
      res.json(items);
    } catch (err) {
      console.error('Error fetching SKU items:', err);
      res.status(500).json({ message: 'Failed to fetch SKU items' });
    }
  });

  // Create SKU item
  app.post('/api/sku-items', async (req, res) => {
    try {
      const categoryName = String(req.body?.category || '').trim();
      if (categoryName) {
        await SkuCategoryModel.findOneAndUpdate(
          { name: new RegExp(`^${categoryName}$`, 'i') },
          { $setOnInsert: { name: categoryName }, $set: { isActive: true } },
          { upsert: true, new: true },
        );
      }

      const item = await SkuItemModel.create(req.body);
      res.status(201).json(item);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ message: 'SKU code already exists' });
      }
      console.error('Error creating SKU item:', err);
      res.status(500).json({ message: 'Failed to create SKU item' });
    }
  });

  // Update SKU item
  app.put('/api/sku-items/:id', async (req, res) => {
    try {
      const categoryName = String(req.body?.category || '').trim();
      if (categoryName) {
        await SkuCategoryModel.findOneAndUpdate(
          { name: new RegExp(`^${categoryName}$`, 'i') },
          { $setOnInsert: { name: categoryName }, $set: { isActive: true } },
          { upsert: true, new: true },
        );
      }

      const item = await SkuItemModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!item) return res.status(404).json({ message: 'SKU item not found' });
      res.json(item);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ message: 'SKU code already exists' });
      }
      console.error('Error updating SKU item:', err);
      res.status(500).json({ message: 'Failed to update SKU item' });
    }
  });

  // Delete SKU item
  app.delete('/api/sku-items/:id', async (req, res) => {
    try {
      const item = await SkuItemModel.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ message: 'SKU item not found' });
      res.json({ message: 'SKU item deleted' });
    } catch (err) {
      console.error('Error deleting SKU item:', err);
      res.status(500).json({ message: 'Failed to delete SKU item' });
    }
  });

  // ============ MATERIAL REQUEST COMMENT ROUTES ============
  // Add comment to a material request
  app.post('/api/material-requests/:id/comments', authMiddleware, async (req, res) => {
    try {
      const request = await MaterialRequestModel.findById(req.params.id);
      if (!request) return res.status(404).json({ message: 'Request not found' });

      const { text } = req.body;
      if (!text || !text.trim()) return res.status(400).json({ message: 'Comment text is required' });

      const author = req.user?.fullName || req.user?.email || req.body?.author || 'Unknown';
      const authorId = String(req.user?._id || req.body?.authorId || '');

      const mentions = (text.match(/@(\w+\s?\w*)/g) || []).map(m => m.substring(1).trim());

      request.activities.push({
        type: 'comment',
        author,
        authorId,
        text,
        timestamp: new Date(),
      });

      await request.save();
      res.status(201).json(request);
    } catch (err) {
      console.error('Error adding comment:', err);
      res.status(500).json({ message: 'Failed to add comment' });
    }
  });


  // ============ INVENTORY ROUTES ============
  // Routes defined in ./routes/inventory.routes.js
  // Includes: authMiddleware, input validation, sequential IDs,
  //           soft delete, per-item reorderPoint, server-side pagination,
  //           restock-as-increment, and StockMovement audit logging.
  const inventoryRoutes = require('./routes/inventory.routes');
  app.use('/api/inventory', inventoryRoutes);

  // Models needed for Analytics aggregation
  const AttendanceModel = require('./models/Attendance');
  const LeaveRequestModel = require('./models/LeaveRequest');
  const TravelRequestModel = require('./models/TravelRequest');
  const PurchaseOrderModel = require('./models/PurchaseOrder');

  app.get('/api/analytics/reports', async (req, res) => {
    try {
      // 1. Attendance Data Aggregation
      let attendanceRecords = [];
      try {
        attendanceRecords = await AttendanceModel.find().lean();
      } catch(e) {}

      // Group attendance by week
      const attendanceData = [];
      if (attendanceRecords.length > 0) {
        // Sort by date and group into weeks
        const sorted = attendanceRecords.sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt));
        const weekSize = Math.ceil(sorted.length / 4) || 1;
        for (let i = 0; i < 4; i++) {
          const chunk = sorted.slice(i * weekSize, (i + 1) * weekSize);
          if (chunk.length === 0) break;
          const present = chunk.filter(a => (a.status || '').toLowerCase() === 'present').length;
          const absent = chunk.filter(a => (a.status || '').toLowerCase() === 'absent').length;
          const late = chunk.filter(a => (a.status || '').toLowerCase() === 'late').length;
          attendanceData.push({ name: `Week ${i + 1}`, present, absent, late });
        }
      }

      // 2. Approvals Aggregation (Leave, Travel, Purchase Orders)
      let leaves = [], travels = [], purchases = [];
      try {
        leaves = await LeaveRequestModel.find().lean();
        travels = await TravelRequestModel.find().lean();
        purchases = await PurchaseOrderModel.find().lean();
      } catch(e) {}

      const allRequests = [...leaves, ...travels, ...purchases];
      let approvedCount = 0;
      let pendingCount = 0;
      let rejectedCount = 0;

      allRequests.forEach(req => {
        const status = (req.status || '').toLowerCase();
        if (status.includes('approved')) approvedCount++;
        else if (status.includes('rejected')) rejectedCount++;
        else pendingCount++;
      });

      // Group approvals by quarter from actual data
      const approvalData = [];
      if (allRequests.length > 0) {
        const byQuarter = {};
        allRequests.forEach(req => {
          const date = new Date(req.createdAt || req.date || Date.now());
          const q = `Q${Math.ceil((date.getMonth() + 1) / 3)}`;
          if (!byQuarter[q]) byQuarter[q] = { approved: 0, rejected: 0, pending: 0 };
          const status = (req.status || '').toLowerCase();
          if (status.includes('approved')) byQuarter[q].approved++;
          else if (status.includes('rejected')) byQuarter[q].rejected++;
          else byQuarter[q].pending++;
        });
        ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
          if (byQuarter[q]) {
            approvalData.push({ name: q, ...byQuarter[q] });
          }
        });
      }

      // 3. Financials (Derived from Purchase Orders)
      const financialData = [];
      if (purchases.length > 0) {
        const byMonth = {};
        purchases.forEach(po => {
          const date = new Date(po.createdAt || po.date || Date.now());
          const monthName = date.toLocaleString('en-US', { month: 'short' });
          const key = `${date.getFullYear()}-${date.getMonth()}`;
          if (!byMonth[key]) byMonth[key] = { name: monthName, revenue: 0, expenses: 0 };
          const amount = Number(po.totalAmount || po.amount || 0);
          byMonth[key].expenses += amount;
          byMonth[key].revenue += Math.floor(amount * 1.35);
        });
        // Sort by date key and take up to 12 months
        Object.keys(byMonth).sort().slice(-12).forEach(key => {
          financialData.push(byMonth[key]);
        });
      }

      // 4. Facility Usage (from maintenance tickets)
      const facilityData = [];
      try {
        const MaintenanceTicketModel = require('./models/MaintenanceTicket');
        const tickets = await MaintenanceTicketModel.find().lean();
        if (tickets.length > 0) {
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const byDay = {};
          dayNames.forEach(d => { byDay[d] = { usage: 0, maintenance: 0 }; });
          tickets.forEach(t => {
            const date = new Date(t.createdAt || t.date || Date.now());
            const day = dayNames[date.getDay()];
            byDay[day].maintenance++;
            byDay[day].usage++;
          });
          ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(d => {
            if (byDay[d].usage > 0 || byDay[d].maintenance > 0) {
              facilityData.push({ name: d, ...byDay[d] });
            }
          });
        }
      } catch(e) {}

      // 5. Custom Report - Combined overview from all modules
      // Calculate attendance counts (needed by customData and stats)
      const totalAttendanceRecords = attendanceRecords.length;
      const presentCount = attendanceRecords.filter(a => (a.status || '').toLowerCase() === 'present').length;
      const absentCount = attendanceRecords.filter(a => (a.status || '').toLowerCase() === 'absent').length;
      const lateCount = attendanceRecords.filter(a => (a.status || '').toLowerCase() === 'late').length;

      const customData = [];
      const moduleDetails = {};

      // Attendance summary
      if (attendanceRecords.length > 0) {
        customData.push({
          name: 'Attendance',
          total: attendanceRecords.length,
          active: presentCount,
          issues: absentCount + lateCount
        });
        moduleDetails.Attendance = {
          stats: [
            { label: 'Total Records', value: attendanceRecords.length, icon: 'fa-database', color: 'blue' },
            { label: 'Present', value: presentCount, icon: 'fa-user-check', color: 'green' },
            { label: 'Absent', value: absentCount, icon: 'fa-user-xmark', color: 'red' },
            { label: 'Late', value: lateCount, icon: 'fa-clock', color: 'orange' },
          ],
          rate: attendanceRecords.length > 0 ? ((presentCount / attendanceRecords.length) * 100).toFixed(1) + '%' : '0%',
          rateLabel: 'Attendance Rate'
        };
      }
      // Approvals summary
      if (allRequests.length > 0) {
        customData.push({
          name: 'Approvals',
          total: allRequests.length,
          active: approvedCount,
          issues: rejectedCount + pendingCount
        });
        moduleDetails.Approvals = {
          stats: [
            { label: 'Total Requests', value: allRequests.length, icon: 'fa-file-lines', color: 'blue' },
            { label: 'Approved', value: approvedCount, icon: 'fa-circle-check', color: 'green' },
            { label: 'Pending', value: pendingCount, icon: 'fa-hourglass-half', color: 'orange' },
            { label: 'Rejected', value: rejectedCount, icon: 'fa-circle-xmark', color: 'red' },
          ],
          rate: allRequests.length > 0 ? ((approvedCount / allRequests.length) * 100).toFixed(1) + '%' : '0%',
          rateLabel: 'Approval Rate'
        };
      }
      // Financial summary
      if (purchases.length > 0) {
        const finApproved = purchases.filter(p => (p.status || '').toLowerCase().includes('approved')).length;
        const finRejected = purchases.filter(p => (p.status || '').toLowerCase().includes('rejected')).length;
        const finPending = purchases.length - finApproved - finRejected;
        let finTotalAmount = 0;
        purchases.forEach(p => { finTotalAmount += Number(p.totalAmount || p.amount || 0); });
        customData.push({
          name: 'Finance',
          total: purchases.length,
          active: finApproved,
          issues: finRejected
        });
        moduleDetails.Finance = {
          stats: [
            { label: 'Purchase Orders', value: purchases.length, icon: 'fa-file-invoice-dollar', color: 'blue' },
            { label: 'Total Amount', value: '$' + finTotalAmount.toLocaleString(), icon: 'fa-dollar-sign', color: 'green' },
            { label: 'Approved', value: finApproved, icon: 'fa-circle-check', color: 'green' },
            { label: 'Pending', value: finPending, icon: 'fa-hourglass-half', color: 'orange' },
          ],
          rate: purchases.length > 0 ? ((finApproved / purchases.length) * 100).toFixed(1) + '%' : '0%',
          rateLabel: 'Approval Rate'
        };
      }
      // Leave requests
      if (leaves.length > 0) {
        const leaveApproved = leaves.filter(l => (l.status || '').toLowerCase().includes('approved')).length;
        const leaveRejected = leaves.filter(l => (l.status || '').toLowerCase().includes('rejected')).length;
        const leavePending = leaves.length - leaveApproved - leaveRejected;
        customData.push({
          name: 'Leave',
          total: leaves.length,
          active: leaveApproved,
          issues: leaveRejected
        });
        moduleDetails.Leave = {
          stats: [
            { label: 'Total Requests', value: leaves.length, icon: 'fa-person-walking-arrow-right', color: 'blue' },
            { label: 'Approved', value: leaveApproved, icon: 'fa-circle-check', color: 'green' },
            { label: 'Pending', value: leavePending, icon: 'fa-hourglass-half', color: 'orange' },
            { label: 'Rejected', value: leaveRejected, icon: 'fa-circle-xmark', color: 'red' },
          ],
          rate: leaves.length > 0 ? ((leaveApproved / leaves.length) * 100).toFixed(1) + '%' : '0%',
          rateLabel: 'Approval Rate'
        };
      }
      // Travel requests
      if (travels.length > 0) {
        const travelApproved = travels.filter(t => (t.status || '').toLowerCase().includes('approved')).length;
        const travelRejected = travels.filter(t => (t.status || '').toLowerCase().includes('rejected')).length;
        const travelPending = travels.length - travelApproved - travelRejected;
        customData.push({
          name: 'Travel',
          total: travels.length,
          active: travelApproved,
          issues: travelRejected
        });
        moduleDetails.Travel = {
          stats: [
            { label: 'Total Requests', value: travels.length, icon: 'fa-plane', color: 'blue' },
            { label: 'Approved', value: travelApproved, icon: 'fa-circle-check', color: 'green' },
            { label: 'Pending', value: travelPending, icon: 'fa-hourglass-half', color: 'orange' },
            { label: 'Rejected', value: travelRejected, icon: 'fa-circle-xmark', color: 'red' },
          ],
          rate: travels.length > 0 ? ((travelApproved / travels.length) * 100).toFixed(1) + '%' : '0%',
          rateLabel: 'Approval Rate'
        };
      }
      // Material requests
      try {
        const MaterialRequestModelCustom = require('./models/MaterialRequest');
        const materialReqs = await MaterialRequestModelCustom.find().lean();
        if (materialReqs.length > 0) {
          const matApproved = materialReqs.filter(m => (m.status || '').toLowerCase() === 'approved').length;
          const matRejected = materialReqs.filter(m => (m.status || '').toLowerCase() === 'rejected').length;
          const matPending = materialReqs.length - matApproved - matRejected;
          customData.push({
            name: 'Materials',
            total: materialReqs.length,
            active: matApproved,
            issues: matRejected
          });
          moduleDetails.Materials = {
            stats: [
              { label: 'Total Requests', value: materialReqs.length, icon: 'fa-boxes-stacked', color: 'blue' },
              { label: 'Approved', value: matApproved, icon: 'fa-circle-check', color: 'green' },
              { label: 'Pending', value: matPending, icon: 'fa-hourglass-half', color: 'orange' },
              { label: 'Rejected', value: matRejected, icon: 'fa-circle-xmark', color: 'red' },
            ],
            rate: materialReqs.length > 0 ? ((matApproved / materialReqs.length) * 100).toFixed(1) + '%' : '0%',
            rateLabel: 'Fulfillment Rate'
          };
        }
      } catch(e) {}

      // Calculate Stats from real data
      const avgAttendance = totalAttendanceRecords > 0 ? ((presentCount / totalAttendanceRecords) * 100).toFixed(1) + '%' : '0%';

      // Get total employees count
      let totalEmployees = 0;
      try {
        const EmployeeModel = require('./models/Employee');
        totalEmployees = await EmployeeModel.countDocuments({ status: 'Active' });
      } catch(e) {}

      // Calculate financial metrics from real data
      let totalExpenses = 0;
      purchases.forEach(po => {
        totalExpenses += Number(po.totalAmount || po.amount || 0);
      });
      const totalRevenue = Math.floor(totalExpenses * 1.35);
      const netProfit = totalRevenue - totalExpenses;
      const avgTransaction = allRequests.length > 0 ? Math.floor(totalExpenses / allRequests.length) : 0;

      // Get total reports count
      let reportCount = 0;
      try {
        const ReportModel = require('./models/Report');
        reportCount = await ReportModel.countDocuments();
      } catch(e) {}

      // Calculate facility usage from material requests
      let facilityUsagePercent = "0%";
      let facilityChange = "No data";
      try {
        const MaterialRequestModel = require('./models/MaterialRequest');
        const materialRequests = await MaterialRequestModel.find().lean();
        if (materialRequests.length > 0) {
          const approvedRequests = materialRequests.filter(mr => (mr.status || '').toLowerCase() === 'approved').length;
          facilityUsagePercent = ((approvedRequests / materialRequests.length) * 100).toFixed(0) + '%';
          facilityChange = `${materialRequests.length} total requests`;
        }
      } catch(e) {}

      const totalApprovals = allRequests.length;
      const rejectionRate = totalApprovals > 0 ? ((rejectedCount / totalApprovals) * 100).toFixed(1) + '%' : '0%';

      const stats = {
        totalReports: reportCount,
        reportsGrowth: reportCount > 0 ? `${reportCount} report${reportCount !== 1 ? 's' : ''} generated` : "No reports yet",
        pendingApprovals: pendingCount,
        approvalStatus: pendingCount > 0 ? `${pendingCount} awaiting review` : "No pending items",
        totalApprovals: totalApprovals,
        rejectionRate: rejectionRate,
        facilityUsage: facilityUsagePercent,
        usageChange: facilityChange,
        financialRevenue: totalRevenue > 0 ? "$" + totalRevenue.toLocaleString() : "$0",
        financialExpenses: totalExpenses > 0 ? "$" + totalExpenses.toLocaleString() : "$0",
        netProfit: netProfit !== 0 ? "$" + netProfit.toLocaleString() : "$0",
        avgTransaction: avgTransaction > 0 ? "$" + avgTransaction.toLocaleString() : "$0",
        avgAttendance: avgAttendance,
        totalAbsences: absentCount,
        lateArrivals: lateCount,
        totalEmployees: totalEmployees,
        avgProcessingTime: totalApprovals > 0 ? "Calculating..." : "N/A",
        slaStatus: totalApprovals > 0 ? "Active" : "No data"
      };

      res.json({
        success: true,
        data: {
          attendanceData,
          approvalData,
          financialData,
          facilityData,
          customData,
          moduleDetails,
          stats
        }
      });
    } catch (error) {
      console.error('Analytics aggregation error:', error);
      res.status(500).json({ success: false, error: 'Failed to aggregate analytics reports' });
    }
  });

  app.get('/api/analytics', async (req, res) => {
    const a = await api.getAnalytics();
    res.json(a || {});
  });

  // Report Management Endpoints
  const ReportModel = require('./models/Report');

  // Get all reports with filters
  app.get('/api/reports', async (req, res) => {
    try {
      const { reportType, status, department, startDate, endDate, search, includeDrafts } = req.query;
      
      let query = {};
      
      if (status && status !== 'All') {
        query.status = status;
      } else if (!includeDrafts || includeDrafts === 'false') {
        // Exclude Processing (draft) reports unless checkbox is checked
        query.status = { $ne: 'Processing' };
      }
      
      if (reportType && reportType !== 'All') {
        query.reportType = reportType;
      }
      
      if (department && department !== 'All Departments') {
        query.department = department;
      }
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { reportType: { $regex: search, $options: 'i' } },
          { module: { $regex: search, $options: 'i' } }
        ];
      }
      
      const reports = await ReportModel.find(query)
        .sort({ createdAt: -1 })
        .lean();
      
      res.json({ success: true, reports });
    } catch (error) {
      console.error('Error fetching reports:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch reports' });
    }
  });

  // Get single report by ID
  app.get('/api/reports/:id', async (req, res) => {
    try {
      const report = await ReportModel.findById(req.params.id).lean();
      
      if (!report) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }
      
      res.json({ success: true, report });
    } catch (error) {
      console.error('Error fetching report:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch report' });
    }
  });

  // Generate/Create a new report
  app.post('/api/reports', async (req, res) => {
    try {
      const { name, reportType, department, startDate, endDate, includeDrafts, generatedBy } = req.body;
      
      // Report type metadata mapping
      const reportTypeMetadata = {
        'Facility Usage Report': {
          module: 'Facility Mgmt',
          icon: 'fa-building',
          iconColor: 'bg-blue-100 text-blue-600'
        },
        'Financial Report': {
          module: 'Financials',
          icon: 'fa-dollar-sign',
          iconColor: 'bg-purple-100 text-purple-600'
        },
        'Attendance Report': {
          module: 'HR & Admin',
          icon: 'fa-users',
          iconColor: 'bg-orange-100 text-orange-600'
        },
        'Approval Statistics': {
          module: 'Approvals',
          icon: 'fa-thumbs-up',
          iconColor: 'bg-green-100 text-green-600'
        },
        'Custom Report': {
          module: 'Custom',
          icon: 'fa-file-alt',
          iconColor: 'bg-gray-100 text-gray-600'
        },
        'Procurement Performance Report': {
          module: 'Procurement',
          icon: 'fa-cart-shopping',
          iconColor: 'bg-amber-100 text-amber-700'
        },
        'Inventory Health Report': {
          module: 'Inventory',
          icon: 'fa-boxes-stacked',
          iconColor: 'bg-emerald-100 text-emerald-700'
        },
        'Vendor Performance Report': {
          module: 'Vendor Management',
          icon: 'fa-building-user',
          iconColor: 'bg-indigo-100 text-indigo-700'
        },
        'Workforce Insights Report': {
          module: 'HR & Admin',
          icon: 'fa-people-group',
          iconColor: 'bg-rose-100 text-rose-700'
        },
        'Accounts Payable Aging Report': {
          module: 'Finance',
          icon: 'fa-file-invoice-dollar',
          iconColor: 'bg-cyan-100 text-cyan-700'
        },
        'Payroll Variance Report': {
          module: 'HR & Payroll',
          icon: 'fa-money-check-dollar',
          iconColor: 'bg-lime-100 text-lime-700'
        },
        'Security Incident Report': {
          module: 'Physical Security',
          icon: 'fa-shield-halved',
          iconColor: 'bg-red-100 text-red-700'
        }
      };
      
      // Get metadata for the report type or use defaults
      const metadata = reportTypeMetadata[reportType] || {
        module: 'General',
        icon: 'fa-chart-bar',
        iconColor: 'bg-blue-100 text-blue-600'
      };

      // Build date filter for aggregation
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      const hasDateFilter = Object.keys(dateFilter).length > 0;

      // Aggregate real data based on report type
      let reportData = {};

      if (reportType === 'Attendance Report') {
        const query = hasDateFilter ? { date: dateFilter } : {};
        const records = await AttendanceModel.find(query).lean();
        const present = records.filter(r => (r.status || '').toLowerCase() === 'present').length;
        const absent = records.filter(r => (r.status || '').toLowerCase() === 'absent').length;
        const late = records.filter(r => (r.status || '').toLowerCase() === 'late').length;
        reportData = {
          totalRecords: records.length,
          present,
          absent,
          late,
          attendanceRate: records.length > 0 ? ((present / records.length) * 100).toFixed(1) + '%' : '0%',
          summary: records.length > 0
            ? `${records.length} attendance records found. ${present} present, ${absent} absent, ${late} late.`
            : 'No attendance records found for the selected period.'
        };
      } else if (reportType === 'Financial Report') {
        const query = hasDateFilter ? { createdAt: dateFilter } : {};
        const purchases = await PurchaseOrderModel.find(query).lean();
        let totalExpenses = 0;
        purchases.forEach(po => { totalExpenses += Number(po.totalAmount || po.amount || 0); });
        reportData = {
          totalPurchaseOrders: purchases.length,
          totalExpenses,
          avgOrderValue: purchases.length > 0 ? Math.floor(totalExpenses / purchases.length) : 0,
          summary: purchases.length > 0
            ? `${purchases.length} purchase orders totaling $${totalExpenses.toLocaleString()}.`
            : 'No financial records found for the selected period.'
        };
      } else if (reportType === 'Approval Statistics') {
        const query = hasDateFilter ? { createdAt: dateFilter } : {};
        const leaves = await LeaveRequestModel.find(query).lean();
        const travels = await TravelRequestModel.find(query).lean();
        const purchases = await PurchaseOrderModel.find(query).lean();
        const allReqs = [...leaves, ...travels, ...purchases];
        let approved = 0, pending = 0, rejected = 0;
        allReqs.forEach(r => {
          const s = (r.status || '').toLowerCase();
          if (s.includes('approved')) approved++;
          else if (s.includes('rejected')) rejected++;
          else pending++;
        });
        reportData = {
          totalRequests: allReqs.length,
          approved,
          pending,
          rejected,
          approvalRate: allReqs.length > 0 ? ((approved / allReqs.length) * 100).toFixed(1) + '%' : '0%',
          leaveRequests: leaves.length,
          travelRequests: travels.length,
          purchaseOrders: purchases.length,
          summary: allReqs.length > 0
            ? `${allReqs.length} requests: ${approved} approved, ${pending} pending, ${rejected} rejected.`
            : 'No approval records found for the selected period.'
        };
      } else if (reportType === 'Facility Usage Report') {
        try {
          const MaterialRequestModel = require('./models/MaterialRequest');
          const query = hasDateFilter ? { createdAt: dateFilter } : {};
          const materialRequests = await MaterialRequestModel.find(query).lean();
          const approvedMR = materialRequests.filter(mr => (mr.status || '').toLowerCase() === 'approved').length;
          reportData = {
            totalMaterialRequests: materialRequests.length,
            approvedRequests: approvedMR,
            pendingRequests: materialRequests.filter(mr => (mr.status || '').toLowerCase() === 'pending').length,
            summary: materialRequests.length > 0
              ? `${materialRequests.length} material requests, ${approvedMR} approved.`
              : 'No facility usage records found for the selected period.'
          };
        } catch(e) {
          reportData = { summary: 'No facility usage data available.' };
        }
      } else {
        reportData = { summary: 'Custom report generated. No specific data aggregation configured.' };
      }
      
      const report = await ReportModel.create({
        name: name || `${reportType} - ${new Date().toLocaleDateString()}`,
        reportType,
        module: metadata.module,
        department: department || 'All Departments',
        startDate,
        endDate,
        includeDrafts: includeDrafts || false,
        generatedBy: generatedBy || 'System',
        status: 'Processing',
        icon: metadata.icon,
        iconColor: metadata.iconColor,
        data: reportData
      });
      
      // Mark as Ready after processing
      setTimeout(async () => {
        try {
          await ReportModel.findByIdAndUpdate(report._id, { status: 'Ready' });
        } catch (err) {
          console.error('Error updating report status:', err);
        }
      }, 2000);
      
      res.status(201).json({ success: true, report });
    } catch (error) {
      console.error('Error creating report:', error);
      res.status(500).json({ success: false, error: 'Failed to generate report' });
    }
  });

  // Delete a report
  app.delete('/api/reports/:id', async (req, res) => {
    try {
      const report = await ReportModel.findByIdAndDelete(req.params.id);
      
      if (!report) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }
      
      res.json({ success: true, message: 'Report deleted successfully' });
    } catch (error) {
      console.error('Error deleting report:', error);
      res.status(500).json({ success: false, error: 'Failed to delete report' });
    }
  });

  // Archive a report
  app.patch('/api/reports/:id/archive', async (req, res) => {
    try {
      const report = await ReportModel.findByIdAndUpdate(
        req.params.id,
        { status: 'Archived' },
        { new: true }
      );
      
      if (!report) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }
      
      res.json({ success: true, report });
    } catch (error) {
      console.error('Error archiving report:', error);
      res.status(500).json({ success: false, error: 'Failed to archive report' });
    }
  });

  // Get available report types with metadata
  app.get('/api/reports/types/available', async (req, res) => {
    try {
      const reportTypes = [
        {
          value: 'Facility Usage Report',
          label: 'Facility Usage Report',
          module: 'Facility Mgmt',
          icon: 'fa-building',
          iconColor: 'bg-blue-100 text-blue-600',
          description: 'Track and analyze facility usage across different locations and time periods'
        },
        {
          value: 'Financial Report',
          label: 'Financial Report',
          module: 'Financials',
          icon: 'fa-dollar-sign',
          iconColor: 'bg-purple-100 text-purple-600',
          description: 'Generate comprehensive financial reports including revenue, expenses, and budgets'
        },
        {
          value: 'Attendance Report',
          label: 'Attendance Report',
          module: 'HR & Admin',
          icon: 'fa-users',
          iconColor: 'bg-orange-100 text-orange-600',
          description: 'Monitor employee attendance patterns, absences, and late arrivals'
        },
        {
          value: 'Approval Statistics',
          label: 'Approval Statistics',
          module: 'Approvals',
          icon: 'fa-thumbs-up',
          iconColor: 'bg-green-100 text-green-600',
          description: 'Analyze approval workflows, pending requests, and processing times'
        },
        {
          value: 'Custom Report',
          label: 'Custom Report',
          module: 'Custom',
          icon: 'fa-file-alt',
          iconColor: 'bg-gray-100 text-gray-600',
          description: 'Create custom reports based on specific criteria and data points'
        },
        {
          value: 'Procurement Performance Report',
          label: 'Procurement Performance Report',
          module: 'Procurement',
          icon: 'fa-cart-shopping',
          iconColor: 'bg-amber-100 text-amber-700',
          description: 'Track purchase flow performance, approvals, and spending trends across procurement.'
        },
        {
          value: 'Inventory Health Report',
          label: 'Inventory Health Report',
          module: 'Inventory',
          icon: 'fa-boxes-stacked',
          iconColor: 'bg-emerald-100 text-emerald-700',
          description: 'Monitor inventory stock levels, movement patterns, and expiry risk indicators.'
        },
        {
          value: 'Vendor Performance Report',
          label: 'Vendor Performance Report',
          module: 'Vendor Management',
          icon: 'fa-building-user',
          iconColor: 'bg-indigo-100 text-indigo-700',
          description: 'Evaluate vendor activity, payment progress, and service delivery signals.'
        },
        {
          value: 'Workforce Insights Report',
          label: 'Workforce Insights Report',
          module: 'HR & Admin',
          icon: 'fa-people-group',
          iconColor: 'bg-rose-100 text-rose-700',
          description: 'Analyze workforce attendance, approvals, and staffing activity from HR operations.'
        },
        {
          value: 'Accounts Payable Aging Report',
          label: 'Accounts Payable Aging Report',
          module: 'Finance',
          icon: 'fa-file-invoice-dollar',
          iconColor: 'bg-cyan-100 text-cyan-700',
          description: 'Track unpaid and partly paid purchase orders by aging buckets and outstanding balances.'
        },
        {
          value: 'Payroll Variance Report',
          label: 'Payroll Variance Report',
          module: 'HR & Payroll',
          icon: 'fa-money-check-dollar',
          iconColor: 'bg-lime-100 text-lime-700',
          description: 'Compare payroll amounts across periods and surface variances in compensation trends.'
        },
        {
          value: 'Security Incident Report',
          label: 'Security Incident Report',
          module: 'Physical Security',
          icon: 'fa-shield-halved',
          iconColor: 'bg-red-100 text-red-700',
          description: 'Summarize incident logs, access anomalies, and response timelines for security teams.'
        }
      ];
      
      res.json({ success: true, reportTypes });
    } catch (error) {
      console.error('Error fetching report types:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch report types' });
    }
  });

  const SystemSettingsModel = require('./models/SystemSettings');
  const axios = require('axios');
  
  let localAttendanceRecords = [];

  app.post('/api/attendance', async (req, res) => {
    try {
      const { name, employeeId, status } = req.body;
      const newRecord = {
        name: name || 'Demo User',
        employeeId: employeeId || 'EMP-1337',
        status: status || 'present',
        checkInTime: new Date()
      };
      // Keep only most recent 50 records to prevent memory leak
      localAttendanceRecords.unshift(newRecord);
      if (localAttendanceRecords.length > 50) localAttendanceRecords.pop();

      res.status(201).json({ message: 'Attendance marked', record: newRecord });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to mark attendance' });
    }
  });

  app.get('/api/attendance', async (req, res) => {
    try {
      const settings = await SystemSettingsModel.findOne();
      const apiKey = settings?.attendanceApiKey;

      if (apiKey) {
        const endpoints = [
          'https://attendance-app-swart-iota.vercel.app/api/attendance',
          'https://attendance-app-swart-iota.vercel.app/api/hr/employees',
          'https://attendance-app-swart-iota.vercel.app/attendance',
          'https://attendance-app-swart-iota.vercel.app/'
        ];

        for (const url of endpoints) {
          try {
            const response = await axios.get(url, {
              headers: { 'x-api-key': apiKey },
              timeout: 5000 // 5 seconds timeout
            });
            if (response.data) {
              return res.json(response.data);
            }
          } catch (err) {
            // Ignore errors for individual endpoints, move to next
            console.log(`Endpoint ${url} failed: ${err.message}`);
          }
        }
        
        console.error('All external attendance endpoints failed.');
      }
    } catch (error) {
      console.error('Error in external attendance proxy:', error.message);
    }
    
    // Remote fetch failed or no API key. Fall back to local volatile session records.
    const presentCount = localAttendanceRecords.filter(r => r.status === 'present' || r.status === 'on-time').length;
    const leaveCount = localAttendanceRecords.filter(r => r.status === 'leave' || r.status === 'on-leave').length;
    const absentCount = localAttendanceRecords.filter(r => r.status === 'absent').length;
    const lateCount = localAttendanceRecords.filter(r => r.status === 'late').length;

    res.json({ 
      records: localAttendanceRecords, 
      totalEmployees: localAttendanceRecords.length,
      presentCount,
      leaveCount,
      absentCount,
      lateCount
    });
  });

  // Material Requests endpoints
  app.get('/api/material-requests', async (req, res) => {
    try {
      const requests = await MaterialRequestModel.find().sort({ createdAt: -1 });
      res.json(requests);
    } catch (err) {
      console.error('Error fetching material requests:', err);
      res.status(500).json({ message: 'Failed to fetch requests' });
    }
  });

  app.post('/api/material-requests', async (req, res) => {
    try {
      // Generate request ID with format MR-YYYY-MM-DD-COUNT
      const count = await MaterialRequestModel.countDocuments();
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const requestId = `MR-${year}-${month}-${day}-${String(count + 1).padStart(3, '0')}`;
      
      // Calculate total amount from line items for rule matching
      const totalAmount = req.body.lineItems?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
      
      // Prepare request data for approval rule matching
      const requestData = {
        ...req.body,
        requestId,
        amount: totalAmount,
        employeeId: req.body.requestedBy, // For manager lookup
      };
      
      // Try to build approval chain from rules
      const approvalInfo = await buildApprovalChain('Material Requests', requestData);
      
      // If rule-based approval is available, use it
      if (approvalInfo.usesRuleBasedApproval && approvalInfo.approvalChain.length > 0) {
        requestData.usesRuleBasedApproval = true;
        requestData.approvalRuleId = approvalInfo.rule._id;
        requestData.approvalChain = approvalInfo.approvalChain;
        requestData.currentApprovalLevel = 1;
        requestData.status = 'pending';
        
        // Get first approver from chain
        const firstApprover = approvalInfo.approvalChain[0];
        requestData.approver = firstApprover.approverName;
      }
      
      const newRequest = await MaterialRequestModel.create(requestData);
      
      // Add initial activity for request creation
      const initialActivity = {
        type: 'created',
        author: req.body.requestedBy || 'System',
        text: `Request ${requestId} was created`,
        timestamp: new Date(),
      };
      newRequest.activities.push(initialActivity);
      
      // If there's a message/comment, add it as the first comment and activity
      if (req.body.message && req.body.message.trim()) {
        const mentions = (req.body.message.match(/@(\w+\s?\w*)/g) || []).map(m => m.substring(1).trim());
        const comment = {
          author: req.body.requestedBy || 'Unknown',
          text: req.body.message,
          timestamp: new Date(),
          mentions,
        };
        newRequest.comments.push(comment);
        newRequest.activities.push({
          type: 'comment',
          author: req.body.requestedBy || 'Unknown',
          text: req.body.message,
          timestamp: new Date(),
        });
      }
      
      await newRequest.save();
      
      // Send approval email to current approver
      if (newRequest.usesRuleBasedApproval && newRequest.approvalChain.length > 0) {
        const currentApprover = newRequest.approvalChain.find(a => a.status === 'pending');
        if (currentApprover) {
          await sendApprovalEmail({
            ...newRequest.toObject(),
            approver: currentApprover.approverName,
            approverEmail: currentApprover.approverEmail
          });
        }
      } else if (newRequest.approver) {
        await sendApprovalEmail(newRequest);
      }
      
      res.status(201).json({ message: 'Request created and email sent', data: newRequest });
    } catch (err) {
      console.error('Error creating material request:', err);
      res.status(500).json({ message: 'Failed to create request' });
    }
  });

  // Approve material request and create PO
  app.post('/api/material-requests/:id/approve', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid request id' });
      }

      const materialRequest = await MaterialRequestModel.findById(id);
      if (!materialRequest) {
        return res.status(404).json({ message: 'Request not found' });
      }

      if (materialRequest.status === 'approved') {
        return res.status(400).json({ message: 'Request is already approved' });
      }

      if (materialRequest.status === 'rejected') {
        return res.status(400).json({ message: 'Rejected request cannot be approved' });
      }

      const actorId = String(req.user?._id || '');
      const actorEmail = String(req.user?.email || '').toLowerCase();
      const actorName = String(
        req.user?.fullName || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || req.user?.email || ''
      ).trim().toLowerCase();

      const pendingStep = Array.isArray(materialRequest.approvalChain)
        ? materialRequest.approvalChain.find((step) => step?.status === 'pending')
        : null;

      const pendingStepApproverId = String(pendingStep?.approverId || '').trim();
      const pendingStepApproverEmail = String(pendingStep?.approverEmail || '').toLowerCase().trim();
      const pendingStepApproverName = String(pendingStep?.approverName || '').toLowerCase().trim();
      const requestApproverName = String(materialRequest.approver || '').toLowerCase().trim();

      const isPendingStepApprover = !!pendingStep && (
        (pendingStepApproverId && pendingStepApproverId === actorId) ||
        (pendingStepApproverEmail && pendingStepApproverEmail === actorEmail) ||
        (pendingStepApproverName && pendingStepApproverName === actorName)
      );

      const isSingleApprover = !pendingStep && (
        (materialRequest.approverEmail && String(materialRequest.approverEmail).toLowerCase() === actorEmail) ||
        (requestApproverName && requestApproverName === actorName)
      );

      const isAdminOverride = String(req.user?.role || '').toLowerCase() === 'admin';

      if (!isPendingStepApprover && !isSingleApprover && !isAdminOverride) {
        return res.status(403).json({ message: 'Only the assigned approver can approve this request' });
      }

      // Rule-based flow: mark current level approved and route to next approver.
      if (pendingStep) {
        pendingStep.status = 'approved';
        pendingStep.approvedAt = new Date();
        if (req.body?.comments) {
          pendingStep.comments = String(req.body.comments);
        }

        const nextStep = materialRequest.approvalChain.find((step) => step?.status === 'awaiting');
        if (nextStep) {
          nextStep.status = 'pending';
          materialRequest.currentApprovalLevel = nextStep.level || materialRequest.currentApprovalLevel;
          materialRequest.approver = nextStep.approverName || materialRequest.approver;

          materialRequest.activities.push({
            type: 'approval',
            author: req.user?.fullName || req.user?.email || 'System',
            authorId: actorId,
            text: `approved level ${pendingStep.level || materialRequest.currentApprovalLevel || 1}. Pending ${nextStep.approverName || 'next approver'}`,
            timestamp: new Date(),
            approvalLevel: pendingStep.level || materialRequest.currentApprovalLevel || 1,
            pendingApprover: nextStep.approverName || '',
          });

          await materialRequest.save();

          if (nextStep.approverEmail) {
            await sendApprovalEmail({
              ...materialRequest.toObject(),
              approver: nextStep.approverName,
              approverEmail: nextStep.approverEmail,
            });
          }

          return res.json({
            message: 'Approval recorded and forwarded to next approver',
            data: materialRequest,
          });
        }
      }

      // Update material request status
      materialRequest.status = 'approved';
      materialRequest.activities.push({
        type: 'approval',
        author: req.user?.fullName || req.user?.email || 'System',
        authorId: actorId,
        text: 'approved the material request',
        timestamp: new Date(),
        approvalLevel: pendingStep?.level || materialRequest.currentApprovalLevel || 1,
      });
      await materialRequest.save();

      // Auto-create Purchase Order
      const poCount = await PurchaseOrderModel.countDocuments();
      const poNumber = `PO-${String(poCount + 1).padStart(6, '0')}`;

      // Map line items from material request to PO format
      const lineItems = materialRequest.lineItems.map(item => ({
        itemName: item.itemName,
        description: item.description || '',
        quantity: parseFloat(item.quantity) || 0,
        quantityType: item.quantityType || 'Units',
        amount: parseFloat(item.amount) || 0,
      }));

      const totalAmount = lineItems.reduce(
        (sum, item) => sum + (item.quantity * item.amount),
        0,
      );

      const purchaseOrder = await PurchaseOrderModel.create({
        poNumber,
        vendor: req.body.vendor || 'To be assigned',
        orderDate: new Date().toISOString().split('T')[0],
        expectedDelivery: materialRequest.requiredByDate || null,
        status: 'draft',
        lineItems,
        currency: materialRequest.currency || 'NGN',
        exchangeRateToNgn: Number(materialRequest.exchangeRateToNgn) || 1,
        totalAmount,
        totalAmountNgn:
          totalAmount * (Number(materialRequest.exchangeRateToNgn) || 1),
        notes: materialRequest.message || '',
        linkedMaterialRequestId: materialRequest._id,
        activities: [
          {
            type: 'created',
            author: materialRequest.requestedBy || 'System',
            text: `Purchase Order ${poNumber} auto-created from Material Request ${materialRequest.requestId}`,
            timestamp: new Date(),
          },
        ],
      });

      materialRequest.activities.push({
        type: 'po_created',
        author: req.user?.fullName || req.user?.email || 'System',
        authorId: actorId,
        text: 'created Purchase Order',
        timestamp: new Date(),
        poId: purchaseOrder._id,
        poNumber: purchaseOrder.poNumber,
      });
      await materialRequest.save();

      // PO created for procurement team review (no email sent)

      res.json({ 
        message: 'Request approved and PO created',
        materialRequest,
        purchaseOrder 
      });
    } catch (err) {
      console.error('Error approving material request:', err);
      res.status(500).json({ message: 'Failed to approve request', error: err.message });
    }
  });

  // Reject material request
  app.post('/api/material-requests/:id/reject', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid request id' });
      }

      const reason = (req.body && req.body.reason) ? req.body.reason : '';
      const materialRequest = await MaterialRequestModel.findById(id);
      if (!materialRequest) return res.status(404).json({ message: 'Request not found' });

      if (materialRequest.status === 'approved') {
        return res.status(400).json({ message: 'Approved request cannot be rejected' });
      }

      const actorId = String(req.user?._id || '');
      const actorEmail = String(req.user?.email || '').toLowerCase();
      const actorName = String(
        req.user?.fullName || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || req.user?.email || ''
      ).trim().toLowerCase();

      const pendingStep = Array.isArray(materialRequest.approvalChain)
        ? materialRequest.approvalChain.find((step) => step?.status === 'pending')
        : null;

      const pendingStepApproverId = String(pendingStep?.approverId || '').trim();
      const pendingStepApproverEmail = String(pendingStep?.approverEmail || '').toLowerCase().trim();
      const pendingStepApproverName = String(pendingStep?.approverName || '').toLowerCase().trim();
      const requestApproverName = String(materialRequest.approver || '').toLowerCase().trim();

      const isPendingStepApprover = !!pendingStep && (
        (pendingStepApproverId && pendingStepApproverId === actorId) ||
        (pendingStepApproverEmail && pendingStepApproverEmail === actorEmail) ||
        (pendingStepApproverName && pendingStepApproverName === actorName)
      );

      const isSingleApprover = !pendingStep && (
        (materialRequest.approverEmail && String(materialRequest.approverEmail).toLowerCase() === actorEmail) ||
        (requestApproverName && requestApproverName === actorName)
      );

      const isAdminOverride = String(req.user?.role || '').toLowerCase() === 'admin';

      if (!isPendingStepApprover && !isSingleApprover && !isAdminOverride) {
        return res.status(403).json({ message: 'Only the assigned approver can reject this request' });
      }

      if (pendingStep) {
        pendingStep.status = 'rejected';
        pendingStep.approvedAt = new Date();
        pendingStep.comments = reason || pendingStep.comments || '';
      }

      materialRequest.status = 'rejected';
      materialRequest.rejectionReason = reason;
      materialRequest.activities.push({
        type: 'rejection',
        author: req.user?.fullName || req.user?.email || 'System',
        authorId: actorId,
        text: reason ? `rejected the request: ${reason}` : 'rejected the request',
        timestamp: new Date(),
        approvalLevel: pendingStep?.level || materialRequest.currentApprovalLevel || 1,
      });

      const updated = await materialRequest.save();
      if (!updated) return res.status(404).json({ message: 'Request not found' });
      res.json({ message: 'Request rejected', data: updated });
    } catch (err) {
      console.error('Error rejecting material request:', err);
      res.status(500).json({ message: 'Failed to reject request', error: err.message });
    }
  });

  app.put('/api/material-requests/:id', async (req, res) => {
    try {
      const updated = await MaterialRequestModel.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      if (!updated) return res.status(404).json({ message: 'Request not found' });
      res.json({ message: 'Request updated', data: updated });
    } catch (err) {
      console.error('Error updating material request:', err);
      res.status(500).json({ message: 'Failed to update request' });
    }
  });

  // Signatures endpoints
  app.get('/api/signatures', async (req, res) => {
    res.json([]);
  });

  // NOTE: Purchase Orders routes are now handled in server/routes/procurement.routes.js
  // (mounted at line ~750 with app.use('/api', procurementRoutes))

  // Send approval email for advance requests
  app.post('/api/send-approval-email', authLimiter, [
    validationRules.email,
    validationRules.employeeName,
    validationRules.employeeId,
    validationRules.department,
    validationRules.amount,
    validationRules.approver,
    validationRules.approverEmail,
    validationRules.reason,
    validationRules.repaymentPeriod,
  ], validate, async (req, res) => {
    try {
      const {
        to,
        employeeName,
        employeeId,
        department,
        amount,
        reason,
        repaymentPeriod,
        approver,
        requestType,
      } = req.body;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject: `Advance Request Approval Required - ${employeeId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0d6efd;">Advance Request Approval Required</h2>
            <p>Dear ${approver},</p>
            <p>A new advance request has been submitted for your approval.</p>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Request Details</h3>
              <p><strong>Employee Name:</strong> ${employeeName}</p>
              <p><strong>Employee ID:</strong> ${employeeId}</p>
              <p><strong>Department:</strong> ${department}</p>
              <p><strong>Amount:</strong> $${parseFloat(amount).toFixed(2)}</p>
              <p><strong>Reason:</strong> ${reason}</p>
              <p><strong>Repayment Period:</strong> ${repaymentPeriod}</p>
            </div>

            <p style="color: #666; font-size: 12px;">
              This is an automated email. Please do not reply to this message.
            </p>
          </div>
        `,
      };

      if (process.env.NODE_ENV !== 'production') {
        console.log('📧 Approval email would be sent to:', mailOptions.to);
        return res.json({ success: true, message: 'Email logged (dev mode)' });
      }

      const transporter = require('./utils/emailService').transporter || null;
      if (transporter) {
        await transporter.sendMail(mailOptions);
      }
      
      res.json({ success: true, message: 'Approval email sent successfully' });
    } catch (err) {
      console.error('Error sending approval email:', err);
      res.status(500).json({ success: false, message: 'Failed to send email', error: err.message });
    }
  });

  // Advance Request endpoints
  app.get('/api/advance-requests', async (req, res) => {
    try {
      const userId = req.query.userId;
      const query = userId ? { userId } : {};
      const requests = await AdvanceRequestModel.find(query).sort({ createdAt: -1 });
      res.json(requests);
    } catch (err) {
      console.error('Error fetching advance requests:', err);
      res.status(500).json({ message: 'Failed to fetch requests' });
    }
  });

  app.post('/api/advance-requests', async (req, res) => {
    try {
      const requestData = { ...req.body };
      
      // Try to build approval chain from rules
      const approvalInfo = await buildApprovalChain('Advance Requests', requestData);
      
      // If rule-based approval is available, use it
      if (approvalInfo.usesRuleBasedApproval && approvalInfo.approvalChain.length > 0) {
        requestData.usesRuleBasedApproval = true;
        requestData.approvalRuleId = approvalInfo.rule._id;
        requestData.approvalChain = approvalInfo.approvalChain;
        requestData.currentApprovalLevel = 1;
        requestData.status = 'pending';
        
        // Get first approver from chain
        const firstApprover = approvalInfo.approvalChain[0];
        requestData.approver = firstApprover.approverName;
        requestData.approverEmail = firstApprover.approverEmail;
      }
      
      const newRequest = await AdvanceRequestModel.create(requestData);
      res.status(201).json({ message: 'Request created successfully', data: newRequest });
    } catch (err) {
      console.error('Error creating advance request:', err);
      res.status(500).json({ message: 'Failed to create request' });
    }
  });

  app.put('/api/advance-requests/:id', async (req, res) => {
    try {
      const updated = await AdvanceRequestModel.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      if (!updated) return res.status(404).json({ message: 'Request not found' });
      res.json({ message: 'Request updated', data: updated });
    } catch (err) {
      console.error('Error updating advance request:', err);
      res.status(500).json({ message: 'Failed to update request' });
    }
  });

  // Refund Request endpoints
  app.get('/api/refund-requests', async (req, res) => {
    try {
      const userId = req.query.userId;
      const query = userId ? { userId } : {};
      const requests = await RefundRequestModel.find(query).sort({ createdAt: -1 });
      res.json(requests);
    } catch (err) {
      console.error('Error fetching refund requests:', err);
      res.status(500).json({ message: 'Failed to fetch requests' });
    }
  });

  app.post('/api/refund-requests', async (req, res) => {
    try {
      const requestData = { ...req.body };
      
      // Try to build approval chain from rules
      const approvalInfo = await buildApprovalChain('Refund Requests', requestData);
      
      // If rule-based approval is available, use it
      if (approvalInfo.usesRuleBasedApproval && approvalInfo.approvalChain.length > 0) {
        requestData.usesRuleBasedApproval = true;
        requestData.approvalRuleId = approvalInfo.rule._id;
        requestData.approvalChain = approvalInfo.approvalChain;
        requestData.currentApprovalLevel = 1;
        requestData.status = 'pending';
        
        // Get first approver from chain
        const firstApprover = approvalInfo.approvalChain[0];
        requestData.approver = firstApprover.approverName;
        requestData.approverEmail = firstApprover.approverEmail;
      }
      
      const newRequest = await RefundRequestModel.create(requestData);
      res.status(201).json({ message: 'Request created successfully', data: newRequest });
    } catch (err) {
      console.error('Error creating refund request:', err);
      res.status(500).json({ message: 'Failed to create request' });
    }
  });

  app.put('/api/refund-requests/:id', async (req, res) => {
    try {
      const updated = await RefundRequestModel.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      if (!updated) return res.status(404).json({ message: 'Request not found' });
      res.json({ message: 'Request updated', data: updated });
    } catch (err) {
      console.error('Error updating refund request:', err);
      res.status(500).json({ message: 'Failed to update request' });
    }
  });

  // Retirement Breakdown endpoints
  app.get('/api/retirement-breakdown', async (req, res) => {
    try {
      const userId = req.query.userId;
      const query = userId ? { userId } : {};
      const breakdowns = await RetirementBreakdownModel.find(query).sort({ createdAt: -1 });
      res.json(breakdowns);
    } catch (err) {
      console.error('Error fetching retirement breakdowns:', err);
      res.status(500).json({ message: 'Failed to fetch breakdowns' });
    }
  });

  app.post('/api/retirement-breakdown', async (req, res) => {
    try {
      const payload = {
        ...req.body,
        userId: String(req.body?.userId || '').trim(),
        employeeName: String(req.body?.employeeName || '').trim(),
      };

      if (!payload.userId) {
        return res.status(400).json({
          success: false,
          error: 'userId is required',
        });
      }

      if (!payload.employeeName) {
        return res.status(400).json({
          success: false,
          error: 'employeeName is required',
        });
      }

      const newBreakdown = await RetirementBreakdownModel.create(payload);
      res.status(201).json({ message: 'Breakdown saved successfully', data: newBreakdown });
    } catch (err) {
      console.error('Error creating retirement breakdown:', err);
      if (err?.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }

      res.status(500).json({ success: false, message: 'Failed to save breakdown' });
    }
  });

  app.put('/api/retirement-breakdown/:id', async (req, res) => {
    try {
      const updated = await RetirementBreakdownModel.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      if (!updated) return res.status(404).json({ message: 'Breakdown not found' });
      res.json({ message: 'Breakdown updated', data: updated });
    } catch (err) {
      console.error('Error updating retirement breakdown:', err);
      res.status(500).json({ message: 'Failed to update breakdown' });
    }
  });

  // ========== DOCUMENT MANAGEMENT ROUTES ==========
  
  // Get all documents for a user
  app.get('/api/documents', async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ message: 'userId is required' });
      }
      
      const documents = await DocumentModel.find({
        $or: [
          { uploadedBy: userId },
          { 'recipients.email': userId },
        ],
      }).sort({ createdAt: -1 });
      
      res.json(documents);
    } catch (err) {
      console.error('Error fetching documents:', err);
      res.status(500).json({ message: 'Failed to fetch documents' });
    }
  });

  // Get a single document by ID
  app.get('/api/documents/:id', async (req, res) => {
    try {
      const document = await DocumentModel.findById(req.params.id);
      if (!document) {
        return res.status(404).json({ message: 'Document not found' });
      }
      res.json(document);
    } catch (err) {
      console.error('Error fetching document:', err);
      res.status(500).json({ message: 'Failed to fetch document' });
    }
  });

  // Create a new document
  app.post('/api/documents', async (req, res) => {
    try {
      const document = new DocumentModel(req.body);
      const saved = await document.save();
      
      // Send email to all recipients
      if (saved.recipients && saved.recipients.length > 0) {
        const { sendSignatureRequestEmail } = require('./utils/emailService');
        
        for (const recipient of saved.recipients) {
          if (recipient.email) {
            try {
              await sendSignatureRequestEmail(
                {
                  _id: saved._id,
                  name: saved.name,
                  uploadedBy: saved.uploadedBy,
                  subject: saved.metadata?.subject,
                  message: saved.metadata?.message,
                  dueDate: saved.dueDate,
                  customBranding: saved.metadata?.customBranding || false,
                },
                recipient.email,
                recipient.name
              );
              console.log(`✅ Signature request email sent to ${recipient.email}`);
            } catch (emailError) {
              console.error(`❌ Failed to send email to ${recipient.email}:`, emailError);
              // Continue even if email fails - don't block document creation
            }
          }
        }
      }
      
      res.status(201).json(saved);
    } catch (err) {
      console.error('Error creating document:', err);
      res.status(500).json({ message: 'Failed to create document' });
    }
  });

  // Update document (add signatures, change status, etc.)
  app.patch('/api/documents/:id', async (req, res) => {
    try {
      const updated = await DocumentModel.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({ message: 'Document not found' });
      }
      res.json(updated);
    } catch (err) {
      console.error('Error updating document:', err);
      res.status(500).json({ message: 'Failed to update document' });
    }
  });

  // Sign document (complete signing process)
  app.post('/api/documents/:id/sign', async (req, res) => {
    try {
      const { signatures, recipients, userId, userName } = req.body;
      
      const document = await DocumentModel.findById(req.params.id);
      if (!document) {
        return res.status(404).json({ message: 'Document not found' });
      }

      // Add signatures with timestamp and signer info
      const timestampedSignatures = signatures.map(sig => ({
        ...sig,
        signedAt: new Date(),
        signedBy: userId,
      }));

      document.signatures = timestampedSignatures;
      document.status = 'Completed';
      document.completedAt = new Date();
      
      // Update recipients if provided
      if (recipients && recipients.length > 0) {
        document.recipients = recipients.map(rec => ({
          ...rec,
          status: rec.email === userId ? 'signed' : 'pending',
        }));
      }

      await document.save();

      // TODO: Send email notifications to recipients
      // You can implement email sending here using the emailService

      res.json({ message: 'Document signed successfully', document });
    } catch (err) {
      console.error('Error signing document:', err);
      res.status(500).json({ message: 'Failed to sign document' });
    }
  });

  // Delete a document
  app.delete('/api/documents/:id', async (req, res) => {
    try {
      const deleted = await DocumentModel.findByIdAndDelete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: 'Document not found' });
      }
      res.json({ message: 'Document deleted successfully' });
    } catch (err) {
      console.error('Error deleting document:', err);
      res.status(500).json({ message: 'Failed to delete document' });
    }
  });

  // ==================== USER MANAGEMENT ROUTES ====================

  // Get all users with optional filtering
  app.get('/api/users', async (req, res) => {
    try {
      const { role, status, search } = req.query;
      
      let userQuery = {};
      if (role) userQuery.role = role;
      if (status) userQuery.status = status;
      if (search) {
        userQuery.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ];
      }

      // Fetch users from UserModel
      const users = await UserModel.find(userQuery)
        .select('-resetPasswordToken -resetPasswordExpires')
        .sort({ createdAt: -1 })
        .populate('invitedBy', 'fullName email')
        .lean();

      // Auto-link unlinked employees: create User accounts for employees without one
      try {
        const unlinkedEmployees = await EmployeeModel.find({
          $or: [{ userRef: null }, { userRef: { $exists: false } }]
        }).lean();
        if (unlinkedEmployees.length > 0) {
          const crypto = require('crypto');
          for (const emp of unlinkedEmployees) {
            if (!emp.email) continue;
            // Resolve name — old records may only have `name`, not firstName/lastName
            let fn = emp.firstName;
            let ln = emp.lastName;
            if ((!fn || !ln) && emp.name) {
              const parts = emp.name.split(' ');
              fn = fn || parts[0] || 'Unknown';
              ln = ln || parts.slice(1).join(' ') || 'User';
              // Also fix the employee record
              await EmployeeModel.findByIdAndUpdate(emp._id, { firstName: fn, lastName: ln });
            }
            fn = fn || 'Unknown';
            ln = ln || 'User';

            const existingUser = await UserModel.findOne({ email: emp.email.toLowerCase() });
            if (existingUser) {
              await EmployeeModel.findByIdAndUpdate(emp._id, { userRef: existingUser._id });
              if (!existingUser.employeeRef) {
                await UserModel.findByIdAndUpdate(existingUser._id, { employeeRef: emp._id });
              }
            } else {
              const tempPassword = crypto.randomBytes(16).toString('hex');
              const newUser = await UserModel.create({
                firstName: fn,
                lastName: ln,
                fullName: `${fn} ${ln}`,
                email: emp.email.toLowerCase(),
                password: tempPassword,
                role: 'user',
                status: 'Active',
                department: emp.department || null,
                jobTitle: emp.jobTitle || null,
                phoneNumber: emp.phone || null,
                employeeRef: emp._id,
              });
              await EmployeeModel.findByIdAndUpdate(emp._id, { userRef: newUser._id });
            }
          }
        }
      } catch (linkErr) {
        console.error('Error auto-linking employees:', linkErr);
      }

      // Re-fetch users after auto-linking (includes newly created user accounts)
      const allUsers = await UserModel.find(userQuery)
        .select('-resetPasswordToken -resetPasswordExpires')
        .sort({ createdAt: -1 })
        .populate('invitedBy', 'fullName email')
        .lean();

      res.json(allUsers);
    } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ message: 'Failed to fetch users', error: err.message });
    }
  });

  // Get single user by ID
  app.get('/api/users/:id', async (req, res) => {
    try {
      const user = await UserModel.findById(req.params.id)
        .select('-resetPasswordToken -resetPasswordExpires')
        .populate('invitedBy', 'fullName email');

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json(user);
    } catch (err) {
      console.error('Error fetching user:', err);
      res.status(500).json({ message: 'Failed to fetch user' });
    }
  });

  // Create new user
  app.post('/api/users', async (req, res) => {
    try {
      const { fullName, email, role, permissions, invitedBy } = req.body;

      // Check if user already exists
      const existingUser = await UserModel.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User with this email already exists' });
      }

      // Split fullName into firstName/lastName
      const nameParts = (fullName || '').trim().split(' ');
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || 'User';

      // Generate a random temp password (user must reset)
      const crypto = require('crypto');
      const tempPassword = crypto.randomBytes(16).toString('hex');

      const user = new UserModel({
        firstName,
        lastName,
        fullName: fullName || `${firstName} ${lastName}`,
        email,
        password: tempPassword,
        role: role || 'Viewer',
        status: 'Pending',
        permissions,
        invitedBy,
        invitedAt: new Date(),
      });

      await user.save();

      // Auto-create or link a corresponding Employee record
      try {
        let existingEmp = await EmployeeModel.findOne({ email: email.toLowerCase() });
        if (existingEmp) {
          // Sync user identity fields to the existing employee profile
          existingEmp.userRef = user._id;
          existingEmp.firstName = firstName;
          existingEmp.lastName = lastName;
          await existingEmp.save();
          user.employeeRef = existingEmp._id;
          await user.save();
        } else {
          const count = await EmployeeModel.countDocuments();
          const empId = `EMP${String(count + 1).padStart(5, '0')}`;
          const newEmp = await EmployeeModel.create({
            firstName,
            lastName,
            email: email.toLowerCase(),
            employeeId: empId,
            role: role || 'Employee',
            status: 'Active',
            userRef: user._id,
          });
          user.employeeRef = newEmp._id;
          await user.save();
        }
      } catch (linkErr) {
        console.error('Error linking user to employee:', linkErr);
      }

      // Return user without password
      const userResponse = user.toObject();
      delete userResponse.password;
      res.status(201).json(userResponse);
    } catch (err) {
      console.error('Error creating user:', err);
      res.status(500).json({ message: 'Failed to create user' });
    }
  });

  // Update user
  app.patch('/api/users/:id', async (req, res) => {
    try {
      const { fullName, email, role, status, permissions } = req.body;
      
      const updateData = {};
      if (fullName !== undefined) {
        updateData.fullName = fullName;
        const parts = fullName.trim().split(' ');
        updateData.firstName = parts[0];
        updateData.lastName = parts.slice(1).join(' ') || 'User';
      }
      if (email !== undefined) updateData.email = email;
      if (role !== undefined) updateData.role = role;
      if (status !== undefined) updateData.status = status;
      if (permissions !== undefined) updateData.permissions = permissions;

      const user = await UserModel.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      ).select('-resetPasswordToken -resetPasswordExpires');

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Sync shared fields to linked Employee
      try {
        if (user.employeeRef) {
          const empSync = {};
          if (fullName) {
            empSync.firstName = user.firstName;
            empSync.lastName = user.lastName;
          }
          if (email) empSync.email = email.toLowerCase();
          if (user.department) empSync.department = user.department;
          if (user.jobTitle) empSync.jobTitle = user.jobTitle;
          if (Object.keys(empSync).length > 0) {
            empSync.updatedAt = new Date();
            await EmployeeModel.findByIdAndUpdate(user.employeeRef, empSync);
          }
        }
      } catch (syncErr) {
        console.error('Error syncing user update to employee:', syncErr);
      }

      res.json(user);
    } catch (err) {
      console.error('Error updating user:', err);
      res.status(500).json({ message: 'Failed to update user' });
    }
  });

  // Delete user
  app.delete('/api/users/:id', async (req, res) => {
    try {
      const user = await UserModel.findByIdAndDelete(req.params.id);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Also delete linked Employee record
      try {
        if (user.employeeRef) {
          await EmployeeModel.findByIdAndDelete(user.employeeRef);
        }
      } catch (linkErr) {
        console.error('Error deleting linked employee:', linkErr);
      }

      res.json({ message: 'User deleted successfully' });
    } catch (err) {
      console.error('Error deleting user:', err);
      res.status(500).json({ message: 'Failed to delete user' });
    }
  });

  // Request password reset
  app.post('/api/users/:id/reset-password', async (req, res) => {
    try {
      const user = await UserModel.findById(req.params.id);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Generate reset token
      const resetToken = user.generateResetToken();
      await user.save();

      // Send email
      const emailResult = await sendPasswordResetEmail(user, resetToken);
      
      if (emailResult.success) {
        res.json({ 
          message: 'Password reset email sent successfully',
          ...(process.env.NODE_ENV !== 'production' && { resetLink: emailResult.resetLink })
        });
      } else {
        res.status(500).json({ message: 'Failed to send password reset email' });
      }
    } catch (err) {
      console.error('Error requesting password reset:', err);
      res.status(500).json({ message: 'Failed to process password reset request' });
    }
  });

  // Update user status (activate/deactivate)
  app.patch('/api/users/:id/status', async (req, res) => {
    try {
      const { status } = req.body;

      if (!['Active', 'Inactive', 'Pending'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const user = await UserModel.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).select('-resetPasswordToken -resetPasswordExpires');

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json(user);
    } catch (err) {
      console.error('Error updating user status:', err);
      res.status(500).json({ message: 'Failed to update user status' });
    }
  });

  // ==================== SECURITY SETTINGS ROUTES ====================

  // Get security settings (singleton)
  app.get('/api/security/settings', checkSecurityPermission('viewLogs'), async (req, res) => {
    try {
      let settings = await SecuritySettingsModel.findOne({ singleton: true });
      
      // Create default settings if none exist
      if (!settings) {
        settings = new SecuritySettingsModel({
          singleton: true,
          passwordPolicy: {
            enabled: true,
            minLength: 12,
            specialChars: true,
            uppercaseRequired: true,
            lowercaseRequired: true,
            numberRequired: true,
            expiry: 90,
          },
          mfaSettings: {
            enabled: true,
            method: 'Authenticator App',
            enforcement: 'All Users',
            gracePeriod: 'None',
          },
          sessionControl: {
            idleTimeout: 30,
            concurrentSessions: 3,
            rememberMeDuration: 30,
          },
        });
        await settings.save();
      }

      res.json(settings);
    } catch (err) {
      console.error('Error fetching security settings:', err);
      res.status(500).json({ message: 'Failed to fetch security settings' });
    }
  });

  // Update security settings
  app.patch('/api/security/settings', checkSecurityPermission('manageSettings'), async (req, res) => {
    try {
      const { passwordPolicy, mfaSettings, sessionControl } = req.body;

      let settings = await SecuritySettingsModel.findOne({ singleton: true });
      
      if (!settings) {
        settings = new SecuritySettingsModel({ singleton: true });
      }

      if (passwordPolicy) settings.passwordPolicy = { ...settings.passwordPolicy, ...passwordPolicy };
      if (mfaSettings) settings.mfaSettings = { ...settings.mfaSettings, ...mfaSettings };
      if (sessionControl) settings.sessionControl = { ...settings.sessionControl, ...sessionControl };

      await settings.save();

      // Log the configuration update
      await AuditLogModel.create({
        actor: {
          userId: req.body.actorId || 'system',
          userName: req.body.actorName || 'System Admin',
          userEmail: req.body.actorEmail || 'admin@system.com',
          initials: 'SA',
        },
        action: 'Config Update',
        actionColor: 'purple',
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('user-agent'),
        description: 'Updated Security Settings',
        status: 'Success',
        metadata: { updatedFields: Object.keys(req.body) },
      });

      res.json(settings);
    } catch (err) {
      console.error('Error updating security settings:', err);
      res.status(500).json({ message: 'Failed to update security settings' });
    }
  });

  // ==================== MFA OTP ROUTES ====================

  // Send OTP via Email or SMS (uses the tenant's MFA method setting)
  app.post('/api/mfa/send-otp', async (req, res) => {
    try {
      const crypto = require('crypto');
      const bcrypt = require('bcryptjs');

      // Get userId from token payload (standard auth middleware sets req.user)
      const userId = req.user?._id || req.body.userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      // Get current MFA method from settings
      const settings = await SecuritySettingsModel.findOne({ singleton: true });
      const method = (settings?.mfaSettings?.method || 'Email').toLowerCase();

      // Fetch the user
      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      // Generate 6-digit OTP
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const hashedCode = await bcrypt.hash(code, 10);

      // Store hashed OTP in user document (expires in 10 minutes)
      await UserModel.findByIdAndUpdate(userId, {
        otpCode: hashedCode,
        otpExpires: new Date(Date.now() + 10 * 60 * 1000),
        otpMethod: method === 'sms' ? 'sms' : 'email',
      });

      let maskedTarget = '';

      if (method === 'sms') {
        const phone = user.phoneNumber;
        if (!phone) {
          return res.status(400).json({ message: 'No phone number registered on this account. Please update your profile.' });
        }
        await sendSMSOTP(phone, code);
        // Mask: +1***1234
        maskedTarget = phone.slice(0, 3) + '***' + phone.slice(-4);
      } else {
        // Email OTP (default for both 'email' and 'Authenticator App' fallback)
        const email = user.email;
        await sendEmailOTP(email, code, user.firstName || user.fullName);
        // Mask: em***@domain.com
        const [localPart, domain] = email.split('@');
        maskedTarget = localPart.slice(0, 2) + '***@' + domain;
      }

      res.json({
        success: true,
        method: method === 'sms' ? 'sms' : 'email',
        maskedTarget,
        message: `Verification code sent to ${maskedTarget}`,
      });
    } catch (err) {
      console.error('Error sending MFA OTP:', err);
      res.status(500).json({ message: 'Failed to send OTP', error: err.message });
    }
  });

  // Verify OTP submitted by the user
  app.post('/api/mfa/verify-otp', async (req, res) => {
    try {
      const bcrypt = require('bcryptjs');

      const userId = req.user?._id || req.body.userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { code } = req.body;
      if (!code) return res.status(400).json({ message: 'OTP code is required' });

      // Fetch user with OTP fields (they have select: false)
      const user = await UserModel.findById(userId).select('+otpCode +otpExpires +otpMethod');
      if (!user) return res.status(404).json({ message: 'User not found' });

      if (!user.otpCode || !user.otpExpires) {
        return res.status(400).json({ message: 'No OTP was requested. Please request a new code.' });
      }

      if (new Date() > user.otpExpires) {
        // Clear expired OTP
        await UserModel.findByIdAndUpdate(userId, { otpCode: null, otpExpires: null, otpMethod: null });
        return res.status(400).json({ message: 'OTP has expired. Please request a new code.' });
      }

      const isMatch = await bcrypt.compare(String(code), user.otpCode);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid OTP code. Please try again.' });
      }

      // Clear OTP after successful verification
      await UserModel.findByIdAndUpdate(userId, { otpCode: null, otpExpires: null, otpMethod: null });

      res.json({ success: true, message: 'OTP verified successfully' });
    } catch (err) {
      console.error('Error verifying MFA OTP:', err);
      res.status(500).json({ message: 'Failed to verify OTP', error: err.message });
    }
  });

  // Get active users count
  app.get('/api/security/active-users', async (req, res) => {
    try {
      const activeUsers = await UserModel.countDocuments({ status: 'Active' });
      res.json({ count: activeUsers });
    } catch (err) {
      console.error('Error fetching active users:', err);
      res.status(500).json({ message: 'Failed to fetch active users count' });
    }
  });

  // Get active sessions - returns currently active users from the database
  app.get('/api/security/active-sessions', checkSecurityPermission('manageSessions'), async (req, res) => {
    try {
      const uaParser = (uaString) => {
        if (!uaString) return 'Unknown';
        if (/mobile/i.test(uaString)) return 'Mobile Browser';
        if (/chrome/i.test(uaString)) return 'Chrome';
        if (/firefox/i.test(uaString)) return 'Firefox';
        if (/safari/i.test(uaString)) return 'Safari';
        if (/edge/i.test(uaString)) return 'Edge';
        return 'Browser';
      };

      const activeUsers = await UserModel.find({ status: 'Active' })
        .select('firstName lastName fullName email role lastLogin createdAt department jobTitle')
        .sort({ lastLogin: -1 })
        .lean();

      const sessions = activeUsers.map((user, idx) => {
        const lastLogin = user.lastLogin ? new Date(user.lastLogin) : new Date(user.createdAt);
        const diffMs = Date.now() - lastLogin.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        let lastActivity;
        if (diffMins < 1) lastActivity = 'Just now';
        else if (diffMins < 60) lastActivity = `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        else if (diffHours < 24) lastActivity = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        else lastActivity = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

        return {
          id: user._id.toString(),
          userName: user.fullName || `${user.firstName} ${user.lastName}`,
          userEmail: user.email,
          role: user.role,
          department: user.department || null,
          jobTitle: user.jobTitle || null,
          ipAddress: 'N/A',
          location: 'N/A',
          device: 'Web App',
          userAgent: '',
          lastActivity,
          loginTime: lastLogin,
        };
      });

      res.json({ sessions });
    } catch (err) {
      console.error('Error fetching active sessions:', err);
      res.status(500).json({ message: 'Failed to fetch active sessions' });
    }
  });

  // Kill specific session (Phase 2 Enhancement)
  app.delete('/api/security/sessions/:sessionId', checkSecurityPermission('manageSessions'), async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Log the session termination
      await AuditLog.create({
        action: 'Session Terminated',
        actor: 'Admin',
        description: `Session ${sessionId} was forcibly terminated`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'success'
      });

      res.json({ message: 'Session terminated successfully', sessionId });
    } catch (err) {
      console.error('Error terminating session:', err);
      res.status(500).json({ message: 'Failed to terminate session' });
    }
  });

  // Get security analytics (Phase 2 Enhancement)
  app.get('/api/security/analytics', checkSecurityPermission('viewAnalytics'), async (req, res) => {
    try {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Total logs count
      const totalLogs = await AuditLog.countDocuments();
      
      // Logs in last 30 days
      const recentLogs = await AuditLog.countDocuments({
        timestamp: { $gte: last30Days }
      });

      // Failed login attempts
      const failedLogins = await AuditLog.countDocuments({
        action: 'Login',
        status: 'failed'
      });

      // Successful logins
      const successfulLogins = await AuditLog.countDocuments({
        action: 'Login',
        status: 'success'
      });

      // Config changes
      const configChanges = await AuditLog.countDocuments({
        action: 'Config Update'
      });

      // Access denied events
      const accessDenied = await AuditLog.countDocuments({
        action: 'Access Denied'
      });

      // Activity by action type
      const actionStats = await AuditLog.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);

      // Daily activity (last 7 days)
      const dailyActivity = await AuditLog.aggregate([
        { $match: { timestamp: { $gte: last7Days } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Top users by activity
      const topUsers = await AuditLog.aggregate([
        { $match: { timestamp: { $gte: last30Days } } },
        { $group: { _id: '$actor', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);

      res.json({
        summary: {
          totalLogs,
          recentLogs,
          failedLogins,
          successfulLogins,
          configChanges,
          accessDenied
        },
        actionStats,
        dailyActivity,
        topUsers
      });
    } catch (err) {
      console.error('Error fetching analytics:', err);
      res.status(500).json({ message: 'Failed to fetch analytics data' });
    }
  });

  // ==================== AUDIT LOG ROUTES ====================

  // Get audit logs with filtering and pagination
  app.get('/api/audit-logs', checkSecurityPermission('viewLogs'), async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 10, 
        action, 
        status, 
        search,
        startDate,
        endDate 
      } = req.query;

      const query = {};

      if (action && action !== 'All Actions') {
        query.action = action;
      }

      if (status && status !== 'All Statuses') {
        query.status = status;
      }

      if (search) {
        query.$or = [
          { 'actor.userName': { $regex: search, $options: 'i' } },
          { 'actor.userEmail': { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
        ];
      }

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const [logs, total] = await Promise.all([
        AuditLogModel.find(query)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        AuditLogModel.countDocuments(query),
      ]);

      res.json({
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      res.status(500).json({ message: 'Failed to fetch audit logs' });
    }
  });

  // Create audit log entry
  app.post('/api/audit-logs', async (req, res) => {
    try {
      const log = new AuditLogModel({
        ...req.body,
        ipAddress: req.body.ipAddress || req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.body.userAgent || req.get('user-agent'),
      });

      await log.save();

      // Real-time broadcast via WebSocket
      const io = app.get('io');
      if (io) {
        io.to('security-logs').emit('new-audit-log', log);
      }

      // Check notification rules and send emails if triggered
      try {
        const securitySettings = await SecuritySettingsModel.findOne();
        if (securitySettings && securitySettings.notificationRules) {
          for (const rule of securitySettings.notificationRules) {
            if (!rule.enabled) continue;

            let triggered = false;

            // Check if action matches
            if (rule.actions && rule.actions.length > 0) {
              if (!rule.actions.includes(log.action)) continue;
            }

            // Check if user matches
            if (rule.users && rule.users.length > 0) {
              if (!rule.users.includes(log.userName)) continue;
            }

            // Check if IP address matches
            if (rule.ipAddresses && rule.ipAddresses.length > 0) {
              if (!rule.ipAddresses.includes(log.ipAddress)) continue;
            }

            // Rule matched - send notification
            triggered = true;

            if (triggered && rule.recipients && rule.recipients.length > 0) {
              // Send email notification
              await sendNotificationRuleEmail(rule, log, rule.recipients);
              console.log(`Notification sent for rule: ${rule.name}`);
            }
          }
        }
      } catch (notificationError) {
        console.error('Error processing notification rules:', notificationError);
        // Don't fail the audit log creation if notification fails
      }

      res.status(201).json(log);
    } catch (err) {
      console.error('Error creating audit log:', err);
      res.status(500).json({ message: 'Failed to create audit log' });
    }
  });

  // Export audit logs as CSV
  app.get('/api/audit-logs/export', checkSecurityPermission('exportLogs'), async (req, res) => {
    try {
      const { action, status, startDate, endDate } = req.query;
      
      const query = {};
      if (action && action !== 'All Actions') query.action = action;
      if (status && status !== 'All Statuses') query.status = status;
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const logs = await AuditLogModel.find(query).sort({ timestamp: -1 }).limit(10000);

      // Generate CSV
      const headers = ['Timestamp', 'Actor', 'Action', 'IP Address', 'Description', 'Status'];
      const csvRows = [headers.join(',')];

      logs.forEach(log => {
        const row = [
          new Date(log.timestamp).toISOString(),
          `"${log.actor.userName || 'Unknown'}"`,
          log.action,
          log.ipAddress,
          `"${log.description}"`,
          log.status,
        ];
        csvRows.push(row.join(','));
      });

      const csv = csvRows.join('\\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
      res.send(csv);
    } catch (err) {
      console.error('Error exporting audit logs:', err);
      res.status(500).json({ message: 'Failed to export audit logs' });
    }
  });

  // Bulk export selected audit logs
  app.post('/api/audit-logs/export', checkSecurityPermission('exportLogs'), async (req, res) => {
    try {
      const { logIds } = req.body;
      
      if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
        return res.status(400).json({ message: 'No logs selected for export' });
      }

      const logs = await AuditLogModel.find({ _id: { $in: logIds } }).sort({ timestamp: -1 });

      // Generate CSV
      const headers = ['Timestamp', 'Actor', 'Action', 'IP Address', 'Description', 'Status'];
      const csvRows = [headers.join(',')];

      logs.forEach(log => {
        const row = [
          new Date(log.timestamp).toISOString(),
          `"${log.actor.userName || 'Unknown'}"`,
          log.action,
          log.ipAddress,
          `"${log.description}"`,
          log.status,
        ];
        csvRows.push(row.join(','));
      });

      const csv = csvRows.join('\\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=selected-audit-logs.csv');
      res.send(csv);
    } catch (err) {
      console.error('Error exporting selected logs:', err);
      res.status(500).json({ message: 'Failed to export selected logs' });
    }
  });

  // Export audit logs in various formats (Phase 2 Enhancement)
  app.get('/api/audit-logs/export/:format', checkSecurityPermission('exportLogs'), async (req, res) => {
    try {
      const { format } = req.params;
      const { dateRange, noMetadata } = req.query;

      // Build query based on date range
      let query = {};
      if (dateRange && dateRange !== 'all') {
        const now = new Date();
        let startDate;
        
        switch (dateRange) {
          case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case 'quarter':
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          case 'year':
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
        }
        
        if (startDate) {
          query.timestamp = { $gte: startDate };
        }
      }

      const logs = await AuditLogModel.find(query).sort({ timestamp: -1 }).limit(1000);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.json');
        
        const data = noMetadata === 'true' 
          ? logs.map(l => ({ timestamp: l.timestamp, actor: l.actor.userName, action: l.action, status: l.status }))
          : logs;
        
        res.json(data);
      } else if (format === 'xml') {
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.xml');
        
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\\n<auditLogs>\\n';
        logs.forEach(log => {
          xml += '  <log>\\n';
          xml += `    <timestamp>${log.timestamp}</timestamp>\\n`;
          xml += `    <actor>${log.actor.userName || 'Unknown'}</actor>\\n`;
          xml += `    <action>${log.action}</action>\\n`;
          xml += `    <status>${log.status}</status>\\n`;
          if (noMetadata !== 'true') {
            xml += `    <ipAddress>${log.ipAddress}</ipAddress>\\n`;
            xml += `    <description>${log.description}</description>\\n`;
          }
          xml += '  </log>\\n';
        });
        xml += '</auditLogs>';
        
        res.send(xml);
      } else if (format === 'pdf') {
        // Simple PDF generation - in production, use a library like pdfkit
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.txt');
        
        let content = 'AUDIT LOGS REPORT\\n';
        content += '='.repeat(80) + '\\n\\n';
        content += `Generated: ${new Date().toISOString()}\\n`;
        content += `Total Records: ${logs.length}\\n\\n`;
        
        logs.forEach((log, idx) => {
          content += `----- Log ${idx + 1} -----\\n`;
          content += `Timestamp: ${log.timestamp}\\n`;
          content += `Actor: ${log.actor.userName || 'Unknown'}\\n`;
          content += `Action: ${log.action}\\n`;
          content += `Status: ${log.status}\\n`;
          if (noMetadata !== 'true') {
            content += `IP: ${log.ipAddress}\\n`;
            content += `Description: ${log.description}\\n`;
          }
          content += '\\n';
        });
        
        res.send(content);
      } else {
        // Default to CSV
        const headers = noMetadata === 'true' 
          ? ['Timestamp', 'Actor', 'Action', 'Status']
          : ['Timestamp', 'Actor', 'Action', 'IP Address', 'Description', 'Status'];
        
        const csvRows = [headers.join(',')];
        logs.forEach(log => {
          const row = noMetadata === 'true'
            ? [
                new Date(log.timestamp).toISOString(),
                `"${log.actor.userName || 'Unknown'}"`,
                log.action,
                log.status
              ]
            : [
                new Date(log.timestamp).toISOString(),
                `"${log.actor.userName || 'Unknown'}"`,
                log.action,
                log.ipAddress,
                `"${log.description}"`,
                log.status
              ];
          csvRows.push(row.join(','));
        });
        
        const csv = csvRows.join('\\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
        res.send(csv);
      }
    } catch (err) {
      console.error('Error exporting logs:', err);
      res.status(500).json({ message: 'Failed to export logs' });
    }
  });

  // Generate compliance report (Phase 2 Enhancement)
  app.post('/api/security/compliance-report', checkSecurityPermission('generateReports'), async (req, res) => {
    try {
      const { type } = req.body;
      
      const now = new Date();
      const last90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Fetch relevant audit data
      const [
        totalLogs,
        recentLogs,
        failedLogins,
        accessDenied,
        configChanges,
        passwordChanges
      ] = await Promise.all([
        AuditLogModel.countDocuments(),
        AuditLogModel.countDocuments({ timestamp: { $gte: last90Days } }),
        AuditLogModel.countDocuments({ action: 'Login', status: 'failed' }),
        AuditLogModel.countDocuments({ action: 'Access Denied' }),
        AuditLogModel.countDocuments({ action: 'Config Update' }),
        AuditLogModel.countDocuments({ action: 'Password Change' })
      ]);

      const settings = await SecuritySettingsModel.findOne();

      const report = {
        reportType: type.toUpperCase(),
        generatedAt: new Date().toISOString(),
        reportingPeriod: {
          start: last90Days.toISOString(),
          end: now.toISOString()
        },
        summary: {
          totalAuditLogs: totalLogs,
          recentActivity: recentLogs,
          securityIncidents: failedLogins + accessDenied,
          configurationChanges: configChanges
        },
        securityControls: {
          passwordPolicy: {
            enabled: settings?.passwordPolicy?.enabled || false,
            minimumLength: settings?.passwordPolicy?.minLength || 8,
            requiresSpecialChars: settings?.passwordPolicy?.specialChars || false,
            expiryDays: settings?.passwordPolicy?.expiry || 90,
            status: settings?.passwordPolicy?.enabled ? 'COMPLIANT' : 'NON-COMPLIANT'
          },
          mfaSettings: {
            enabled: settings?.mfaSettings?.enabled || false,
            enforcement: settings?.mfaSettings?.enforcement || 'Optional',
            method: settings?.mfaSettings?.method || 'None',
            status: settings?.mfaSettings?.enabled ? 'COMPLIANT' : 'NON-COMPLIANT'
          },
          sessionManagement: {
            idleTimeout: settings?.sessionControl?.idleTimeout || 30,
            maxConcurrentSessions: settings?.sessionControl?.concurrentSessions || 3,
            status: 'COMPLIANT'
          },
          auditLogging: {
            enabled: true,
            retentionPeriod: 'Indefinite',
            totalLogs,
            status: 'COMPLIANT'
          }
        },
        findings: [
          {
            id: 1,
            severity: failedLogins > 100 ? 'HIGH' : failedLogins > 50 ? 'MEDIUM' : 'LOW',
            title: 'Failed Login Attempts',
            description: `${failedLogins} failed login attempts detected in the last 90 days`,
            recommendation: failedLogins > 50 
              ? 'Implement account lockout policy and review failed login patterns'
              : 'Continue monitoring login attempts'
          },
          {
            id: 2,
            severity: !settings?.mfaSettings?.enabled ? 'HIGH' : 'LOW',
            title: 'Multi-Factor Authentication',
            description: settings?.mfaSettings?.enabled 
              ? 'MFA is enabled and properly configured'
              : 'MFA is not enabled',
            recommendation: !settings?.mfaSettings?.enabled
              ? 'Enable MFA for all users to enhance security'
              : 'Continue monitoring MFA usage'
          },
          {
            id: 3,
            severity: passwordChanges < 10 ? 'MEDIUM' : 'LOW',
            title: 'Password Changes',
            description: `${passwordChanges} password changes in the last 90 days`,
            recommendation: passwordChanges < 10
              ? 'Review password policy and ensure users are changing passwords regularly'
              : 'Password change frequency is adequate'
          }
        ],
        recommendations: [
          'Regularly review and update security policies',
          'Conduct security awareness training for all users',
          'Implement automated alerting for suspicious activities',
          'Maintain comprehensive audit logs for all system access',
          'Perform periodic security assessments'
        ],
        complianceStatus: {
          overall: settings?.passwordPolicy?.enabled && settings?.mfaSettings?.enabled 
            ? 'COMPLIANT' : 'PARTIAL',
          score: 85,
          lastAssessment: new Date().toISOString()
        }
      };

      res.json(report);
    } catch (err) {
      console.error('Error generating compliance report:', err);
      res.status(500).json({ message: 'Failed to generate compliance report' });
    }
  });

  // ==================== MFA ENDPOINTS ====================

  // Verify MFA code during login
  app.post('/api/auth/mfa-verify', async (req, res) => {
    try {
      const { authenticator } = require('otplib');
      const { mfaPendingToken, code } = req.body;

      if (!mfaPendingToken || !code) {
        return res.status(400).json({ success: false, error: 'Token and code are required' });
      }

      // Verify the pending token
      const tokenResult = verifyMfaPendingToken(mfaPendingToken);
      if (!tokenResult.valid) {
        return res.status(401).json({ success: false, error: 'MFA session expired. Please login again.' });
      }

      const user = await UserModel.findById(tokenResult.userId).select('+mfaSecret +mfaBackupCodes');
      if (!user) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }

      // Check TOTP code
      const isValid = authenticator.check(code, user.mfaSecret);

      // If TOTP failed, check backup codes
      let usedBackupCode = false;
      if (!isValid && user.mfaBackupCodes?.length > 0) {
        const codeIndex = user.mfaBackupCodes.indexOf(code);
        if (codeIndex !== -1) {
          // Remove used backup code
          user.mfaBackupCodes.splice(codeIndex, 1);
          await user.save();
          usedBackupCode = true;
        }
      }

      if (!isValid && !usedBackupCode) {
        return res.status(401).json({ success: false, error: 'Invalid verification code' });
      }

      // MFA passed — issue full access token
      user.lastLogin = new Date();
      user.mfaVerifiedAt = new Date();
      await user.save();

      const token = generateToken(user._id, user.role);
      const userData = {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
        profilePicture: user.profilePicture,
        department: user.department,
        jobTitle: user.jobTitle,
        mfaEnabled: true,
        permissions: user.permissions || {},
      };

      res.json({
        success: true,
        message: usedBackupCode ? 'Verified with backup code' : 'MFA verified',
        usedBackupCode,
        remainingBackupCodes: usedBackupCode ? user.mfaBackupCodes.length : undefined,
        data: { user: userData, token },
      });
    } catch (error) {
      console.error('MFA verify error:', error);
      res.status(500).json({ success: false, error: 'MFA verification failed' });
    }
  });

  // Generate MFA setup (secret + QR code) — requires auth
  app.post('/api/auth/mfa-setup', authMiddleware, async (req, res) => {
    try {
      const { authenticator } = require('otplib');
      const QRCode = require('qrcode');

      const user = await UserModel.findById(req.user._id).select('+mfaSecret');

      // Generate a new secret
      const secret = authenticator.generateSecret();

      // Create otpauth URI for authenticator apps
      const appName = 'Netlink EMS';
      const otpauthUrl = authenticator.keyuri(user.email, appName, secret);

      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

      // Store the secret temporarily (will be confirmed in mfa-confirm)
      user.mfaSecret = secret;
      await user.save();

      res.json({
        success: true,
        data: {
          secret,
          qrCode: qrCodeDataUrl,
          otpauthUrl,
        },
      });
    } catch (error) {
      console.error('MFA setup error:', error);
      res.status(500).json({ success: false, error: 'Failed to generate MFA setup' });
    }
  });

  // Confirm MFA setup — verify user can produce valid codes
  app.post('/api/auth/mfa-confirm', authMiddleware, async (req, res) => {
    try {
      const { authenticator } = require('otplib');
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ success: false, error: 'Verification code is required' });
      }

      const user = await UserModel.findById(req.user._id).select('+mfaSecret');
      if (!user.mfaSecret) {
        return res.status(400).json({ success: false, error: 'MFA setup not initiated. Call /api/auth/mfa-setup first.' });
      }

      // Verify the code matches the secret
      const isValid = authenticator.check(code, user.mfaSecret);
      if (!isValid) {
        return res.status(400).json({ success: false, error: 'Invalid verification code. Please try again.' });
      }

      // Generate backup codes
      const backupCodes = [];
      for (let i = 0; i < 8; i++) {
        backupCodes.push(crypto.randomBytes(4).toString('hex'));
      }

      // Enable MFA
      user.mfaEnabled = true;
      user.mfaBackupCodes = backupCodes;
      user.mfaVerifiedAt = new Date();
      await user.save();

      // Audit log
      await AuditLogModel.create({
        actor: {
          userId: req.user._id.toString(),
          userName: req.user.fullName || req.user.email,
          userEmail: req.user.email,
          initials: (req.user.fullName || req.user.email).substring(0, 2).toUpperCase(),
        },
        action: 'MFA Enable',
        actionColor: 'green',
        ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
        userAgent: req.headers['user-agent'],
        description: `MFA enabled by ${req.user.email}`,
        status: 'Success',
      });

      res.json({
        success: true,
        message: 'MFA enabled successfully',
        data: { backupCodes },
      });
    } catch (error) {
      console.error('MFA confirm error:', error);
      res.status(500).json({ success: false, error: 'Failed to confirm MFA setup' });
    }
  });

  // Disable MFA — requires auth + password confirmation
  app.post('/api/auth/mfa-disable', authMiddleware, async (req, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ success: false, error: 'Password is required to disable MFA' });
      }

      const user = await UserModel.findById(req.user._id).select('+password');
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Incorrect password' });
      }

      user.mfaEnabled = false;
      user.mfaSecret = undefined;
      user.mfaBackupCodes = undefined;
      user.mfaVerifiedAt = undefined;
      await user.save();

      // Audit log
      await AuditLogModel.create({
        actor: {
          userId: req.user._id.toString(),
          userName: req.user.fullName || req.user.email,
          userEmail: req.user.email,
          initials: (req.user.fullName || req.user.email).substring(0, 2).toUpperCase(),
        },
        action: 'MFA Disable',
        actionColor: 'red',
        ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
        userAgent: req.headers['user-agent'],
        description: `MFA disabled by ${req.user.email}`,
        status: 'Success',
      });

      res.json({ success: true, message: 'MFA has been disabled' });
    } catch (error) {
      console.error('MFA disable error:', error);
      res.status(500).json({ success: false, error: 'Failed to disable MFA' });
    }
  });

  // Get MFA status for current user
  app.get('/api/auth/mfa-status', authMiddleware, async (req, res) => {
    try {
      const user = await UserModel.findById(req.user._id).select('mfaEnabled mfaVerifiedAt');
      const orgSettings = await SecuritySettingsModel.findOne();
      const mfaPolicy = orgSettings?.mfaSettings;

      let enforced = false;
      if (mfaPolicy?.enabled) {
        enforced = mfaPolicy.enforcement === 'All Users' ||
          (mfaPolicy.enforcement === 'Admins Only' && req.user.role === 'Admin');
      }

      res.json({
        success: true,
        data: {
          mfaEnabled: !!user.mfaEnabled,
          mfaVerifiedAt: user.mfaVerifiedAt,
          orgMfaEnforced: enforced,
          orgMfaPolicy: mfaPolicy ? {
            enabled: mfaPolicy.enabled,
            enforcement: mfaPolicy.enforcement,
            method: mfaPolicy.method,
          } : null,
        },
      });
    } catch (error) {
      console.error('MFA status error:', error);
      res.status(500).json({ success: false, error: 'Failed to get MFA status' });
    }
  });

  // Get notification rules
  app.get('/api/security/notification-rules', checkSecurityPermission('viewLogs'), async (req, res) => {
    try {
      const settings = await SecuritySettingsModel.findOne();
      if (!settings || !settings.notificationRules) {
        return res.json({ rules: [] });
      }
      res.json({ rules: settings.notificationRules });
    } catch (err) {
      console.error('Error fetching notification rules:', err);
      res.status(500).json({ message: 'Failed to fetch notification rules' });
    }
  });

  // Add notification rule
  app.post('/api/security/notification-rules', checkSecurityPermission('manageNotifications'), async (req, res) => {
    try {
      const { name, event, condition, recipient, enabled } = req.body;
      
      if (!name || !event || !condition || !recipient) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      let settings = await SecuritySettingsModel.findOne();
      if (!settings) {
        settings = new SecuritySettingsModel({ notificationRules: [] });
      }

      const newRule = {
        name,
        event,
        condition,
        recipient,
        enabled: enabled !== undefined ? enabled : true,
      };

      settings.notificationRules = settings.notificationRules || [];
      settings.notificationRules.push(newRule);
      await settings.save();

      const addedRule = settings.notificationRules[settings.notificationRules.length - 1];
      res.json({ rule: addedRule });
    } catch (err) {
      console.error('Error adding notification rule:', err);
      res.status(500).json({ message: 'Failed to add notification rule' });
    }
  });

  // Delete notification rule
  app.delete('/api/security/notification-rules/:ruleId', checkSecurityPermission('manageNotifications'), async (req, res) => {
    try {
      const { ruleId } = req.params;
      
      const settings = await SecuritySettingsModel.findOne();
      if (!settings) {
        return res.status(404).json({ message: 'Settings not found' });
      }

      settings.notificationRules = settings.notificationRules.filter(
        rule => rule._id.toString() !== ruleId
      );
      await settings.save();

      res.json({ message: 'Notification rule deleted' });
    } catch (err) {
      console.error('Error deleting notification rule:', err);
      res.status(500).json({ message: 'Failed to delete notification rule' });
    }
  });

  // Get settings history
  app.get('/api/security/settings-history', async (req, res) => {
    try {
      const settings = await SecuritySettingsModel.findOne();
      if (!settings || !settings.settingsHistory) {
        return res.json({ history: [] });
      }
      // Return last 50 entries, sorted by timestamp descending
      const history = settings.settingsHistory
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 50);
      res.json({ history });
    } catch (err) {
      console.error('Error fetching settings history:', err);
      res.status(500).json({ message: 'Failed to fetch settings history' });
    }
  });

  // Panic logout - terminate all sessions
  app.post('/api/security/panic-logout', async (req, res) => {
    try {
      // In a real implementation, this would:
      // 1. Clear all session tokens
      // 2. Force logout all users
      // 3. Notify administrators
      // For now, we'll just log the action
      
      // Create audit log
      await AuditLogModel.create({
        action: 'Panic Logout',
        description: 'Emergency logout initiated for all users',
        status: 'Success',
        actor: {
          userName: req.body.userName || 'System Administrator',
          userEmail: req.body.userEmail || 'admin@system.com',
          initials: req.body.initials || 'SA',
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        actionColor: 'red',
        timestamp: new Date(),
      });

      res.json({ message: 'All users have been logged out', count: 0 });
    } catch (err) {
      console.error('Error during panic logout:', err);
      res.status(500).json({ message: 'Failed to execute panic logout' });
    }
  });

  // ============ LOG RETENTION POLICY ENDPOINTS (Phase 2 Enhancement) ============
  
  // Get log retention policy settings
  app.get('/api/security/retention-policy', checkSecurityPermission('viewLogs'), async (req, res) => {
    try {
      const settings = await SecuritySettingsModel.findOne();
      if (!settings || !settings.logRetentionPolicy) {
        // Return default policy
        return res.json({
          enabled: true,
          retentionPeriod: 90,
          archiveBeforeDelete: true,
          autoArchive: true,
          archivePath: 'archives',
          compressionEnabled: true,
          lastArchiveDate: null,
          totalArchived: 0,
        });
      }
      res.json(settings.logRetentionPolicy);
    } catch (err) {
      console.error('Error fetching retention policy:', err);
      res.status(500).json({ message: 'Failed to fetch retention policy' });
    }
  });

  // Update log retention policy
  app.patch('/api/security/retention-policy', checkSecurityPermission('manageSettings'), async (req, res) => {
    try {
      const { enabled, retentionPeriod, archiveBeforeDelete, autoArchive, compressionEnabled } = req.body;

      let settings = await SecuritySettingsModel.findOne();
      if (!settings) {
        settings = new SecuritySettingsModel({ singleton: true });
      }

      if (!settings.logRetentionPolicy) {
        settings.logRetentionPolicy = {};
      }

      if (enabled !== undefined) settings.logRetentionPolicy.enabled = enabled;
      if (retentionPeriod !== undefined) settings.logRetentionPolicy.retentionPeriod = retentionPeriod;
      if (archiveBeforeDelete !== undefined) settings.logRetentionPolicy.archiveBeforeDelete = archiveBeforeDelete;
      if (autoArchive !== undefined) settings.logRetentionPolicy.autoArchive = autoArchive;
      if (compressionEnabled !== undefined) settings.logRetentionPolicy.compressionEnabled = compressionEnabled;

      await settings.save();

      // Log the policy update
      await AuditLogModel.create({
        actor: {
          userId: req.body.actorId || 'system',
          userName: req.body.actorName || 'System Admin',
          userEmail: req.body.actorEmail || 'admin@system.com',
          initials: 'SA',
        },
        action: 'Config Update',
        actionColor: 'purple',
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('user-agent'),
        description: 'Updated Log Retention Policy',
        status: 'Success',
        metadata: { updatedFields: Object.keys(req.body) },
      });

      res.json(settings.logRetentionPolicy);
    } catch (err) {
      console.error('Error updating retention policy:', err);
      res.status(500).json({ message: 'Failed to update retention policy' });
    }
  });

  // Manual archive old logs
  app.post('/api/security/archive-logs', checkSecurityPermission('manageSettings'), async (req, res) => {
    try {
      const settings = await SecuritySettingsModel.findOne();
      const retentionPeriod = settings?.logRetentionPolicy?.retentionPeriod || 90;
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionPeriod);

      // Find old logs to archive
      const logsToArchive = await AuditLogModel.find({ timestamp: { $lt: cutoffDate } });

      if (logsToArchive.length === 0) {
        return res.json({ message: 'No logs to archive', count: 0 });
      }

      // Create batch ID
      const batchId = `batch-${Date.now()}`;

      // Archive logs
      const archivedLogs = logsToArchive.map(log => ({
        actor: log.actor,
        action: log.action,
        actionColor: log.actionColor,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        description: log.description,
        status: log.status,
        metadata: log.metadata,
        timestamp: log.timestamp,
        originalId: log._id,
        archiveBatch: batchId,
        archiveDate: new Date(),
        compressed: settings?.logRetentionPolicy?.compressionEnabled || false,
      }));

      await ArchivedLogModel.insertMany(archivedLogs);

      // Delete original logs
      await AuditLogModel.deleteMany({ timestamp: { $lt: cutoffDate } });

      // Update settings
      if (settings) {
        settings.logRetentionPolicy.lastArchiveDate = new Date();
        settings.logRetentionPolicy.totalArchived = (settings.logRetentionPolicy.totalArchived || 0) + logsToArchive.length;
        await settings.save();
      }

      // Log the archival
      await AuditLogModel.create({
        actor: {
          userId: req.body.actorId || 'system',
          userName: req.body.actorName || 'System Admin',
          userEmail: req.body.actorEmail || 'admin@system.com',
          initials: 'SA',
        },
        action: 'Data Archive',
        actionColor: 'blue',
        ipAddress: req.ip || req.connection.remoteAddress || 'Unknown',
        userAgent: req.get('user-agent'),
        description: `Archived ${logsToArchive.length} old audit logs`,
        status: 'Success',
        metadata: { count: logsToArchive.length, batchId, cutoffDate },
      });

      res.json({ 
        message: 'Logs archived successfully', 
        count: logsToArchive.length,
        batchId,
        cutoffDate
      });
    } catch (err) {
      console.error('Error archiving logs:', err);
      res.status(500).json({ message: 'Failed to archive logs', error: err.message });
    }
  });

  // Get archived logs with pagination
  app.get('/api/security/archived-logs', checkSecurityPermission('viewLogs'), async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 10, 
        action, 
        startDate, 
        endDate,
        archiveBatch
      } = req.query;

      const query = {};

      if (action && action !== 'All Actions') {
        query.action = action;
      }

      if (archiveBatch) {
        query.archiveBatch = archiveBatch;
      }

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const [logs, total] = await Promise.all([
        ArchivedLogModel.find(query)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        ArchivedLogModel.countDocuments(query),
      ]);

      res.json({
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (err) {
      console.error('Error fetching archived logs:', err);
      res.status(500).json({ message: 'Failed to fetch archived logs' });
    }
  });

  // Get archive statistics
  app.get('/api/security/archive-stats', checkSecurityPermission('viewLogs'), async (req, res) => {
    try {
      const [totalArchived, oldestArchive, newestArchive, batchCount] = await Promise.all([
        ArchivedLogModel.countDocuments(),
        ArchivedLogModel.findOne().sort({ archiveDate: 1 }),
        ArchivedLogModel.findOne().sort({ archiveDate: -1 }),
        ArchivedLogModel.distinct('archiveBatch'),
      ]);

      const settings = await SecuritySettingsModel.findOne();

      res.json({
        totalArchived,
        oldestArchiveDate: oldestArchive?.archiveDate || null,
        newestArchiveDate: newestArchive?.archiveDate || null,
        totalBatches: batchCount.length,
        lastArchiveDate: settings?.logRetentionPolicy?.lastArchiveDate || null,
        retentionPeriod: settings?.logRetentionPolicy?.retentionPeriod || 90,
      });
    } catch (err) {
      console.error('Error fetching archive stats:', err);
      res.status(500).json({ message: 'Failed to fetch archive statistics' });
    }
  });

  // ===================================
  // POLICY MANAGEMENT ROUTES
  // ===================================

  // Get departments list (DB-driven, seed when empty)
  app.get('/api/departments', async (req, res) => {
    try {
      let departments = await DepartmentModel.find().sort({ name: 1 }).lean();
      if (!departments || departments.length === 0) {
        // Seed defaults
        await DepartmentModel.insertMany(DEFAULT_DEPARTMENTS);
        departments = await DepartmentModel.find().sort({ name: 1 }).lean();
      }
      res.json({ departments });
    } catch (err) {
      console.error('Error fetching departments:', err);
      res.status(500).json({ message: 'Failed to fetch departments' });
    }
  });

  // Create a new department
  app.post('/api/departments', async (req, res) => {
    try {
      const { name, code, icon, color } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Department name is required' });
      }
      const existing = await DepartmentModel.findOne({ name: name.trim() });
      if (existing) {
        return res.status(409).json({ message: 'A department with this name already exists' });
      }
      const dept = await DepartmentModel.create({ name: name.trim(), code: (code || '').trim(), icon: icon || null, color: color || null });
      res.status(201).json({ department: dept });
    } catch (err) {
      console.error('Error creating department:', err);
      res.status(500).json({ message: 'Failed to create department' });
    }
  });

  // Update a department
  app.put('/api/departments/:id', async (req, res) => {
    try {
      const { name, code, icon, color } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Department name is required' });
      }
      // Check uniqueness (excluding current)
      const existing = await DepartmentModel.findOne({ name: name.trim(), _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(409).json({ message: 'A department with this name already exists' });
      }
      const updated = await DepartmentModel.findByIdAndUpdate(req.params.id, { name: name.trim(), code: (code || '').trim(), icon: icon || null, color: color || null }, { new: true });
      if (!updated) return res.status(404).json({ message: 'Department not found' });
      res.json({ department: updated });
    } catch (err) {
      console.error('Error updating department:', err);
      res.status(500).json({ message: 'Failed to update department' });
    }
  });

  // Delete a department
  app.delete('/api/departments/:id', async (req, res) => {
    try {
      const deleted = await DepartmentModel.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ message: 'Department not found' });
      res.json({ message: 'Department deleted successfully' });
    } catch (err) {
      console.error('Error deleting department:', err);
      res.status(500).json({ message: 'Failed to delete department' });
    }
  });

  // Get job titles list (DB-driven, seed when empty)
  app.get('/api/job-titles', async (req, res) => {
    try {
      let jobTitles = await JobTitleModel.find().lean();
      if (!jobTitles || jobTitles.length === 0) {
        await JobTitleModel.insertMany(DEFAULT_JOB_TITLES.map(t => ({ title: t })));
        jobTitles = await JobTitleModel.find().lean();
      }
      // return simple array of titles for the client
      res.json({ jobTitles: jobTitles.map(j => j.title) });
    } catch (err) {
      console.error('Error fetching job titles:', err);
      res.status(500).json({ message: 'Failed to fetch job titles' });
    }
  });

  // Get policy statistics
  app.get('/api/policies/stats', async (req, res) => {
    try {
      const totalPolicies = await PolicyModel.countDocuments();
      const published = await PolicyModel.countDocuments({ status: 'Published' });
      const drafts = await PolicyModel.countDocuments({ status: 'Draft' });
      const pendingApproval = await PolicyModel.countDocuments({ status: 'Pending Approval' });
      const reviewRequired = await PolicyModel.countDocuments({ status: 'Review' });
      const expiring = await PolicyModel.countDocuments({ status: 'Expiring' });

      // Calculate change from last month (simplified - you can make this more sophisticated)
      const lastMonthDate = new Date();
      lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
      const lastMonthCount = await PolicyModel.countDocuments({
        createdAt: { $gte: lastMonthDate }
      });

      const stats = {
        totalPolicies,
        totalChange: lastMonthCount > 0 ? `+${lastMonthCount} this month` : 'No change',
        published,
        publishedStatus: 'Active and visible',
        drafts,
        draftsPending: pendingApproval > 0 ? `${pendingApproval} pending approval` : 'None',
        reviewRequired: reviewRequired + expiring,
        reviewStatus: expiring > 0 ? 'Expiring soon' : 'Up to date',
      };

      res.json(stats);
    } catch (err) {
      console.error('Error fetching policy stats:', err);
      res.status(500).json({ message: 'Failed to fetch policy stats' });
    }
  });

  // Get all policies with filtering
  app.get('/api/policies', async (req, res) => {
    try {
      const { status, category, search } = req.query;
      let query = {};

      if (status && status !== 'All Statuses') {
        query.status = status;
      }
      if (category && category !== 'All Departments') {
        query.category = category;
      }
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { policyId: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const policies = await PolicyModel.find(query).sort({ lastUpdated: -1 });
      res.json(policies);
    } catch (err) {
      console.error('Error fetching policies:', err);
      res.status(500).json({ message: 'Failed to fetch policies' });
    }
  });

  // Get single policy by ID
  app.get('/api/policies/:id', async (req, res) => {
    try {
      const policy = await PolicyModel.findById(req.params.id);
      if (!policy) {
        return res.status(404).json({ message: 'Policy not found' });
      }
      res.json(policy);
    } catch (err) {
      console.error('Error fetching policy:', err);
      res.status(500).json({ message: 'Failed to fetch policy' });
    }
  });

  // Create new policy (with base64 document upload)
  app.post('/api/policies', async (req, res) => {
    try {
      const {
        title,
        category,
        description,
        documentData, // base64 string
        documentName,
        documentType,
        author
      } = req.body;

      // Validation
      if (!title || !category || !description || !documentData || !documentName) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Generate policy ID
      const currentYear = new Date().getFullYear();
      const departmentCodes = {
        'IT Security': 'ITS',
        'HR': 'HR',
        'Finance': 'FIN',
        'Legal': 'LEG',
        'Marketing': 'MKT',
        'Operations': 'OPS'
      };

      const existingPolicies = await PolicyModel.countDocuments({ category });
      const nextNumber = String(existingPolicies + 1).padStart(3, '0');
      const code = departmentCodes[category] || 'GEN';
      const policyId = `POL-${currentYear}-${code}-${nextNumber}`;

      // Create policy
      const newPolicy = new PolicyModel({
        title,
        category,
        policyId,
        description,
        documentUrl: documentData, // Store base64 data URL
        documentName,
        documentType,
        author,
        version: 'v1.0',
        status: 'Draft',
        versionHistory: [{
          version: 'v1.0',
          date: new Date(),
          author,
          changes: 'Initial version',
          status: 'Current',
          documentUrl: documentData,
          documentName
        }]
      });

      await newPolicy.save();
      
      res.status(201).json(newPolicy);
    } catch (err) {
      console.error('Error creating policy:', err);
      res.status(500).json({ message: 'Failed to create policy' });
    }
  });

  // Update policy
  app.patch('/api/policies/:id', async (req, res) => {
    try {
      const {
        title,
        description,
        status,
        documentData,
        documentName,
        documentType,
        changes,
        author
      } = req.body;

      const policy = await PolicyModel.findById(req.params.id);
      if (!policy) {
        return res.status(404).json({ message: 'Policy not found' });
      }

      // Update fields
      if (title) policy.title = title;
      if (description) policy.description = description;
      if (status) policy.status = status;
      
      // If new document is uploaded, increment version
      if (documentData && documentName) {
        // Archive current version
        policy.versionHistory.forEach(v => {
          if (v.status === 'Current') v.status = 'Archived';
        });

        // Increment version
        const currentVersionNum = parseFloat(policy.version.replace('v', ''));
        const newVersion = `v${(currentVersionNum + 0.1).toFixed(1)}`;
        
        policy.version = newVersion;
        policy.documentUrl = documentData;
        policy.documentName = documentName;
        policy.documentType = documentType;
        
        // Add to version history
        policy.versionHistory.push({
          version: newVersion,
          date: new Date(),
          author,
          changes: changes || 'Updated document',
          status: 'Current',
          documentUrl: documentData,
          documentName
        });
      }

      policy.lastUpdated = new Date();
      await policy.save();

      res.json(policy);
    } catch (err) {
      console.error('Error updating policy:', err);
      res.status(500).json({ message: 'Failed to update policy' });
    }
  });

  // Delete policy
  app.delete('/api/policies/:id', async (req, res) => {
    try {
      const policy = await PolicyModel.findByIdAndDelete(req.params.id);
      if (!policy) {
        return res.status(404).json({ message: 'Policy not found' });
      }
      res.json({ message: 'Policy deleted successfully' });
    } catch (err) {
      console.error('Error deleting policy:', err);
      res.status(500).json({ message: 'Failed to delete policy' });
    }
  });

  // Approve policy
  app.patch('/api/policies/:id/approve', async (req, res) => {
    try {
      const { approvedBy } = req.body;
      
      const policy = await PolicyModel.findById(req.params.id);
      if (!policy) {
        return res.status(404).json({ message: 'Policy not found' });
      }

      policy.status = 'Published';
      policy.approvedBy = {
        userId: approvedBy.userId,
        userName: approvedBy.userName,
        approvedDate: new Date()
      };
      policy.lastUpdated = new Date();
      
      await policy.save();
      res.json(policy);
    } catch (err) {
      console.error('Error approving policy:', err);
      res.status(500).json({ message: 'Failed to approve policy' });
    }
  });

  // Reject policy (return to draft)
  app.patch('/api/policies/:id/reject', async (req, res) => {
    try {
      const policy = await PolicyModel.findById(req.params.id);
      if (!policy) {
        return res.status(404).json({ message: 'Policy not found' });
      }

      policy.status = 'Draft';
      policy.lastUpdated = new Date();
      
      await policy.save();
      res.json(policy);
    } catch (err) {
      console.error('Error rejecting policy:', err);
      res.status(500).json({ message: 'Failed to reject policy' });
    }
  });

  // Submit policy for approval
  app.patch('/api/policies/:id/submit', async (req, res) => {
    try {
      const policy = await PolicyModel.findById(req.params.id);
      if (!policy) {
        return res.status(404).json({ message: 'Policy not found' });
      }

      policy.status = 'Pending Approval';
      policy.lastUpdated = new Date();
      
      await policy.save();
      res.json(policy);
    } catch (err) {
      console.error('Error submitting policy:', err);
      res.status(500).json({ message: 'Failed to submit policy' });
    }
  });

  // Restore version
  app.patch('/api/policies/:id/restore-version', async (req, res) => {
    try {
      const { versionToRestore, author } = req.body;
      
      const policy = await PolicyModel.findById(req.params.id);
      if (!policy) {
        return res.status(404).json({ message: 'Policy not found' });
      }

      const historyVersion = policy.versionHistory.find(v => v.version === versionToRestore);
      if (!historyVersion) {
        return res.status(404).json({ message: 'Version not found in history' });
      }

      // Archive current version
      policy.versionHistory.forEach(v => {
        if (v.status === 'Current') v.status = 'Archived';
      });

      // Increment version
      const currentVersionNum = parseFloat(policy.version.replace('v', ''));
      const newVersion = `v${(currentVersionNum + 0.1).toFixed(1)}`;
      
      policy.version = newVersion;
      policy.documentUrl = historyVersion.documentUrl;
      policy.documentName = historyVersion.documentName;
      
      // Add restored version to history
      policy.versionHistory.push({
        version: newVersion,
        date: new Date(),
        author,
        changes: `Restored from ${versionToRestore}`,
        status: 'Current',
        documentUrl: historyVersion.documentUrl,
        documentName: historyVersion.documentName
      });

      policy.lastUpdated = new Date();
      await policy.save();

      res.json(policy);
    } catch (err) {
      console.error('Error restoring version:', err);
      res.status(500).json({ message: 'Failed to restore version' });
    }
  });

  // ===================================
  // HR MANAGEMENT ROUTES
  // ===================================

  let lastEmployeeDirectorySyncAt = 0;
  let employeeDirectorySyncInFlight = false;

  const syncUsersIntoEmployees = async () => {
    if (employeeDirectorySyncInFlight) return;

    const now = Date.now();
    // Run at most once every 5 minutes to avoid blocking frequent UI reads.
    if (now - lastEmployeeDirectorySyncAt < 5 * 60 * 1000) return;

    employeeDirectorySyncInFlight = true;
    try {
      const users = await UserModel.find({}).select('firstName lastName fullName email role status department jobTitle phoneNumber employeeRef').lean();

      const toEmployeeStatus = (userStatus) => {
        if (userStatus === 'Inactive') return 'Terminated';
        return 'Active';
      };

      for (const user of users) {
        if (!user.email) continue;

        let employee = null;
        if (user.employeeRef) {
          employee = await EmployeeModel.findById(user.employeeRef);
        }

        if (!employee) {
          employee = await EmployeeModel.findOne({ email: user.email.toLowerCase() });
        }

        if (employee) {
          const employeeUpdates = {};
          if (!employee.userRef || String(employee.userRef) !== String(user._id)) {
            employeeUpdates.userRef = user._id;
          }
          if (!user.employeeRef || String(user.employeeRef) !== String(employee._id)) {
            await UserModel.findByIdAndUpdate(user._id, { employeeRef: employee._id });
          }
          if (Object.keys(employeeUpdates).length > 0) {
            employeeUpdates.updatedAt = new Date();
            await EmployeeModel.findByIdAndUpdate(employee._id, employeeUpdates);
          }
          continue;
        }

        const count = await EmployeeModel.countDocuments();
        const employeeId = `EMP${String(count + 1).padStart(5, '0')}`;
        const firstName = user.firstName || user.fullName?.split(' ')[0] || 'Unknown';
        const lastName = user.lastName || user.fullName?.split(' ').slice(1).join(' ') || 'User';
        const newEmployee = await EmployeeModel.create({
          firstName,
          lastName,
          email: user.email.toLowerCase(),
          phone: user.phoneNumber || '',
          department: user.department || null,
          role: user.role || 'user',
          jobTitle: user.jobTitle || user.role || 'Employee',
          status: toEmployeeStatus(user.status),
          employeeId,
          userRef: user._id,
        });

        await UserModel.findByIdAndUpdate(user._id, { employeeRef: newEmployee._id });
      }

      lastEmployeeDirectorySyncAt = Date.now();
    } catch (syncErr) {
      console.error('Error syncing users into HR employee directory:', syncErr);
    } finally {
      employeeDirectorySyncInFlight = false;
    }
  };

  // Employees - Get all employees with search
  app.get('/api/hr/employees', async (req, res) => {
    try {
      const { search } = req.query;
      let query = {};

      // Fire and forget sync so list requests stay responsive.
      syncUsersIntoEmployees();
      
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        query = {
          $or: [
            { name: searchRegex },
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex },
            { department: searchRegex },
            { role: searchRegex },
          ],
        };
      }
      
      const employees = await EmployeeModel.find(query)
        .select('-__v')
        .sort({ name: 1 })
        .lean();

      // Transform to match frontend expected format
      const formattedEmployees = employees.map(emp => ({
        id: emp._id.toString(),
        _id: emp._id,
        name: emp.name || [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim() || emp.email,
        email: emp.email,
        phone: emp.phone || '',
        dateOfBirth: emp.dateOfBirth,
        department: emp.department,
        role: emp.role,
        jobTitle: emp.jobTitle || emp.role,
        startDate: emp.startDate,
        status: emp.status,
        avatar: emp.avatar || '',
        employeeId: emp.employeeId,
      }));

      res.json({ success: true, data: formattedEmployees });
    } catch (err) {
      console.error('Error fetching employees:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch employees', error: err.message });
    }
  });

  // Add new employee
  app.post('/api/hr/employees', async (req, res) => {
    try {
      const { name, email, phone, dateOfBirth, department, jobTitle, startDate } = req.body;
      
      if (!name || !email) {
        return res.status(400).json({ message: 'Name and email are required' });
      }

      // Check if email already exists
      const existingEmployee = await EmployeeModel.findOne({ email: email.toLowerCase() });
      if (existingEmployee) {
        return res.status(400).json({ message: 'Employee with this email already exists' });
      }

      // Generate employee ID
      const count = await EmployeeModel.countDocuments();
      const employeeId = `EMP-${String(count + 1).padStart(5, '0')}`;

      const newEmployee = new EmployeeModel({
        name,
        email: email.toLowerCase(),
        phone: phone || '',
        dateOfBirth: dateOfBirth || null,
        department: department || 'Engineering',
        role: jobTitle || 'Employee',
        jobTitle: jobTitle || 'Employee',
        startDate: startDate || new Date(),
        status: 'Active',
        employeeId,
      });

      await newEmployee.save();

      // Auto-create or link a corresponding User account
      try {
        let existingUser = await UserModel.findOne({ email: email.toLowerCase() });
        if (existingUser) {
          existingUser.employeeRef = newEmployee._id;
          if (!existingUser.department && department) existingUser.department = department;
          if (!existingUser.jobTitle && jobTitle) existingUser.jobTitle = jobTitle;
          await existingUser.save();
          newEmployee.userRef = existingUser._id;
          await newEmployee.save();
        } else {
          const crypto = require('crypto');
          const tempPassword = crypto.randomBytes(16).toString('hex');
          const nameParts = name.split(' ');
          const newUser = await UserModel.create({
            firstName: nameParts[0] || 'Unknown',
            lastName: nameParts.slice(1).join(' ') || 'User',
            fullName: name,
            email: email.toLowerCase(),
            password: tempPassword,
            role: jobTitle || 'Employee',
            department: department || 'Engineering',
            jobTitle: jobTitle || 'Employee',
            status: 'active',
            employeeRef: newEmployee._id,
          });
          newEmployee.userRef = newUser._id;
          await newEmployee.save();
        }
      } catch (linkErr) {
        console.error('Error auto-creating/linking user for employee:', linkErr);
      }

      // Format response
      const response = {
        id: newEmployee._id.toString(),
        _id: newEmployee._id,
        name: newEmployee.name,
        email: newEmployee.email,
        phone: newEmployee.phone,
        dateOfBirth: newEmployee.dateOfBirth,
        department: newEmployee.department,
        role: newEmployee.role,
        jobTitle: newEmployee.jobTitle,
        startDate: newEmployee.startDate,
        status: newEmployee.status,
        employeeId: newEmployee.employeeId,
      };

      res.status(201).json({ success: true, data: response });
    } catch (err) {
      console.error('Error adding employee:', err);
      res.status(500).json({ success: false, message: 'Failed to add employee', error: err.message });
    }
  });

  // Get single employee by ID
  app.get('/api/hr/employees/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const ObjectId = require('mongoose').Types.ObjectId;
      
      // Check if ID is valid MongoDB ObjectId
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid employee ID' });
      }

      let employee = await EmployeeModel.findById(id).select('-__v').lean();
      let fallbackUser = null;

      // Fallback chain: caller may have passed a User _id instead of an Employee _id
      // (e.g. when viewing own profile from the avatar menu).
      if (!employee) {
        // 1. Employee.userRef → User._id
        employee = await EmployeeModel.findOne({ userRef: id }).select('-__v').lean();
      }
      if (!employee) {
        // 2. User.employeeRef → Employee._id (most reliable when Employee lacks userRef)
        fallbackUser = await UserModel.findById(id).select('employeeRef email firstName lastName fullName role department jobTitle status profilePicture phoneNumber').lean();
        if (fallbackUser?.employeeRef) {
          employee = await EmployeeModel.findById(fallbackUser.employeeRef).select('-__v').lean();
        }
        // 3. Email match as last resort
        if (!employee && fallbackUser?.email) {
          employee = await EmployeeModel.findOne({ email: fallbackUser.email }).select('-__v').lean();
        }
      }

      // 4. Final fallback: synthesize a profile from the User record itself
      if (!employee && fallbackUser) {
        const u = fallbackUser;
        const synthetic = {
          id: u._id.toString(),
          _id: u._id,
          name: u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
          firstName: u.firstName || '',
          lastName: u.lastName || '',
          email: u.email,
          phone: u.phoneNumber || '',
          department: u.department || '',
          role: u.role || 'Employee',
          jobTitle: u.jobTitle || u.role || 'Employee',
          status: u.status || 'Active',
          avatar: u.profilePicture || '',
          salary: 0,
          paySchedule: '',
          bonus: 0,
          allowances: 0,
          address: '',
          emergencyContact: { name: '', relationship: '', phone: '' },
          employeeId: null,
          managerId: null,
          documents: [],
          _synthetic: true,
        };
        return res.json({ success: true, data: synthetic });
      }

      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }

      // Format response
      const response = {
        id: employee._id.toString(),
        _id: employee._id,
        name: employee.name,
        firstName: employee.firstName || '',
        lastName: employee.lastName || '',
        email: employee.email,
        phone: employee.phone || '',
        dateOfBirth: employee.dateOfBirth,
        department: employee.department,
        role: employee.role,
        jobTitle: employee.jobTitle || employee.role,
        startDate: employee.startDate,
        status: employee.status || 'Active',
        avatar: employee.avatar || '',
        salary: employee.salary || 0,
        paySchedule: employee.paySchedule || '',
        bonus: employee.bonus || 0,
        allowances: employee.allowances || 0,
        address: employee.address || '',
        emergencyContact: employee.emergencyContact || { name: '', relationship: '', phone: '' },
        employeeId: employee.employeeId,
        managerId: employee.managerId,
        managerName: employee.managerName || '',
        documents: employee.documents || [],
        location: employee.location || '',
        workArrangement: employee.workArrangement || '',
        employmentType: employee.employmentType || '',
      };

      res.json({ success: true, data: response });
    } catch (err) {
      console.error('Error fetching employee:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch employee', error: err.message });
    }
  });

  // Bulk update employees (HR only)
  app.put('/api/hr/employees/bulk-update', async (req, res) => {
    try {
      const { employeeIds, updates, updatedBy } = req.body;
      const ObjectId = require('mongoose').Types.ObjectId;
      
      if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
        return res.status(400).json({ success: false, message: 'Employee IDs array is required' });
      }

      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'Updates object is required' });
      }

      // Validate all IDs (ObjectIds or string IDs like 'EMP0001')
      const validIds = employeeIds.filter(id => id && (typeof id === 'string' || ObjectId.isValid(id)));
      if (validIds.length !== employeeIds.length) {
        return res.status(400).json({ success: false, message: 'Some employee IDs are invalid' });
      }

      // Build update object (only allow HR fields)
      const updateData = {};
      if (updates.department !== undefined) updateData.department = updates.department;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.jobTitle !== undefined) updateData.jobTitle = updates.jobTitle;

      // Update multiple employees
      const objectIds = validIds.filter(id => ObjectId.isValid(id));
      const result = await EmployeeModel.updateMany(
        { 
          $or: [
            { _id: { $in: objectIds } },
            { employeeId: { $in: validIds } }
          ]
        },
        { $set: updateData }
      );

      // Create audit log for bulk update
      const logAction = updates.status === 'Terminated' || updates.status === 'Inactive' ? 'User Deleted' : 'User Updated';
      await AuditLogModel.create({
        actor: {
          userId: updatedBy || 'system',
          userName: 'System',
        },
        action: logAction,
        description: `Bulk updated ${validIds.length} employees`,
        metadata: {
          employeeCount: validIds.length,
          employeeIds: validIds,
          updates: updateData,
        },
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.get('user-agent') || 'system',
      });

      res.json({ 
        success: true, 
        message: `${result.modifiedCount} employees updated successfully`,
        modifiedCount: result.modifiedCount 
      });
    } catch (err) {
      console.error('Error bulk updating employees:', err);
      res.status(500).json({ success: false, message: 'Failed to bulk update employees', error: err.message });
    }
  });

  // Update employee by ID with avatar upload
  app.put('/api/hr/employees/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        firstName,
        lastName,
        role,
        email,
        phone,
        dateOfBirth,
        department,
        jobTitle,
        status,
        salary,
        paySchedule,
        bonus,
        allowances,
        address,
        emergencyContact,
        avatar,
        updatedBy,
        startDate,
        employmentType,
        managerId,
        managerName,
        documents,
        location,
        workArrangement,
      } = req.body;
      const ObjectId = require('mongoose').Types.ObjectId;
      
      // Check if ID is valid MongoDB ObjectId
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid employee ID' });
      }

      let targetEmployeeId = id;
      let linkedUser = null;

      // Resolve either a real employee id or a user-backed profile id.
      let oldEmployee = await EmployeeModel.findById(id).lean();
      if (!oldEmployee) {
        linkedUser = await UserModel.findById(id)
          .select('employeeRef email firstName lastName fullName status role department jobTitle phoneNumber profilePicture')
          .lean();

        if (linkedUser?.employeeRef) {
          oldEmployee = await EmployeeModel.findById(linkedUser.employeeRef).lean();
          if (oldEmployee) {
            targetEmployeeId = linkedUser.employeeRef.toString();
          }
        }

        if (!oldEmployee && linkedUser?.email) {
          oldEmployee = await EmployeeModel.findOne({ email: linkedUser.email }).lean();
          if (oldEmployee) {
            targetEmployeeId = oldEmployee._id.toString();
          }
        }
      }

      if (!oldEmployee && linkedUser) {
        const userUpdateData = {};
        if (email !== undefined) userUpdateData.email = email.toLowerCase();
        if (phone !== undefined) userUpdateData.phoneNumber = phone || null;
        if (department !== undefined) userUpdateData.department = department || null;
        if (jobTitle !== undefined) userUpdateData.jobTitle = jobTitle || null;
        if (role !== undefined) userUpdateData.role = role || null;
        if (avatar !== undefined && avatar) {
          try {
            const allowedTypes = /^image\/(jpeg|jpg|png|gif|webp)$/;
            validateBase64File(avatar, 2, allowedTypes);
            userUpdateData.profilePicture = avatar;
          } catch (validationError) {
            return res.status(400).json({
              success: false,
              message: `Avatar validation failed: ${validationError.message}`
            });
          }
        }

        const updatedUser = await UserModel.findByIdAndUpdate(id, userUpdateData, {
          new: true,
          runValidators: true,
        }).lean();

        if (!updatedUser) {
          return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        return res.json({
          success: true,
          message: 'Profile updated successfully',
          data: {
            id: updatedUser._id.toString(),
            _id: updatedUser._id,
            name: updatedUser.fullName || [updatedUser.firstName, updatedUser.lastName].filter(Boolean).join(' ') || updatedUser.email,
            email: updatedUser.email,
            phone: updatedUser.phoneNumber || '',
            dateOfBirth: '',
            department: updatedUser.department || '',
            role: updatedUser.role || 'Employee',
            jobTitle: updatedUser.jobTitle || updatedUser.role || 'Employee',
            startDate: '',
            status: updatedUser.status || 'Active',
            avatar: updatedUser.profilePicture || '',
            salary: 0,
            paySchedule: '',
            bonus: 0,
            allowances: 0,
            address: '',
            emergencyContact: { name: '', relationship: '', phone: '' },
            employeeId: null,
            managerId: null,
            managerName: '',
            location: '',
            workArrangement: '',
            employmentType: '',
            _synthetic: true,
          },
        });
      }

      if (!oldEmployee) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }

      // Names are sourced from signup user identity when linked.
      // This prevents employees from manually changing first/last name in profile edits.
      let authoritativeNameSource = null;
      if (oldEmployee.userRef) {
        authoritativeNameSource = await UserModel.findById(oldEmployee.userRef)
          .select('firstName lastName')
          .lean();
      }

      // Find and update employee
      const updateData = {};
      const changes = [];
      
      // Always allow these fields to be updated
      if (authoritativeNameSource?.firstName || authoritativeNameSource?.lastName) {
        const authoritativeFirstName = authoritativeNameSource.firstName || oldEmployee.firstName || '';
        const authoritativeLastName = authoritativeNameSource.lastName || oldEmployee.lastName || '';

        if (authoritativeFirstName !== oldEmployee.firstName) {
          updateData.firstName = authoritativeFirstName;
          changes.push({ field: 'firstName', oldValue: oldEmployee.firstName, newValue: authoritativeFirstName });
        }
        if (authoritativeLastName !== oldEmployee.lastName) {
          updateData.lastName = authoritativeLastName;
          changes.push({ field: 'lastName', oldValue: oldEmployee.lastName, newValue: authoritativeLastName });
        }
      } else {
        if (firstName !== undefined && firstName !== oldEmployee.firstName) {
          updateData.firstName = firstName;
          changes.push({ field: 'firstName', oldValue: oldEmployee.firstName, newValue: firstName });
        }
        if (lastName !== undefined && lastName !== oldEmployee.lastName) {
          updateData.lastName = lastName;
          changes.push({ field: 'lastName', oldValue: oldEmployee.lastName, newValue: lastName });
        }
      }
      if (email !== undefined && email.toLowerCase() !== oldEmployee.email) {
        updateData.email = email.toLowerCase();
        changes.push({ field: 'email', oldValue: oldEmployee.email, newValue: email.toLowerCase() });
      }
      if (phone !== undefined && phone !== oldEmployee.phone) {
        updateData.phone = phone;
        changes.push({ field: 'phone', oldValue: oldEmployee.phone, newValue: phone });
      }
      if (dateOfBirth !== undefined && dateOfBirth !== oldEmployee.dateOfBirth) {
        updateData.dateOfBirth = dateOfBirth;
        changes.push({ field: 'dateOfBirth', oldValue: oldEmployee.dateOfBirth, newValue: dateOfBirth });
      }
      if (address !== undefined && address !== oldEmployee.address) {
        updateData.address = address;
        changes.push({ field: 'address', oldValue: oldEmployee.address, newValue: address });
      }
      if (emergencyContact !== undefined) {
        const parsedContact = typeof emergencyContact === 'string' ? JSON.parse(emergencyContact) : emergencyContact;
        updateData.emergencyContact = parsedContact;
        changes.push({ field: 'emergencyContact', oldValue: oldEmployee.emergencyContact, newValue: parsedContact });
      }

      // Handle avatar base64 upload
      if (avatar && avatar !== oldEmployee.avatar) {
        try {
          // Validate base64 avatar (2MB limit, image types only)
          const allowedTypes = /^image\/(jpeg|jpg|png|gif|webp)$/;
          validateBase64File(avatar, 2, allowedTypes);
          
          updateData.avatar = avatar; // Store base64 data URL directly
          changes.push({ field: 'avatar', oldValue: 'hidden', newValue: 'updated' });
        } catch (validationError) {
          return res.status(400).json({ 
            success: false, 
            message: `Avatar validation failed: ${validationError.message}` 
          });
        }
      }

      // Check if current user is HR to allow these updates
      // (In a real app, you'd verify the current user's role from the JWT token)
      if (department !== undefined && department !== oldEmployee.department) {
        updateData.department = department;
        changes.push({ field: 'department', oldValue: oldEmployee.department, newValue: department });
      }
      if (jobTitle !== undefined && jobTitle !== oldEmployee.jobTitle) {
        updateData.jobTitle = jobTitle;
        changes.push({ field: 'jobTitle', oldValue: oldEmployee.jobTitle, newValue: jobTitle });
      }
      if (role !== undefined && role !== oldEmployee.role) {
        updateData.role = role;
        changes.push({ field: 'role', oldValue: oldEmployee.role, newValue: role });
      }
      if (status !== undefined && status !== oldEmployee.status) {
        updateData.status = status;
        changes.push({ field: 'status', oldValue: oldEmployee.status, newValue: status });
      }
      if (salary !== undefined && parseFloat(salary) !== oldEmployee.salary) {
        updateData.salary = parseFloat(salary);
        changes.push({ field: 'salary', oldValue: oldEmployee.salary, newValue: parseFloat(salary) });
      }
      if (paySchedule !== undefined && paySchedule !== oldEmployee.paySchedule) {
        updateData.paySchedule = paySchedule || undefined;
        changes.push({ field: 'paySchedule', oldValue: oldEmployee.paySchedule, newValue: paySchedule || undefined });
      }
      if (bonus !== undefined && parseFloat(bonus || 0) !== Number(oldEmployee.bonus || 0)) {
        updateData.bonus = parseFloat(bonus || 0);
        changes.push({ field: 'bonus', oldValue: oldEmployee.bonus || 0, newValue: parseFloat(bonus || 0) });
      }
      if (allowances !== undefined && parseFloat(allowances || 0) !== Number(oldEmployee.allowances || 0)) {
        updateData.allowances = parseFloat(allowances || 0);
        changes.push({ field: 'allowances', oldValue: oldEmployee.allowances || 0, newValue: parseFloat(allowances || 0) });
      }
      if (startDate !== undefined) {
        const normalizedStartDate = startDate ? new Date(startDate) : null;
        const oldStartDate = oldEmployee.startDate ? new Date(oldEmployee.startDate).toISOString() : null;
        const newStartDate = normalizedStartDate ? normalizedStartDate.toISOString() : null;
        if (oldStartDate !== newStartDate) {
          updateData.startDate = normalizedStartDate;
          changes.push({ field: 'startDate', oldValue: oldEmployee.startDate, newValue: normalizedStartDate });
        }
      }
      if (employmentType !== undefined && employmentType !== oldEmployee.employmentType) {
        updateData.employmentType = employmentType || undefined;
        changes.push({ field: 'employmentType', oldValue: oldEmployee.employmentType, newValue: employmentType || undefined });
      }
      if (managerId !== undefined && managerId !== oldEmployee.managerId) {
        updateData.managerId = managerId || '';
        changes.push({ field: 'managerId', oldValue: oldEmployee.managerId, newValue: managerId || '' });
      }
      if (managerName !== undefined && managerName !== oldEmployee.managerName) {
        updateData.managerName = managerName || '';
        changes.push({ field: 'managerName', oldValue: oldEmployee.managerName, newValue: managerName || '' });
      }
      if (location !== undefined && location !== oldEmployee.location) {
        updateData.location = location || '';
        changes.push({ field: 'location', oldValue: oldEmployee.location, newValue: location || '' });
      }
      if (workArrangement !== undefined && workArrangement !== oldEmployee.workArrangement) {
        updateData.workArrangement = workArrangement || undefined;
        changes.push({ field: 'workArrangement', oldValue: oldEmployee.workArrangement, newValue: workArrangement || undefined });
      }
      if (documents !== undefined) {
        const normalizedDocuments = Array.isArray(documents)
          ? documents
              .filter((doc) => doc && (doc.name || doc.title))
              .map((doc) => ({
                name: String(doc.name || doc.title || '').trim(),
                type: String(doc.type || doc.category || 'File').trim(),
                fileData: doc.fileData || doc.url || '',
                url: doc.url || doc.fileData || '',
                fileSize: Number(doc.fileSize || 0),
                uploadedAt: doc.uploadedAt ? new Date(doc.uploadedAt) : new Date(),
                uploadedBy: String(doc.uploadedBy || updatedBy || 'system'),
              }))
          : [];

        updateData.documents = normalizedDocuments;
        changes.push({ field: 'documents', oldValue: `count:${(oldEmployee.documents || []).length}`, newValue: `count:${normalizedDocuments.length}` });
      }

      const employee = await EmployeeModel.findByIdAndUpdate(
        targetEmployeeId,
        updateData,
        { new: true }
      ).select('-__v').lean();

      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }

      // Create audit log entry
      if (changes.length > 0) {
        await AuditLogModel.create({
          actor: {
            userId: String(updatedBy || 'system'),
            userName: req.user?.fullName || req.user?.email || 'System',
            userEmail: req.user?.email || '',
            initials: String(req.user?.fullName || req.user?.email || 'SY')
              .substring(0, 2)
              .toUpperCase(),
          },
          action: 'User Updated',
          actionColor: 'blue',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          description: `Employee ${employee.name || employee.email} updated (${changes.length} change(s))`,
          status: 'Success',
          metadata: {
            employeeId: targetEmployeeId,
            employeeName: employee.name,
            changes,
          },
        });
      }

      // Sync shared fields to linked User account
      try {
        if (employee.userRef) {
          const syncData = {};
          if (role !== undefined) syncData.role = role;
          if (email !== undefined) syncData.email = email.toLowerCase();
          if (department !== undefined) syncData.department = department;
          if (jobTitle !== undefined) syncData.jobTitle = jobTitle;
          if (phone !== undefined) syncData.phoneNumber = phone;
          if (Object.keys(syncData).length > 0) {
            await UserModel.findByIdAndUpdate(employee.userRef, syncData);
          }
        }
      } catch (syncErr) {
        console.error('Error syncing employee update to user:', syncErr);
      }

      // Format response
      const response = {
        id: employee._id.toString(),
        _id: employee._id,
        name: employee.name,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        phone: employee.phone || '',
        dateOfBirth: employee.dateOfBirth,
        department: employee.department,
        role: employee.role,
        jobTitle: employee.jobTitle || employee.role,
        startDate: employee.startDate,
        status: employee.status || 'Active',
        avatar: employee.avatar || '',
        salary: employee.salary || 0,
        paySchedule: employee.paySchedule || '',
        bonus: employee.bonus || 0,
        allowances: employee.allowances || 0,
        address: employee.address || '',
        emergencyContact: employee.emergencyContact || { name: '', relationship: '', phone: '' },
        employeeId: employee.employeeId,
        managerId: employee.managerId,
        managerName: employee.managerName || '',
        documents: employee.documents || [],
        location: employee.location || '',
        workArrangement: employee.workArrangement || '',
        employmentType: employee.employmentType || '',
      };

      res.json({ success: true, data: response, message: 'Employee updated successfully' });
    } catch (err) {
      console.error('Error updating employee:', err);
      res.status(500).json({ success: false, message: 'Failed to update employee', error: err.message });
    }
  });



  // Delete employee by ID
  app.delete('/api/hr/employees/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const ObjectId = require('mongoose').Types.ObjectId;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid employee ID' });
      }

      const deleted = await EmployeeModel.findByIdAndDelete(id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }

      // Also remove linked User account
      try {
        if (deleted.userRef) {
          await UserModel.findByIdAndDelete(deleted.userRef);
        }
      } catch (linkErr) {
        console.error('Error deleting linked user:', linkErr);
      }

      // Create audit log
      await AuditLogModel.create({
        userId: req.body.deletedBy || 'system',
        action: 'DELETE_EMPLOYEE',
        resource: 'Employee',
        resourceId: id,
        details: { employeeName: deleted.name, email: deleted.email },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({ success: true, message: 'Employee deleted successfully' });
    } catch (err) {
      console.error('Error deleting employee:', err);
      res.status(500).json({ success: false, message: 'Failed to delete employee', error: err.message });
    }
  });

  // Get activity log for an employee
  app.get('/api/hr/employees/:id/activity', async (req, res) => {
    try {
      const { id } = req.params;
      const { limit = 50 } = req.query;

      const activities = await AuditLogModel.find({
        $or: [
          { resourceId: id },
          { 'details.employeeId': id }
        ]
      })
        .sort({ timestamp: -1 })
        .limit(parseInt(limit))
        .lean();

      const formattedActivities = activities.map(activity => ({
        id: activity._id.toString(),
        action: activity.action,
        userId: activity.userId,
        timestamp: activity.timestamp,
        details: activity.details,
        ipAddress: activity.ipAddress,
      }));

      res.json({ success: true, data: formattedActivities });
    } catch (err) {
      console.error('Error fetching activity log:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch activity log', error: err.message });
    }
  });

  // Requisitions - Get all job requisitions
  app.get('/api/hr/requisitions', async (req, res) => {
    try {
      const requisitions = await JobRequisitionModel.find()
        .select('-__v')
        .sort({ createdAt: -1 })
        .lean();

      // Transform to match frontend expected format
      const formattedRequisitions = requisitions.map(req => ({
        id: req._id.toString(),
        _id: req._id,
        title: req.title,
        department: req.department,
        status: req.status,
        experienceLevel: req.experienceLevel,
        description: req.description,
        candidates: req.candidates || 0,
        progressPct: req.progressPct || 0,
        createdAt: req.createdAt,
      }));

      res.json(formattedRequisitions);
    } catch (err) {
      console.error('Error fetching requisitions:', err);
      res.status(500).json({ message: 'Failed to fetch requisitions', error: err.message });
    }
  });

  // Add new requisition (job posting)
  app.post('/api/hr/requisitions', async (req, res) => {
    try {
      const { title, department, status, experienceLevel, description } = req.body;
      
      if (!title || !department) {
        return res.status(400).json({ message: 'Title and department are required' });
      }

      const newRequisition = new JobRequisitionModel({
        title,
        department,
        status: status || 'draft',
        experienceLevel: experienceLevel || 'mid',
        description: description || '',
        candidates: 0,
        progressPct: 0,
      });

      await newRequisition.save();

      const response = {
        id: newRequisition._id.toString(),
        _id: newRequisition._id,
        title: newRequisition.title,
        department: newRequisition.department,
        status: newRequisition.status,
        experienceLevel: newRequisition.experienceLevel,
        description: newRequisition.description,
        candidates: newRequisition.candidates,
        progressPct: newRequisition.progressPct,
        createdAt: newRequisition.createdAt,
      };

      res.status(201).json({ success: true, data: response });
    } catch (err) {
      console.error('Error creating requisition:', err);
      res.status(500).json({ success: false, message: 'Failed to create requisition', error: err.message });
    }
  });

  // Analytics - Calculate from actual data
  app.get('/api/hr/analytics', async (req, res) => {
    try {
      const range = req.query.range === 'ytd' ? 'ytd' : '6m';

      const now = new Date();
      const startOfCurrentMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0,
        0
      );
      const monthCount = range === 'ytd' ? now.getMonth() + 1 : 6;
      const firstMonthStart = new Date(
        startOfCurrentMonth.getFullYear(),
        startOfCurrentMonth.getMonth() - (monthCount - 1),
        1,
        0,
        0,
        0,
        0
      );

      const [
        totalEmployees,
        activeEmployees,
        newHires,
        hiresRows,
        exitsRows,
      ] = await Promise.all([
        EmployeeModel.countDocuments(),
        EmployeeModel.countDocuments({ status: 'Active' }),
        EmployeeModel.countDocuments({
          startDate: { $gte: startOfCurrentMonth, $lte: now },
        }),
        EmployeeModel.aggregate([
          {
            $match: {
              startDate: { $gte: firstMonthStart, $lte: now },
            },
          },
          {
            $group: {
              _id: {
                y: { $year: '$startDate' },
                m: { $month: '$startDate' },
              },
              count: { $sum: 1 },
            },
          },
        ]),
        EmployeeModel.aggregate([
          {
            $match: {
              status: { $in: ['Inactive', 'Terminated'] },
              updatedAt: { $gte: firstMonthStart, $lte: now },
            },
          },
          {
            $group: {
              _id: {
                y: { $year: '$updatedAt' },
                m: { $month: '$updatedAt' },
              },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      const hiresByMonth = {};
      const exitsByMonth = {};

      hiresRows.forEach((row) => {
        const key = `${row._id.y}-${String(row._id.m).padStart(2, '0')}`;
        hiresByMonth[key] = row.count;
      });

      exitsRows.forEach((row) => {
        const key = `${row._id.y}-${String(row._id.m).padStart(2, '0')}`;
        exitsByMonth[key] = row.count;
      });

      const months = [];
      const turnoverRates = [];
      const hiresTrend = [];
      const exitsTrend = [];

      for (let i = 0; i < monthCount; i += 1) {
        const monthDate = new Date(
          firstMonthStart.getFullYear(),
          firstMonthStart.getMonth() + i,
          1
        );
        const monthKey = `${monthDate.getFullYear()}-${String(
          monthDate.getMonth() + 1
        ).padStart(2, '0')}`;
        const monthLabel = monthDate.toLocaleString('en-US', { month: 'short' });

        const hiresCount = Number(hiresByMonth[monthKey] || 0);
        const exitsCount = Number(exitsByMonth[monthKey] || 0);
        const turnoverRate = Number(
          ((exitsCount / Math.max(1, activeEmployees)) * 100).toFixed(1)
        );

        months.push(monthLabel);
        turnoverRates.push(turnoverRate);
        hiresTrend.push(hiresCount);
        exitsTrend.push(exitsCount);
      }

      res.json({
        turnoverRates,
        months,
        newHires,
        totalEmployees,
        activeEmployees,
        hiresTrend,
        exitsTrend,
      });
    } catch (err) {
      console.error('Error fetching analytics:', err);
      res.status(500).json({ message: 'Failed to fetch analytics', error: err.message });
    }
  });

  // Legacy Leave Requests endpoint (uses new Leave Request model via api.js)
  app.get('/api/hr/leave-requests', authMiddleware, async (req, res) => {
    try {
      const requests = await api.getLeaveRequests({
        status: { $in: ['pending_manager', 'pending_hr', 'approved_manager', 'pending'] },
      });

      const currentUserId = String(req.user?._id || '');
      const currentUserEmail = String(req.user?.email || '').toLowerCase().trim();
      const currentUserName = String(req.user?.fullName || '').toLowerCase().trim();

      const canActOnRequest = (request) => {
        const pendingStep = Array.isArray(request.approvalChain)
          ? request.approvalChain.find((step) => step?.status === 'pending')
          : null;

        if (pendingStep) {
          return (
            (pendingStep.approverId && String(pendingStep.approverId).trim() === currentUserId) ||
            (pendingStep.approverEmail && String(pendingStep.approverEmail).toLowerCase().trim() === currentUserEmail) ||
            (pendingStep.approverName && String(pendingStep.approverName).toLowerCase().trim() === currentUserName)
          );
        }

        // Legacy fallback: HR users can handle pending_hr requests.
        if (String(request.status || '').toLowerCase() === 'pending_hr') {
          return ['hr', 'admin'].includes(String(req.user?.role || '').toLowerCase());
        }

        return false;
      };
      
      const formatted = requests.slice(0, 10).map(req => ({
        id: req._id.toString(),
        name: req.employeeName,
        type: req.leaveType,
        range: `${new Date(req.fromDate).toLocaleDateString()} - ${new Date(req.toDate).toLocaleDateString()}`,
        status: req.status,
        approvalChain: req.approvalChain || [],
        currentApprovalLevel: req.currentApprovalLevel || 1,
        usesRuleBasedApproval: !!req.usesRuleBasedApproval,
        currentApprover:
          (Array.isArray(req.approvalChain) ? req.approvalChain.find((s) => s?.status === 'pending')?.approverName : null) ||
          req.managerName ||
          null,
        currentApproverRole:
          (Array.isArray(req.approvalChain) ? req.approvalChain.find((s) => s?.status === 'pending')?.approverRole : null) ||
          (String(req.status || '').toLowerCase() === 'pending_hr' ? 'HR' : 'Manager'),
        canAct: canActOnRequest(req),
      }));

      res.json(formatted);
    } catch (err) {
      console.error('Error fetching leave requests:', err);
      res.json([]); // Return empty array for dashboard compatibility
    }
  });

  app.post('/api/hr/leave-requests/:id/approve', authMiddleware, async (req, res) => {
    try {
      const leaveRequest = await LeaveRequestModel.findById(req.params.id);
      if (!leaveRequest) {
        return res.status(404).json({ message: 'Leave request not found' });
      }

      const currentUserId = String(req.user?._id || '');
      const currentUserEmail = String(req.user?.email || '').toLowerCase().trim();
      const currentUserName = String(req.user?.fullName || '').toLowerCase().trim();

      const pendingStep = Array.isArray(leaveRequest.approvalChain)
        ? leaveRequest.approvalChain.find((step) => step?.status === 'pending')
        : null;

      const isPendingStepApprover = !!pendingStep && (
        (pendingStep.approverId && String(pendingStep.approverId).trim() === currentUserId) ||
        (pendingStep.approverEmail && String(pendingStep.approverEmail).toLowerCase().trim() === currentUserEmail) ||
        (pendingStep.approverName && String(pendingStep.approverName).toLowerCase().trim() === currentUserName)
      );

      const isHrFallbackApprover =
        String(leaveRequest.status || '').toLowerCase() === 'pending_hr' &&
        ['hr', 'admin'].includes(String(req.user?.role || '').toLowerCase());

      if (!isPendingStepApprover && !isHrFallbackApprover) {
        return res.status(403).json({ message: 'Only the assigned approver can approve this leave request' });
      }

      if (pendingStep) {
        pendingStep.status = 'approved';
        pendingStep.approvedAt = new Date();
        pendingStep.comments = 'Approved from HR dashboard';

        const nextStep = leaveRequest.approvalChain.find((step) => step?.status === 'awaiting');
        if (nextStep) {
          nextStep.status = 'pending';
          leaveRequest.currentApprovalLevel = nextStep.level || leaveRequest.currentApprovalLevel || 1;
          leaveRequest.status = 'pending_manager';
          await leaveRequest.save();
          return res.json({ message: 'Approved and forwarded to next approver', success: true, data: leaveRequest });
        }
      }

      leaveRequest.status = 'approved';
      leaveRequest.hrApprovedAt = new Date();
      leaveRequest.hrComments = 'Approved from HR dashboard';
      await leaveRequest.save();

      res.json({ message: 'Approved', success: true, data: leaveRequest });
    } catch (err) {
      console.error('Error approving leave:', err);
      res.status(500).json({ message: 'Failed to approve', error: err.message });
    }
  });

  app.post('/api/hr/leave-requests/:id/reject', authMiddleware, async (req, res) => {
    try {
      const leaveRequest = await LeaveRequestModel.findById(req.params.id);
      if (!leaveRequest) {
        return res.status(404).json({ message: 'Leave request not found' });
      }

      const currentUserId = String(req.user?._id || '');
      const currentUserEmail = String(req.user?.email || '').toLowerCase().trim();
      const currentUserName = String(req.user?.fullName || '').toLowerCase().trim();

      const pendingStep = Array.isArray(leaveRequest.approvalChain)
        ? leaveRequest.approvalChain.find((step) => step?.status === 'pending')
        : null;

      const isPendingStepApprover = !!pendingStep && (
        (pendingStep.approverId && String(pendingStep.approverId).trim() === currentUserId) ||
        (pendingStep.approverEmail && String(pendingStep.approverEmail).toLowerCase().trim() === currentUserEmail) ||
        (pendingStep.approverName && String(pendingStep.approverName).toLowerCase().trim() === currentUserName)
      );

      const isHrFallbackApprover =
        String(leaveRequest.status || '').toLowerCase() === 'pending_hr' &&
        ['hr', 'admin'].includes(String(req.user?.role || '').toLowerCase());

      if (!isPendingStepApprover && !isHrFallbackApprover) {
        return res.status(403).json({ message: 'Only the assigned approver can reject this leave request' });
      }

      if (pendingStep) {
        pendingStep.status = 'rejected';
        pendingStep.approvedAt = new Date();
        pendingStep.comments = 'Rejected from HR dashboard';
      }

      leaveRequest.status = 'rejected';
      leaveRequest.hrRejectedAt = new Date();
      leaveRequest.hrComments = 'Rejected from HR dashboard';
      await leaveRequest.save();

      res.json({ message: 'Rejected', success: true, data: leaveRequest });
    } catch (err) {
      console.error('Error rejecting leave:', err);
      res.status(500).json({ message: 'Failed to reject', error: err.message });
    }
  });

  // Performance - Calculate from actual data
  app.get('/api/hr/performance', async (_req, res) => {
    try {
      // TODO: Implement actual performance tracking
      // For now, return default structure
      res.json({ 
        q3CompletedPct: 85, 
        pending: { 
          selfReviews: 12, 
          managerReviews: 4 
        } 
      });
    } catch (err) {
      console.error('Error fetching performance:', err);
      res.status(500).json({ message: 'Failed to fetch performance data', error: err.message });
    }
  });

  // Training - Get from database
  app.get('/api/hr/training', async (_req, res) => {
    try {
      const trainings = await TrainingModel.find({ status: 'active' })
        .select('-__v')
        .sort({ dueDate: 1 })
        .limit(10)
        .lean();

      // Calculate dueInDays for each training
      const now = new Date();
      const formatted = trainings.map(t => {
        let dueInDays = null;
        if (t.dueDate) {
          const due = new Date(t.dueDate);
          const diffTime = due - now;
          dueInDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
        
        return {
          id: t._id.toString(),
          _id: t._id,
          name: t.name,
          description: t.description,
          dueInDays,
          dueDate: t.dueDate,
          completionPercent: t.completionPercent || 0,
          icon: t.icon || 'book',
          category: t.category,
          mandatory: t.mandatory,
        };
      });

      res.json(formatted);
    } catch (err) {
      console.error('Error fetching training:', err);
      res.json([]); // Return empty array for compatibility
    }
  });

  // Payroll Next - TODO: Implement payroll tracking
  app.get('/api/hr/payroll-next', async (_req, res) => {
    try {
      // TODO: Implement actual payroll tracking
      // For now, return default structure
      const nextPayrollDate = new Date();
      nextPayrollDate.setDate(nextPayrollDate.getDate() + (31 - nextPayrollDate.getDate()));
      
      res.json({ 
        date: nextPayrollDate.toISOString().split('T')[0], 
        runApproved: true 
      });
    } catch (err) {
      console.error('Error fetching payroll info:', err);
      res.status(500).json({ message: 'Failed to fetch payroll data', error: err.message });
    }
  });

  // ===========================
  // Leave Allocation Routes
  // ===========================
  
  // Get leave allocations (with optional filters)
  app.get('/api/hr/leave-allocations', async (req, res) => {
    try {
      const query = {};
      if (req.query.employeeId) query.employeeId = req.query.employeeId;
      if (req.query.year) query.year = parseInt(req.query.year);
      
      const allocations = await api.getLeaveAllocations(query);
      res.json({ success: true, data: allocations });
    } catch (error) {
      console.error('Error fetching leave allocations:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create or update leave allocation
  app.post('/api/hr/leave-allocations', async (req, res) => {
    try {
      const allocation = await api.createLeaveAllocation(req.body);
      res.status(201).json({ success: true, data: allocation });
    } catch (error) {
      console.error('Error creating leave allocation:', error);
      const isValidationError = /required|invalid|validation|not found/i.test(error.message || '');
      res.status(isValidationError ? 400 : 500).json({ success: false, error: error.message });
    }
  });

  // ===========================
  // Leave Request Routes
  // ===========================
  
  // Get leave requests (with optional filters)
  app.get('/api/approval/leave-requests', async (req, res) => {
    try {
      const query = {};
      if (req.query.employeeId) query.employeeId = req.query.employeeId;
      if (req.query.managerId) query.managerId = req.query.managerId;
      if (req.query.status) query.status = req.query.status;
      
      const requests = await api.getLeaveRequests(query);
      res.json({ success: true, data: requests });
    } catch (error) {
      console.error('Error fetching leave requests:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create leave request
  app.post('/api/approval/leave-requests', async (req, res) => {
    try {
      const request = await api.createLeaveRequest(req.body);
      res.status(201).json({ success: true, data: request });
    } catch (error) {
      console.error('Error creating leave request:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Manager approves leave request
  app.post('/api/approval/leave-requests/:id/manager-approve', async (req, res) => {
    try {
      const { comments } = req.body;
      const request = await api.updateLeaveRequestStatus(
        req.params.id,
        'approved_manager',
        comments,
        'manager'
      );
      
      // Send email to HR for final approval
      // You can add email logic here
      
      res.json({ success: true, data: request });
    } catch (error) {
      console.error('Error approving leave request:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Manager rejects leave request
  app.post('/api/approval/leave-requests/:id/manager-reject', async (req, res) => {
    try {
      const { comments } = req.body;
      const request = await api.updateLeaveRequestStatus(
        req.params.id,
        'rejected_manager',
        comments,
        'manager'
      );
      
      res.json({ success: true, data: request });
    } catch (error) {
      console.error('Error rejecting leave request:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // HR approves leave request (final approval)
  app.post('/api/approval/leave-requests/:id/hr-approve', async (req, res) => {
    try {
      const { comments } = req.body;
      const request = await api.updateLeaveRequestStatus(
        req.params.id,
        'approved',
        comments,
        'hr'
      );
      
      // Update leave allocation usage
      const allocation = await api.getLeaveAllocations({
        employeeId: request.employeeId,
        year: new Date(request.fromDate).getFullYear()
      });
      
      if (allocation && allocation.length > 0 && request.leaveType !== 'unpaid') {
        await api.updateLeaveUsage(
          request.employeeId,
          new Date(request.fromDate).getFullYear(),
          request.leaveType,
          request.days
        );
      }
      
      res.json({ success: true, data: request });
    } catch (error) {
      console.error('Error approving leave request:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // HR rejects leave request
  app.post('/api/approval/leave-requests/:id/hr-reject', async (req, res) => {
    try {
      const { comments } = req.body;
      const request = await api.updateLeaveRequestStatus(
        req.params.id,
        'rejected',
        comments,
        'hr'
      );
      
      res.json({ success: true, data: request });
    } catch (error) {
      console.error('Error rejecting leave request:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Send leave approval email (to manager or HR)
  app.post('/api/send-leave-approval-email', async (req, res) => {
    try {
      const {
        to,
        employeeName,
        employeeId,
        leaveType,
        fromDate,
        toDate,
        days,
        reason,
        managerName,
        approvalStage
      } = req.body;

      await sendApprovalEmail({
        to,
        employeeName,
        employeeId,
        amount: `${days} days`,
        reason: reason || 'N/A',
        approver: managerName,
        requestType: `leave (${leaveType})`,
        additionalInfo: `From: ${fromDate}, To: ${toDate}\nApproval Stage: ${approvalStage}`,
      });

      res.json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
      console.error('Error sending leave approval email:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===========================
  // Travel Request Routes
  // ===========================
  
  // Get travel requests (with optional filters)
  app.get('/api/approval/travel-requests', async (req, res) => {
    try {
      const query = {};
      if (req.query.employeeId) query.employeeId = req.query.employeeId;
      if (req.query.managerId) query.managerId = req.query.managerId;
      if (req.query.status) query.status = req.query.status;
      
      const requests = await api.getTravelRequests(query);
      res.json({ success: true, data: requests });
    } catch (error) {
      console.error('Error fetching travel requests:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create travel request
  app.post('/api/approval/travel-requests', async (req, res) => {
    try {
      const request = await api.createTravelRequest(req.body);
      res.status(201).json({ success: true, data: request });
    } catch (error) {
      console.error('Error creating travel request:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Manager approves travel request
  app.post('/api/approval/travel-requests/:id/manager-approve', async (req, res) => {
    try {
      const { comments } = req.body;
      const request = await api.updateTravelRequestStatus(
        req.params.id,
        'approved_manager',
        comments,
        'manager'
      );
      
      res.json({ success: true, data: request });
    } catch (error) {
      console.error('Error approving travel request:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Manager rejects travel request
  app.post('/api/approval/travel-requests/:id/manager-reject', async (req, res) => {
    try {
      const { comments } = req.body;
      const request = await api.updateTravelRequestStatus(
        req.params.id,
        'rejected_manager',
        comments,
        'manager'
      );
      
      res.json({ success: true, data: request });
    } catch (error) {
      console.error('Error rejecting travel request:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update travel booking details (after manager approval)
  app.post('/api/approval/travel-requests/:id/book', async (req, res) => {
    try {
      const bookingData = {
        ticketBooked: req.body.ticketBooked || false,
        bookedBy: req.body.bookedBy,
        bookingReference: req.body.bookingReference,
        hotelBooked: req.body.hotelBooked || false,
        hotelDetails: req.body.hotelDetails,
      };
      
      const request = await api.updateTravelBooking(req.params.id, bookingData);
      res.json({ success: true, data: request });
    } catch (error) {
      console.error('Error booking travel:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Send travel approval email (to manager)
  app.post('/api/send-travel-approval-email', async (req, res) => {
    try {
      const {
        to,
        employeeName,
        employeeId,
        currentLocation,
        destination,
        purpose,
        fromDate,
        toDate,
        numberOfDays,
        numberOfNights,
        accommodationRequired,
        budget,
        managerName,
        approvalStage
      } = req.body;

      await sendApprovalEmail({
        to,
        employeeName,
        employeeId,
        amount: `Budget: $${budget}`,
        reason: purpose,
        approver: managerName,
        requestType: 'travel',
        additionalInfo: `From: ${currentLocation} → ${destination}\nDates: ${fromDate} to ${toDate}\nDuration: ${numberOfDays} days, ${numberOfNights} nights\nAccommodation: ${accommodationRequired ? 'Required' : 'Not Required'}\nApproval Stage: ${approvalStage}\n\nNote: Tickets can only be booked after manager approval.`,
      });

      res.json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
      console.error('Error sending travel approval email:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // =====================================================
  // USER PROFILE ENDPOINTS
  // =====================================================
  
  // Get user profile by clerk ID
  app.get('/api/user/profile/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const user = await api.getUserById(id);
      
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      
      res.json({ success: true, data: user });
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create or update user profile
  app.post('/api/user/profile', async (req, res) => {
    try {
      const { id, email, fullName, phoneNumber, department, jobTitle, bio } = req.body;
      
      if (!id || !email || !fullName) {
        return res.status(400).json({ 
          success: false, 
          error: 'Missing required fields: id, email, fullName' 
        });
      }
      
      const user = await api.createOrUpdateUserProfile({
        id,
        email,
        fullName,
        phoneNumber,
        department,
        jobTitle,
        bio,
      });
      
      res.json({ success: true, data: user });
    } catch (error) {
      console.error('Error creating/updating user profile:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update user profile
  app.put('/api/user/profile/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { phoneNumber, department, jobTitle, bio, fullName, email } = req.body;
      
      const user = await api.updateUserProfile(id, {
        phoneNumber,
        department,
        jobTitle,
        bio,
        fullName,
        email,
      });
      
      res.json({ success: true, data: user });
    } catch (error) {
      console.error('Error updating user profile:', error);
      if (error.message === 'User not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Upload profile picture
  app.post('/api/user/profile/:id/upload-picture', async (req, res) => {
    try {
      const { id } = req.params;
      const { pictureUrl } = req.body;
      
      if (!pictureUrl) {
        return res.status(400).json({ 
          success: false, 
          error: 'Missing pictureUrl' 
        });
      }
      
      const user = await api.updateUserProfilePicture(id, pictureUrl);
      
      res.json({ success: true, data: user });
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      if (error.message === 'User not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get user settings/preferences
  app.get('/api/user/settings/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const user = await UserModel.findById(id)
        .select('preferences email fullName department jobTitle')
        .lean();

      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      res.json({
        success: true,
        data: {
          profile: {
            fullName: user.fullName || '',
            email: user.email || '',
            department: user.department || '',
            jobTitle: user.jobTitle || '',
          },
          preferences: user.preferences || {},
        },
      });
    } catch (error) {
      console.error('Error fetching user settings:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update user settings/preferences
  app.patch('/api/user/settings/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { preferences = {} } = req.body || {};

      const allowedPreferences = {
        theme: preferences.theme,
        language: preferences.language,
        timezone: preferences.timezone,
        dateFormat: preferences.dateFormat,
        currency: preferences.currency,
        emailNotifications: preferences.emailNotifications,
        inAppNotifications: preferences.inAppNotifications,
        weeklyDigest: preferences.weeklyDigest,
      };

      const cleanedPreferences = Object.fromEntries(
        Object.entries(allowedPreferences).filter(([, value]) => value !== undefined),
      );

      const updated = await UserModel.findByIdAndUpdate(
        id,
        { $set: { preferences: cleanedPreferences } },
        { new: true, runValidators: true },
      )
        .select('preferences')
        .lean();

      if (!updated) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      res.json({ success: true, data: updated.preferences || {} });
    } catch (error) {
      console.error('Error updating user settings:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== FINANCE RECONCILIATION ROUTES ====================

  // Get reconciliation data
  app.get('/api/finance/reconciliation', async (req, res) => {
    try {
      // TODO: Fetch actual data from database
      const bankTransactions = [];
      const ledgerTransactions = [];

      res.json({
        success: true,
        data: {
          bankTransactions,
          ledgerTransactions,
          statementStart: 0,
          statementEnd: 0,
          clearedBalance: 0,
        },
      });
    } catch (error) {
      console.error('Error fetching reconciliation data:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Match transactions
  app.post('/api/finance/reconciliation/match', async (req, res) => {
    try {
      const { bankTransactions, ledgerTransactions } = req.body;
      
      // TODO: Implement actual matching logic with database
      // For now, just return success
      
      res.json({
        success: true,
        message: `Matched ${bankTransactions.length} bank transaction(s) with ${ledgerTransactions.length} ledger transaction(s)`,
      });
    } catch (error) {
      console.error('Error matching transactions:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Complete reconciliation
  app.post('/api/finance/reconciliation/complete', async (req, res) => {
    try {
      const { account, period, statementEnd, clearedBalance } = req.body;
      
      // TODO: Save reconciliation record to database
      
      res.json({
        success: true,
        message: 'Reconciliation completed successfully',
        data: {
          account,
          period,
          statementEnd,
          clearedBalance,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Error completing reconciliation:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Save reconciliation draft
  app.post('/api/finance/reconciliation/draft', async (req, res) => {
    try {
      const { account, period, bankTransactions, ledgerTransactions } = req.body;
      
      // TODO: Save draft to database
      
      res.json({
        success: true,
        message: 'Draft saved successfully',
        data: {
          account,
          period,
          savedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Error saving draft:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Import bank statement
  app.post('/api/finance/reconciliation/import', async (req, res) => {
    try {
      const { mapping, ignoreFirstRow } = req.body;
      
      // TODO: Process uploaded CSV file and parse transactions
      // For now, return success with sample data
      
      res.json({
        success: true,
        message: 'Bank statement imported successfully',
        data: {
          imported: 45,
          mapped: mapping,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Error importing bank statement:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  const generateApInvoiceNumber = async () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let attempt = 0;

    while (attempt < 5) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const candidate = `APINV-${stamp}-${suffix}`;
      const exists = await PurchaseOrderModel.exists({ apInvoiceNumber: candidate });
      if (!exists) return candidate;
      attempt += 1;
    }

    return `APINV-${stamp}-${Date.now().toString().slice(-6)}`;
  };

  app.patch('/api/finance/accounts-payable/:invoiceId/bill-to', async (req, res) => {
    try {
      const { invoiceId } = req.params;
      const billTo = String(req.body?.billTo || '').trim();
      const taxRateInput = req.body?.taxRate;
      const parsedTaxRate = Number(taxRateInput);

      if (!invoiceId || !mongoose.Types.ObjectId.isValid(invoiceId)) {
        return res.status(400).json({ success: false, error: 'Invalid invoice ID' });
      }

      if (!billTo) {
        return res.status(400).json({ success: false, error: 'billTo is required' });
      }

      if (!Number.isFinite(parsedTaxRate) || parsedTaxRate < 0 || parsedTaxRate > 100) {
        return res.status(400).json({ success: false, error: 'taxRate is required and must be between 0 and 100' });
      }

      const existing = await PurchaseOrderModel.findById(invoiceId).lean();
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      const baseAmount = Number(existing.totalAmount || 0);
      const apTaxAmount = Number(((baseAmount * parsedTaxRate) / 100).toFixed(2));

      const updated = await PurchaseOrderModel.findByIdAndUpdate(
        invoiceId,
        {
          $set: {
            billTo,
            apTaxRate: parsedTaxRate,
            apTaxAmount,
          },
        },
        { new: true }
      );

      res.json({
        success: true,
        message: 'Payment setup updated successfully',
        data: {
          _id: updated._id,
          billTo: updated.billTo,
          taxRate: Number(updated.apTaxRate || 0),
          taxAmount: Number(updated.apTaxAmount || 0),
          invoiceNumber: updated.apInvoiceNumber || updated.poNumber,
        },
      });
    } catch (error) {
      console.error('Error updating bill-to:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get accounts payable invoices
  app.get('/api/finance/accounts-payable', async (req, res) => {
    try {
      const { vendor, status, page = 1, search = '' } = req.query;
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limit = 20;
      const skip = (pageNum - 1) * limit;

      const query = {
        status: { $in: ['payment_pending', 'partly_paid', 'paid'] },
      };

      if (vendor) {
        query.vendor = vendor;
      }

      if (status) {
        const normalized = String(status).toLowerCase();
        if (normalized === 'paid') query.status = 'paid';
        if (normalized === 'pending' || normalized === 'payment_pending') query.status = 'payment_pending';
        if (normalized === 'partly_paid' || normalized === 'partial' || normalized === 'partly') {
          query.status = 'partly_paid';
        }
      }

      if (search) {
        query.$or = [
          { poNumber: { $regex: String(search), $options: 'i' } },
          { apInvoiceNumber: { $regex: String(search), $options: 'i' } },
          { vendor: { $regex: String(search), $options: 'i' } },
          { billTo: { $regex: String(search), $options: 'i' } },
        ];
      }

      const [rows, total] = await Promise.all([
        PurchaseOrderModel.find(query)
          .populate('linkedMaterialRequestId', 'department requestId requestTitle')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        PurchaseOrderModel.countDocuments(query),
      ]);

      const invoices = rows.map((po) => {
        const baseAmount = Number(po.totalAmount || 0);
        const taxRate = Number(po.apTaxRate ?? 0);
        const taxAmount = Number(po.apTaxAmount ?? ((baseAmount * taxRate) / 100)) || 0;
        const totalAmount = Number((baseAmount + taxAmount).toFixed(2));
        const rawPaidAmount = Number(po.paidAmount || 0);
        const paidAmount =
          po.status === 'paid' && rawPaidAmount <= 0
            ? totalAmount
            : Math.min(rawPaidAmount, totalAmount);
        const balanceDue = Math.max(0, totalAmount - paidAmount);
        const paidPercentage = totalAmount > 0 ? Number(((paidAmount / totalAmount) * 100).toFixed(2)) : 0;

        let uiStatus = 'Pending';
        if (balanceDue <= 0 || po.status === 'paid') uiStatus = 'Paid';
        else if (po.status === 'partly_paid' || paidAmount > 0) uiStatus = 'Partly Paid';

        return {
        _id: po._id,
        vendor: po.vendor,
        billTo: po.billTo || '',
        requestTitle:
          po?.linkedMaterialRequestId?.requestTitle ||
          po?.linkedMaterialRequestId?.requestId ||
          '',
        invoiceNumber: po.apInvoiceNumber || po.poNumber,
        poNumber: po.poNumber,
        issueDate: po.orderDate || po.createdAt,
        dueDate: po.expectedDelivery || po.orderDate || po.createdAt,
        preTaxAmount: baseAmount,
        taxRate,
        taxAmount,
        amount: totalAmount,
        paidAmount,
        balanceDue,
        paidPercentage,
        status: uiStatus,
        department: po?.linkedMaterialRequestId?.department || 'General',
      };
      });

      res.json({
        success: true,
        data: {
          invoices,
          totalPages: Math.ceil(total / limit),
          currentPage: pageNum,
          total,
        },
      });
    } catch (error) {
      console.error('Error fetching accounts payable:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Pay selected invoices
  app.post('/api/finance/accounts-payable/pay', async (req, res) => {
    try {
      const { invoiceIds } = req.body;
      
      if (!invoiceIds || invoiceIds.length === 0) {
        return res.status(400).json({ success: false, error: 'No invoices selected' });
      }
      
      const pendingPurchaseOrders = await PurchaseOrderModel.find({
        _id: { $in: invoiceIds },
        status: { $in: ['payment_pending', 'partly_paid'] },
      })
        .populate('linkedMaterialRequestId', 'budgetCode')
        .lean();

      if (!pendingPurchaseOrders.length) {
        return res.status(400).json({ success: false, error: 'No pending invoices found to pay' });
      }

      const payableIds = [];
      const paidInvoices = [];
      const skippedInvoices = [];
      const now = new Date();
      const paidBy = req.user?._id || req.user?.id || 'system';

      for (const po of pendingPurchaseOrders) {
        const baseAmount = Number(po.totalAmount || 0);
        const taxRate = Number(po.apTaxRate);
        const taxConfigured = Number.isFinite(taxRate) && taxRate >= 0 && taxRate <= 100;
        if (!taxConfigured) {
          skippedInvoices.push({ _id: po._id, reason: 'Tax must be set before payment' });
          continue;
        }

        const apTaxAmount = Number(((baseAmount * taxRate) / 100).toFixed(2));
        const totalAmount = Number((baseAmount + apTaxAmount).toFixed(2));
        const alreadyPaid = Number(po.paidAmount || 0);
        const amountToPay = Math.max(0, totalAmount - alreadyPaid);
        if (amountToPay <= 0) continue;

        const apInvoiceNumber = po.apInvoiceNumber || await generateApInvoiceNumber();
        const finalBillTo =
          String(po.billTo || '').trim();

        if (!finalBillTo) {
          skippedInvoices.push({ _id: po._id, reason: 'Bill To must be set before payment' });
          continue;
        }

        payableIds.push(po._id);

        await PurchaseOrderModel.updateOne(
          { _id: po._id },
          {
            $set: {
              status: 'paid',
              paidDate: now,
              paidAmount: totalAmount,
              paidPercentage: 100,
              apInvoiceNumber,
              billTo: finalBillTo,
              apTaxRate: taxRate,
              apTaxAmount,
            },
            $push: {
              paymentHistory: {
                amount: amountToPay,
                percentage:
                  totalAmount > 0
                    ? Number(((amountToPay / totalAmount) * 100).toFixed(2))
                    : 0,
                paidAt: now,
                paidBy: String(paidBy),
              },
            },
          }
        );

        paidInvoices.push({
          _id: po._id,
          invoiceNumber: apInvoiceNumber,
          billTo: finalBillTo,
          taxRate,
          taxAmount: apTaxAmount,
        });
      }

      if (payableIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No selected invoices are ready for payment. Set Bill To and Tax first.',
          data: { skippedInvoices },
        });
      }

      // Roll up spent amount by budget code so budget lines reflect paid invoices.
      const payableIdSet = new Set(payableIds.map((id) => String(id)));
      const spendByBudgetCode = pendingPurchaseOrders.reduce((acc, po) => {
        if (!payableIdSet.has(String(po._id))) return acc;
        const budgetCode = String(po?.linkedMaterialRequestId?.budgetCode || '').trim();
        if (!budgetCode) return acc;
        const baseAmount = Number(po.totalAmount || 0);
        const taxRate = Number(po.apTaxRate || 0);
        const taxAmount = Number(((baseAmount * taxRate) / 100).toFixed(2));
        const totalAmount = Number((baseAmount + taxAmount).toFixed(2));
        const alreadyPaid = Number(po.paidAmount || 0);
        const amountToPay = Math.max(0, totalAmount - alreadyPaid);
        if (!amountToPay) return acc;
        acc[budgetCode] = (acc[budgetCode] || 0) + amountToPay;
        return acc;
      }, {});

      const budgetUpdateResults = [];
      for (const [budgetCode, amount] of Object.entries(spendByBudgetCode)) {
        if (!amount) continue;

        let updatedBudget = null;
        if (mongoose.Types.ObjectId.isValid(budgetCode)) {
          updatedBudget = await BudgetCategoryModel.findByIdAndUpdate(
            budgetCode,
            { $inc: { spent: amount } },
            { new: true },
          );
        }

        if (!updatedBudget) {
          const escaped = budgetCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          updatedBudget = await BudgetCategoryModel.findOneAndUpdate(
            { name: { $regex: `^${escaped}$`, $options: 'i' } },
            { $inc: { spent: amount } },
            { new: true },
          );
        }

        budgetUpdateResults.push({
          budgetCode,
          amount,
          updated: Boolean(updatedBudget),
        });
      }
      
      res.json({
        success: true,
        message: `Successfully processed payment for ${payableIds.length} invoice(s)`,
        data: {
          paidInvoices,
          skippedInvoices,
          modifiedCount: payableIds.length,
          budgetUpdates: budgetUpdateResults,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Error processing payment:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Pay a single invoice
  app.post('/api/finance/accounts-payable/:invoiceId/pay', async (req, res) => {
    try {
      const { invoiceId } = req.params;
      const payPercentageRaw = Number(req.body?.payPercentage ?? 100);
      const billToInput = String(req.body?.billTo || '').trim();
      const taxRateInput = Number(req.body?.taxRate);

      if (!invoiceId || !mongoose.Types.ObjectId.isValid(invoiceId)) {
        return res.status(400).json({ success: false, error: 'Invalid invoice ID' });
      }

      if (!Number.isFinite(payPercentageRaw) || payPercentageRaw <= 0 || payPercentageRaw > 100) {
        return res.status(400).json({
          success: false,
          error: 'payPercentage must be a number greater than 0 and at most 100',
        });
      }

      const po = await PurchaseOrderModel.findOne({
        _id: invoiceId,
        status: { $in: ['payment_pending', 'partly_paid'] },
      }).populate('linkedMaterialRequestId', 'budgetCode');

      if (!po) {
        return res.status(400).json({ success: false, error: 'Invoice not found or already paid' });
      }

      const baseAmount = Number(po.totalAmount || 0);
      const resolvedTaxRate =
        Number.isFinite(taxRateInput) && taxRateInput >= 0 && taxRateInput <= 100
          ? taxRateInput
          : Number(po.apTaxRate);

      if (!Number.isFinite(resolvedTaxRate) || resolvedTaxRate < 0 || resolvedTaxRate > 100) {
        return res.status(400).json({
          success: false,
          error: 'Please set Tax before processing payment for this PO.',
        });
      }

      const resolvedTaxAmount = Number(((baseAmount * resolvedTaxRate) / 100).toFixed(2));
      const totalAmount = Number((baseAmount + resolvedTaxAmount).toFixed(2));
      const alreadyPaid = Number(po.paidAmount || 0);
      const balanceDue = Math.max(0, totalAmount - alreadyPaid);

      if (balanceDue <= 0) {
        return res.status(400).json({ success: false, error: 'Invoice is already fully paid' });
      }

      const requestedAmount = Number(((totalAmount * payPercentageRaw) / 100).toFixed(2));
      if (requestedAmount <= 0) {
        return res.status(400).json({ success: false, error: 'Payment amount resolves to 0. Increase percentage.' });
      }

      const resolvedBillTo = billToInput || String(po.billTo || '').trim();
      if (!resolvedBillTo) {
        return res.status(400).json({
          success: false,
          error: 'Please set Bill To before processing payment for this PO.',
        });
      }

      if (requestedAmount > balanceDue + 0.001) {
        const maxAllowedPercentage = totalAmount > 0 ? Number(((balanceDue / totalAmount) * 100).toFixed(2)) : 0;
        return res.status(400).json({
          success: false,
          error: `Requested percentage exceeds balance due. Max allowed now is ${maxAllowedPercentage}%`,
        });
      }

      const nextPaidAmount = Number((alreadyPaid + requestedAmount).toFixed(2));
      const nextPaidPercentage = totalAmount > 0 ? Number(((nextPaidAmount / totalAmount) * 100).toFixed(2)) : 0;
      const isFullyPaid = nextPaidAmount >= totalAmount - 0.001;
      const now = new Date();
      const paidBy = req.user?._id || req.user?.id || 'system';
      const paidByName = req.user?.fullName || req.user?.name || req.user?.email || 'System';

      const result = await PurchaseOrderModel.findByIdAndUpdate(
        invoiceId,
        {
          $set: {
            status: isFullyPaid ? 'paid' : 'partly_paid',
            paidDate: isFullyPaid ? now : po.paidDate || null,
            paidAmount: isFullyPaid ? totalAmount : nextPaidAmount,
            paidPercentage: isFullyPaid ? 100 : nextPaidPercentage,
            billTo: resolvedBillTo,
            apTaxRate: resolvedTaxRate,
            apTaxAmount: resolvedTaxAmount,
          },
          $push: {
            paymentHistory: {
              amount: requestedAmount,
              percentage: payPercentageRaw,
              paidAt: now,
              paidBy: String(paidBy),
            },
            activities: {
              type: 'status_change',
              author: paidByName,
              authorId: String(paidBy),
              text: isFullyPaid ? `Processed full payment. Invoice #${po.poNumber} generated.` : `Processed ${payPercentageRaw}% payment. Invoice #${po.poNumber} generated.`,
              timestamp: now,
            }
          },
        },
        { new: true }
      );

      let invoiceNumber = result.apInvoiceNumber || null;
      if (isFullyPaid && !invoiceNumber) {
        invoiceNumber = await generateApInvoiceNumber();
        await PurchaseOrderModel.updateOne(
          { _id: invoiceId },
          { $set: { apInvoiceNumber: invoiceNumber } }
        );
      }

      // Update budget spent amount
      const budgetCode = String(po?.linkedMaterialRequestId?.budgetCode || '').trim();
      let budgetUpdated = false;

      if (budgetCode) {
        let updatedBudget = null;

        if (mongoose.Types.ObjectId.isValid(budgetCode)) {
          updatedBudget = await BudgetCategoryModel.findByIdAndUpdate(
            budgetCode,
            { $inc: { spent: requestedAmount } },
            { new: true }
          );
        }

        if (!updatedBudget) {
          const escaped = budgetCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          updatedBudget = await BudgetCategoryModel.findOneAndUpdate(
            { name: { $regex: `^${escaped}$`, $options: 'i' } },
            { $inc: { spent: requestedAmount } },
            { new: true }
          );
        }

        budgetUpdated = Boolean(updatedBudget);
      }

      res.json({
        success: true,
        message: isFullyPaid
          ? 'Invoice paid successfully'
          : 'Partial payment recorded successfully',
        data: {
          invoice: {
            ...result.toObject(),
            apInvoiceNumber: invoiceNumber || result.apInvoiceNumber || null,
            billTo: resolvedBillTo,
            apTaxRate: resolvedTaxRate,
            apTaxAmount: resolvedTaxAmount,
          },
          invoiceNumber: invoiceNumber || result.apInvoiceNumber || result.poNumber,
          billTo: resolvedBillTo,
          taxRate: resolvedTaxRate,
          taxAmount: resolvedTaxAmount,
          budgetUpdated,
          paidAmount: requestedAmount,
          remainingBalance: Number(Math.max(0, totalAmount - (isFullyPaid ? totalAmount : nextPaidAmount)).toFixed(2)),
          paidPercentage: isFullyPaid ? 100 : nextPaidPercentage,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Error paying single invoice:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get journal entries
  app.get('/api/finance/journal-entries', async (req, res) => {
    try {
      const { status, journalType, page = 1 } = req.query;
      
      // TODO: Fetch actual data from database
      const entries = [];
      
      res.json({
        success: true,
        data: {
          entries,
          totalPages: 0,
          currentPage: page,
        },
      });
    } catch (error) {
      console.error('Error fetching journal entries:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create journal entry
  app.post('/api/finance/journal-entries', async (req, res) => {
    try {
      const { date, referenceNumber, currency, memo, lineItems, totalDebit, totalCredit } = req.body;
      
      if (!referenceNumber || !lineItems || lineItems.length < 2) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid journal entry data. At least two line items are required.' 
        });
      }
      
      const difference = Math.abs(totalDebit - totalCredit);
      if (difference > 0.01) {
        return res.status(400).json({ 
          success: false, 
          error: 'Journal entry is not balanced. Total debits must equal total credits.' 
        });
      }
      
      // TODO: Save journal entry to database
      // For now, return success
      
      res.json({
        success: true,
        message: 'Journal entry saved successfully',
        data: {
          _id: 'je-' + Date.now(),
          date,
          referenceNumber,
          currency,
          memo,
          lineItems,
          totalDebit,
          totalCredit,
          status: 'Draft',
          createdAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Error creating journal entry:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== VENDOR MANAGEMENT ROUTES ====================

  // Get all vendors
  app.get('/api/vendors', async (req, res) => {
    try {
      const { status, serviceType, search, page = 1, limit = 12 } = req.query;
      
      // Build query
      const query = {};
      if (status) query.status = status;
      if (serviceType) query.serviceType = serviceType;
      if (search) {
        query.$or = [
          { companyName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { vendorId: { $regex: search, $options: 'i' } },
        ];
      }
      
      const skip = (page - 1) * limit;
      const vendors = await VendorModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      const total = await VendorModel.countDocuments(query);
      const totalPages = Math.ceil(total / limit);
      
      res.json({
        success: true,
        data: {
          vendors,
          totalPages,
          currentPage: parseInt(page),
          total,
        },
      });
    } catch (error) {
      console.error('Error fetching vendors:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create new vendor with base64 document upload
  app.post('/api/vendors', async (req, res) => {
    try {
      const vendorData = req.body;
      const { documents: base64Documents } = req.body;
      
      // Process base64 documents if provided
      const documents = [];
      if (base64Documents && Array.isArray(base64Documents)) {
        const allowedTypes = /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|image\/(jpeg|jpg|png))$/;
        
        for (const doc of base64Documents) {
          try {
            // Validate base64 document (5MB limit)
            const validation = validateBase64File(doc.data, 5, allowedTypes);
            
            documents.push({
              name: doc.name || 'document',
              data: doc.data, // Store full base64 data URL
              size: Math.round((doc.data.length * 3) / 4), // Calculate approximate size
              type: validation.mimeType,
              uploadedAt: new Date(),
            });
          } catch (validationError) {
            return res.status(400).json({ 
              success: false, 
              error: `Document validation failed: ${validationError.message}` 
            });
          }
        }
      }
      
      // Remove base64Documents from vendorData as we've processed it
      delete vendorData.documents;
      
      // Create new vendor
      const vendor = new VendorModel({
        ...vendorData,
        documents,
        status: 'Active',
        createdAt: new Date(),
      });
      
      await vendor.save();
      
      res.json({
        success: true,
        message: 'Vendor created successfully',
        data: vendor,
      });
    } catch (error) {
      console.error('Error creating vendor:', error);
      if (error?.name === 'ValidationError') {
        const details = Object.values(error.errors || {})
          .map((entry) => entry?.message)
          .filter(Boolean)
          .join(', ');
        return res.status(400).json({
          success: false,
          error: details || 'Invalid vendor payload',
        });
      }

      if (error?.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';
        return res.status(409).json({
          success: false,
          error: `Duplicate value for ${duplicateField}. Please use a unique value.`,
        });
      }

      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update vendor
  app.put('/api/vendors/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const { documents: base64Documents } = req.body;
      
      const vendor = await VendorModel.findById(id);
      if (!vendor) {
        return res.status(404).json({ success: false, error: 'Vendor not found' });
      }
      
      // Process new base64 documents if provided
      if (base64Documents && Array.isArray(base64Documents)) {
        const allowedTypes = /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|image\/(jpeg|jpg|png))$/;
        const newDocuments = [];
        
        for (const doc of base64Documents) {
          try {
            // Validate base64 document (5MB limit)
            const validation = validateBase64File(doc.data, 5, allowedTypes);
            
            newDocuments.push({
              name: doc.name || 'document',
              data: doc.data,
              size: Math.round((doc.data.length * 3) / 4),
              type: validation.mimeType,
              uploadedAt: new Date(),
            });
          } catch (validationError) {
            return res.status(400).json({ 
              success: false, 
              error: `Document validation failed: ${validationError.message}` 
            });
          }
        }
        
        // Append new documents to existing ones
        updates.documents = [...(vendor.documents || []), ...newDocuments];
      }
      
      Object.assign(vendor, updates);
      vendor.updatedAt = new Date();
      await vendor.save();
      
      res.json({
        success: true,
        message: 'Vendor updated successfully',
        data: vendor,
      });
    } catch (error) {
      console.error('Error updating vendor:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Delete vendor
  app.delete('/api/vendors/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const vendor = await VendorModel.findById(id);
      if (!vendor) {
        return res.status(404).json({ success: false, error: 'Vendor not found' });
      }
      
      // No need to delete files from filesystem anymore - documents stored in MongoDB
      await VendorModel.findByIdAndDelete(id);
      
      res.json({
        success: true,
        message: 'Vendor deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting vendor:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get vendor document by index
  app.get('/api/vendors/:id/documents/:docIndex', async (req, res) => {
    try {
      const { id, docIndex } = req.params;
      
      const vendor = await VendorModel.findById(id);
      if (!vendor) {
        return res.status(404).json({ success: false, error: 'Vendor not found' });
      }
      
      const index = parseInt(docIndex);
      if (isNaN(index) || index < 0 || index >= vendor.documents.length) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
      
      const document = vendor.documents[index];
      
      // Return the base64 data URL directly - client can use it in download or display
      res.json({
        success: true,
        data: {
          name: document.name,
          data: document.data,
          type: document.type,
          size: document.size,
          uploadedAt: document.uploadedAt,
        },
      });
    } catch (error) {
      console.error('Error fetching vendor document:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Delete specific vendor document
  app.delete('/api/vendors/:id/documents/:docIndex', async (req, res) => {
    try {
      const { id, docIndex } = req.params;
      
      const vendor = await VendorModel.findById(id);
      if (!vendor) {
        return res.status(404).json({ success: false, error: 'Vendor not found' });
      }
      
      const index = parseInt(docIndex);
      if (isNaN(index) || index < 0 || index >= vendor.documents.length) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
      
      // Remove document from array
      vendor.documents.splice(index, 1);
      vendor.updatedAt = new Date();
      await vendor.save();
      
      res.json({
        success: true,
        message: 'Document deleted successfully',
        data: vendor,
      });
    } catch (error) {
      console.error('Error deleting vendor document:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // =====================================================
  // SYSTEM ADMIN ENDPOINTS
  // =====================================================

  // Get system statistics
  app.get('/api/admin/system-stats', async (req, res) => {
    try {
      const [users, employees] = await Promise.all([
        UserModel.countDocuments(),
        EmployeeModel.countDocuments()
      ]);

      // Calculate system load based on recent activity
      const recentActivity = await AuditLogModel.countDocuments({
        timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
      });
      
      // System load as percentage (scale based on activity)
      const systemLoad = Math.min(Math.round((recentActivity / 100) * 100), 100);
      
      // Calculate uptime (mock for now - would need actual server start time)
      const uptime = 99.9;

      res.json({
        success: true,
        data: {
          systemLoad,
          loadTrend: systemLoad > 80 ? 'high' : systemLoad > 50 ? 'moderate' : 'low',
          uptime,
          totalUsers: users + employees,
          timestamp: new Date()
        }
      });
    } catch (error) {
      console.error('Error fetching system stats:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get service status
  app.get('/api/admin/service-status', async (req, res) => {
    try {
      const services = [];

      // Check database connection
      const dbStatus = mongoose.connection.readyState === 1 ? 'online' : 'offline';
      services.push({
        id: 1,
        name: 'Database Cluster',
        status: dbStatus,
        uptime: dbStatus === 'online' ? '99.9%' : '0%',
        color: dbStatus === 'online' ? 'green' : 'red'
      });

      // Check API (always online if we're responding)
      services.push({
        id: 2,
        name: 'API Gateway',
        status: 'online',
        uptime: '99.8%',
        color: 'green'
      });

      // Check file storage (async)
      const uploadsDir = path.join(__dirname, 'uploads');
      let storageStatus = 'offline';
      try {
        await fs.promises.access(uploadsDir);
        storageStatus = 'online';
      } catch (err) {
        console.log('Storage directory not accessible:', err.message);
      }
      services.push({
        id: 3,
        name: 'Storage Service',
        status: storageStatus,
        uptime: storageStatus === 'online' ? '100%' : '0%',
        color: storageStatus === 'online' ? 'green' : 'red'
      });

      // Email service status (check if email config exists)
      const emailStatus = process.env.EMAIL_USER ? 'online' : 'offline';
      services.push({
        id: 4,
        name: 'Email Service',
        status: emailStatus,
        uptime: emailStatus === 'online' ? '99.5%' : '0%',
        color: emailStatus === 'online' ? 'green' : 'orange'
      });

      res.json({
        success: true,
        data: services
      });
    } catch (error) {
      console.error('Error fetching service status:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  const port = process.env.PORT;
  if (!isServerlessRuntime && !port) {
    console.error('PORT not set in .env file');
    process.exit(1);
  }

  // Initialize Socket.IO for real-time updates
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });

    socket.on('subscribe-security-logs', () => {
      socket.join('security-logs');
      console.log('Client subscribed to security logs:', socket.id);
    });

    socket.on('unsubscribe-security-logs', () => {
      socket.leave('security-logs');
      console.log('Client unsubscribed from security logs:', socket.id);
    });
  });

  // Make io available to routes
  app.set('io', io);

  // Initialize System Data before listening
  const initializeSystemData = async () => {
    try {
      const existingRolesCount = await RoleModel.countDocuments();
      if (existingRolesCount === 0) {
        console.log('Seeding default roles...');
        await RoleModel.insertMany(DEFAULT_ROLES);
        console.log('Successfully seeded default roles.');
      }
    } catch (err) {
      console.error('Error seeding initial system data:', err);
    }
  };

  await initializeSystemData();

  let server = null;
  if (!isServerlessRuntime) {
    server = httpServer.listen(port, () => {
      console.log(`Netlink backend listening on http://localhost:${port}`);
      console.log('WebSocket server ready for real-time updates');
    });
  }

  // ============ AUTOMATED LOG ARCHIVAL SCHEDULER ============
  
  // Function to archive old logs automatically
  const autoArchiveLogs = async () => {
    try {
      const settings = await SecuritySettingsModel.findOne();
      
      // Check if auto-archive is enabled
      if (!settings || !settings.logRetentionPolicy || !settings.logRetentionPolicy.autoArchive) {
        return;
      }

      const retentionPeriod = settings.logRetentionPolicy.retentionPeriod || 90;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionPeriod);

      // Find old logs to archive
      const logsToArchive = await AuditLogModel.find({ timestamp: { $lt: cutoffDate } });

      if (logsToArchive.length === 0) {
        console.log('📦 Auto-archive: No logs to archive');
        return;
      }

      // Create batch ID
      const batchId = `auto-batch-${Date.now()}`;

      // Archive logs
      const archivedLogs = logsToArchive.map(log => ({
        actor: log.actor,
        action: log.action,
        actionColor: log.actionColor,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        description: log.description,
        status: log.status,
        metadata: log.metadata,
        timestamp: log.timestamp,
        originalId: log._id,
        archiveBatch: batchId,
        archiveDate: new Date(),
        compressed: settings.logRetentionPolicy.compressionEnabled || false,
      }));

      await ArchivedLogModel.insertMany(archivedLogs);

      // Delete original logs
      await AuditLogModel.deleteMany({ timestamp: { $lt: cutoffDate } });

      // Update settings
      settings.logRetentionPolicy.lastArchiveDate = new Date();
      settings.logRetentionPolicy.totalArchived = (settings.logRetentionPolicy.totalArchived || 0) + logsToArchive.length;
      await settings.save();

      console.log(`📦 Auto-archived ${logsToArchive.length} old audit logs (batch: ${batchId})`);

      // Create audit log for archival
      await AuditLogModel.create({
        actor: {
          userId: 'system',
          userName: 'Auto-Archive System',
          userEmail: 'system@steps.com',
          initials: 'SYS',
        },
        action: 'Data Archive',
        actionColor: 'blue',
        ipAddress: 'localhost',
        userAgent: 'Scheduled Job',
        description: `Auto-archived ${logsToArchive.length} old audit logs`,
        status: 'Success',
        metadata: { count: logsToArchive.length, batchId, cutoffDate, automated: true },
      });
    } catch (error) {
      console.error('❌ Error in auto-archive:', error);
    }
  };

  // Run auto-archive daily at 2 AM
  const scheduleAutoArchive = () => {
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(2, 0, 0, 0);
    
    // If it's past 2 AM today, schedule for tomorrow
    if (now > nextRun) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    const timeUntilNextRun = nextRun - now;
    
    setTimeout(() => {
      autoArchiveLogs();
      // After first run, repeat every 24 hours
      setInterval(autoArchiveLogs, 24 * 60 * 60 * 1000);
    }, timeUntilNextRun);
    
    console.log(`📅 Auto-archive scheduled to run daily at 2:00 AM (next run: ${nextRun.toLocaleString()})`);
  };

  // Start the auto-archive scheduler
  if (!isServerlessRuntime) {
    scheduleAutoArchive();
  }

  // Also run auto-archive on startup if needed (optional)
  if (!isServerlessRuntime) {
    autoArchiveLogs().catch(err => console.error('Error running initial auto-archive:', err));
  }

  // ============ DAILY INVENTORY EXPIRY ALERT SCHEDULER ============
  const runInventoryExpiryAlertJob = async () => {
    try {
      const defaultDays = Number(process.env.INVENTORY_EXPIRY_ALERT_DAYS || 30);
      const days = Number.isInteger(defaultDays) && defaultDays > 0 ? defaultDays : 30;
      const now = new Date();
      const cutoff = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));

      const items = await InventoryItemModel.find({ isDeleted: false }).select('itemId name quantity category batches');
      const expiring = [];

      items.forEach((item) => {
        const batches = Array.isArray(item.batches) ? item.batches : [];
        const matched = batches.filter((b) => {
          if (Number(b.quantity || 0) <= 0 || !b.expiryDate) return false;
          const expiry = new Date(b.expiryDate);
          return expiry >= now && expiry <= cutoff;
        });

        if (matched.length > 0) {
          const nextExpiry = matched
            .map((b) => new Date(b.expiryDate))
            .sort((a, b) => a - b)[0];

          expiring.push({
            _id: item._id,
            itemId: item.itemId,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            nextExpiry,
            batches: matched,
          });
        }
      });

      if (expiring.length === 0) {
        console.log('📦 Inventory expiry job: no expiring items found');
        return;
      }

      const settings = await SystemSettingsModel.findOne().select('contactEmail');
      const envRecipients = (process.env.INVENTORY_ALERT_EMAILS || '')
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);
      const recipients = [...new Set([settings?.contactEmail, ...envRecipients].filter(Boolean))];

      if (recipients.length === 0) {
        console.warn('⚠️ Inventory expiry job: no recipients configured (set SystemSettings.contactEmail or INVENTORY_ALERT_EMAILS)');
        return;
      }

      const result = await sendInventoryExpiryAlertEmail(recipients, { days, items: expiring });
      if (result?.success) {
        console.log(`📧 Inventory expiry alert sent to ${recipients.join(', ')} (${expiring.length} item(s))`);
      } else {
        console.error('❌ Inventory expiry email send failed:', result?.error || 'Unknown error');
      }

      const dayStamp = new Date().toISOString().slice(0, 10);
      const sourceKey = `inventory-expiry-${dayStamp}`;
      const existing = await NotificationModel.findOne({ sourceKey });
      if (!existing) {
        const soonest = expiring
          .map((x) => new Date(x.nextExpiry))
          .sort((a, b) => a - b)[0];

        await NotificationModel.create({
          title: `Inventory expiry alert (${expiring.length})`,
          message: `${expiring.length} item(s) have batches expiring within ${days} days.`,
          type: 'warning',
          category: 'inventory',
          source: 'inventory-expiry-job',
          sourceKey,
          metadata: {
            count: expiring.length,
            days,
            nextExpiry: soonest || null,
            sample: expiring.slice(0, 5).map((i) => ({
              itemId: i.itemId,
              name: i.name,
              nextExpiry: i.nextExpiry,
            })),
          },
        });
      }
    } catch (error) {
      console.error('❌ Error running inventory expiry alert job:', error);
    }
  };

  const scheduleInventoryExpiryAlertJob = () => {
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(8, 0, 0, 0); // 8:00 AM daily server time
    if (now > nextRun) nextRun.setDate(nextRun.getDate() + 1);

    const delay = nextRun.getTime() - now.getTime();
    setTimeout(() => {
      runInventoryExpiryAlertJob();
      setInterval(runInventoryExpiryAlertJob, 24 * 60 * 60 * 1000);
    }, delay);

    console.log(`📅 Inventory expiry alerts scheduled daily at 8:00 AM (next run: ${nextRun.toLocaleString()})`);
  };

  if (!isServerlessRuntime) {
    scheduleInventoryExpiryAlertJob();
    runInventoryExpiryAlertJob().catch((err) => console.error('Error running initial inventory expiry alert job:', err));
  }

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    server.close(async () => {
      console.log('HTTP server closed');
      try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  if (!isServerlessRuntime) {
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  return app;
}

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  console.error('Stack:', err.stack);
  // Don't exit immediately, log and continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Don't exit immediately, log and continue
});

// Monitor memory usage
if (!isServerlessRuntime) {
  setInterval(() => {
    const used = process.memoryUsage();
    const mb = (bytes) => Math.round(bytes / 1024 / 1024);
    if (mb(used.heapUsed) > 500) { // Alert if heap exceeds 500MB
      console.warn(`⚠️ High memory usage: ${mb(used.heapUsed)}MB heap / ${mb(used.rss)}MB RSS`);
    }
  }, 60000); // Check every minute
}

function ensureStarted() {
  if (!startupPromise) {
    startupPromise = start();
  }
  return startupPromise;
}

if (require.main === module) {
  ensureStarted().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
} else {
  module.exports = async (req, res) => {
    try {
      await ensureStarted();
      return app(req, res);
    } catch (err) {
      console.error('Failed to initialize serverless request:', err);
      return res.status(500).json({ success: false, error: 'Server initialization failed' });
    }
  };
  module.exports.app = app;
}
