#!/usr/bin/env node
/**
 * MongoDB Database Seeder
 * 
 * This script seeds the MongoDB database with initial data for development/testing.
 * Run with: node server/seed.js
 * 
 * Options:
 *   --clear    Clear all collections before seeding
 *   --users    Seed only users
 *   --all      Seed all data (default)
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const UserModel = require('./models/User');
const ModuleModel = require('./models/Module');
const DepartmentModel = require('./models/Department');
const JobTitleModel = require('./models/JobTitle');
const AnalyticsModel = require('./models/Analytics');
const AttendanceModel = require('./models/Attendance');
const PolicyModel = require('./models/Policy');
const SecuritySettingsModel = require('./models/SecuritySettings');

// Parse command line arguments
const args = process.argv.slice(2);
const shouldClear = args.includes('--clear');
const seedUsersOnly = args.includes('--users');
const seedAll = args.includes('--all') || args.length === 0;

// Seed data
const seedData = {
  modules: [
    { id: 1, name: "Approval", componentName: "Approval" },
    { id: 2, name: "Inventory", componentName: "Inventory" },
    { id: 3, name: "HRM", componentName: "HRM" },
    { id: 4, name: "Facility Maintenance", componentName: "FacilityMaintenance" },
    { id: 5, name: "Finance", componentName: "Finance" },
    { id: 6, name: "Security Logs", componentName: "SecurityLogs" },
    { id: 7, name: "Admin", componentName: "Admin" },
    { id: 8, name: "Attendance", componentName: "Attendance" },
    { id: 9, name: "DocSign", componentName: "DocSign" },
    { id: 10, name: "Material Requests", componentName: "MaterialRequests" },
    { id: 11, name: "Purchase Orders", componentName: "PurchaseOrders" },
    { id: 12, name: "Analytics", componentName: "Analytics" },
    { id: 13, name: "Policy", componentName: "Policy" },
  ],

  departments: [
    { name: "Engineering", code: "ENG", icon: "fa-cogs", color: "#3B82F6" },
    { name: "Human Resources", code: "HR", icon: "fa-users", color: "#10B981" },
    { name: "Finance", code: "FIN", icon: "fa-dollar-sign", color: "#F59E0B" },
    { name: "Sales", code: "SAL", icon: "fa-chart-line", color: "#EF4444" },
    { name: "Marketing", code: "MKT", icon: "fa-bullhorn", color: "#8B5CF6" },
    { name: "Operations", code: "OPS", icon: "fa-project-diagram", color: "#14B8A6" },
    { name: "IT", code: "IT", icon: "fa-laptop-code", color: "#6366F1" },
    { name: "Customer Support", code: "CS", icon: "fa-headset", color: "#EC4899" },
  ],

  jobTitles: [
    'Software Engineer',
    'Senior Software Engineer',
    'Project Manager',
    'HR Manager',
    'Financial Analyst',
    'Accountant',
    'Product Manager',
    'Sales Executive',
    'Marketing Manager',
    'Operations Manager',
    'IT Support Specialist',
    'Customer Service Representative',
    'CEO',
    'CTO',
    'CFO',
  ],

  users: [
    {
      firstName: "Admin",
      lastName: "User",
      email: "admin@netlink.com",
      password: "Admin@123", // Will be hashed
      role: "Admin",
      status: "Active",
      department: "IT",
      jobTitle: "System Administrator",
    },
    {
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@netlink.com",
      password: "User@123",
      role: "user",
      status: "Active",
      department: "Engineering",
      jobTitle: "Software Engineer",
    },
    {
      firstName: "Jane",
      lastName: "Smith",
      email: "jane.smith@netlink.com",
      password: "User@123",
      role: "Editor",
      status: "Active",
      department: "Human Resources",
      jobTitle: "HR Manager",
    },
  ],

  analytics: {
    moduleUsage: [
      { name: "Approval", value: 85 },
      { name: "Inventory", value: 62 },
      { name: "HR Management", value: 78 },
      { name: "Facility Maintenance", value: 45 },
      { name: "Finance", value: 92 },
      { name: "Security Logs", value: 38 },
      { name: "Admin", value: 55 },
      { name: "Attendance", value: 88 },
      { name: "DocSign", value: 71 },
      { name: "Material Requests", value: 64 },
      { name: "Purchase Orders", value: 76 },
      { name: "Analytics", value: 49 },
      { name: "Policy", value: 52 },
    ],
    recentActivity: [
      { date: "Mon", actions: 12 },
      { date: "Tue", actions: 19 },
      { date: "Wed", actions: 15 },
      { date: "Thu", actions: 25 },
      { date: "Fri", actions: 22 },
      { date: "Sat", actions: 8 },
      { date: "Sun", actions: 5 },
    ],
    stats: {
      totalModules: 13,
      activeUsers: 127,
      todayActions: 89,
      alerts: 3,
    },
    recentActivities: [
      { id: 1, user: "John Doe", action: "Updated inventory item", module: "Inventory", time: "5 mins ago" },
      { id: 2, user: "Jane Smith", action: "Created new transaction", module: "Finance", time: "12 mins ago" },
      { id: 3, user: "Bob Johnson", action: "Checked attendance", module: "Attendance", time: "23 mins ago" },
      { id: 4, user: "Alice Brown", action: "Generated report", module: "Analytics", time: "1 hour ago" },
    ],
  },

  attendance: [],

  policies: [
    {
      title: "Code of Conduct",
      category: "HR",
      policyId: "POL-001",
      version: "v1.0",
      status: "Published",
      description: "Guidelines for professional behavior and ethics in the workplace",
      documentName: "code-of-conduct.pdf",
      documentUrl: "/documents/policies/code-of-conduct.pdf",
    },
    {
      title: "Remote Work Policy",
      category: "Operations",
      policyId: "POL-002",
      version: "v1.0",
      status: "Published",
      description: "Policy for remote work arrangements and expectations",
      documentName: "remote-work-policy.pdf",
      documentUrl: "/documents/policies/remote-work-policy.pdf",
    },
  ],

  securitySettings: {
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      expirationDays: 90,
    },
    sessionPolicy: {
      maxSessionDuration: 24,
      inactivityTimeout: 30,
      maxConcurrentSessions: 3,
    },
    loginAttempts: {
      maxAttempts: 5,
      lockoutDuration: 15,
    },
    twoFactorAuth: {
      enabled: false,
      mandatory: false,
    },
  },
};

async function clearCollections() {
  console.log('\n🗑️  Clearing existing data...');
  
  const models = [
    UserModel,
    ModuleModel,
    DepartmentModel,
    JobTitleModel,
    AnalyticsModel,
    AttendanceModel,
    PolicyModel,
    SecuritySettingsModel,
  ];

  for (const model of models) {
    try {
      await model.deleteMany({});
      console.log(`   ✓ Cleared ${model.modelName} collection`);
    } catch (error) {
      console.error(`   ✗ Error clearing ${model.modelName}:`, error.message);
    }
  }
}

async function seedModules() {
  console.log('\n📦 Seeding modules...');
  try {
    const count = await ModuleModel.countDocuments();
    if (count === 0 || shouldClear) {
      for (const module of seedData.modules) {
        await ModuleModel.findOneAndUpdate(
          { id: module.id },
          module,
          { upsert: true, new: true }
        );
      }
      console.log(`   ✓ Seeded ${seedData.modules.length} modules`);
    } else {
      console.log('   ⊘ Modules already exist (use --clear to reset)');
    }
  } catch (error) {
    console.error('   ✗ Error seeding modules:', error.message);
  }
}

async function seedDepartments() {
  console.log('\n🏢 Seeding departments...');
  try {
    const count = await DepartmentModel.countDocuments();
    if (count === 0 || shouldClear) {
      await DepartmentModel.insertMany(seedData.departments);
      console.log(`   ✓ Seeded ${seedData.departments.length} departments`);
    } else {
      console.log('   ⊘ Departments already exist (use --clear to reset)');
    }
  } catch (error) {
    console.error('   ✗ Error seeding departments:', error.message);
  }
}

async function seedJobTitles() {
  console.log('\n💼 Seeding job titles...');
  try {
    const count = await JobTitleModel.countDocuments();
    if (count === 0 || shouldClear) {
      const jobTitles = seedData.jobTitles.map(title => ({ title }));
      await JobTitleModel.insertMany(jobTitles);
      console.log(`   ✓ Seeded ${seedData.jobTitles.length} job titles`);
    } else {
      console.log('   ⊘ Job titles already exist (use --clear to reset)');
    }
  } catch (error) {
    console.error('   ✗ Error seeding job titles:', error.message);
  }
}

async function seedUsers() {
  console.log('\n👤 Seeding users...');
  try {
    const count = await UserModel.countDocuments();
    if (count === 0 || shouldClear) {
      for (const userData of seedData.users) {
        // Don't hash password here - the User model's pre-save hook will do it
        const user = {
          ...userData,
          fullName: `${userData.firstName} ${userData.lastName}`,
        };
        await UserModel.create(user);
      }
      console.log(`   ✓ Seeded ${seedData.users.length} users`);
      console.log('\n   Default credentials:');
      console.log('   Admin: admin@netlink.com / Admin@123');
      console.log('   User: john.doe@netlink.com / User@123');
    } else {
      console.log('   ⊘ Users already exist (use --clear to reset)');
    }
  } catch (error) {
    console.error('   ✗ Error seeding users:', error.message);
  }
}

async function seedAnalytics() {
  console.log('\n📊 Seeding analytics...');
  try {
    const count = await AnalyticsModel.countDocuments();
    if (count === 0 || shouldClear) {
      await AnalyticsModel.create(seedData.analytics);
      console.log('   ✓ Seeded analytics data');
    } else {
      console.log('   ⊘ Analytics already exist (use --clear to reset)');
    }
  } catch (error) {
    console.error('   ✗ Error seeding analytics:', error.message);
  }
}

async function seedAttendance() {
  console.log('\n📅 Seeding attendance...');
  try {
    const count = await AttendanceModel.countDocuments();
    if (count === 0 || shouldClear) {
      await AttendanceModel.insertMany(seedData.attendance);
      console.log(`   ✓ Seeded ${seedData.attendance.length} attendance records`);
    } else {
      console.log('   ⊘ Attendance records already exist (use --clear to reset)');
    }
  } catch (error) {
    console.error('   ✗ Error seeding attendance:', error.message);
  }
}

async function seedPolicies() {
  console.log('\n📋 Seeding policies...');
  try {
    const count = await PolicyModel.countDocuments();
    if (count === 0 || shouldClear) {
      await PolicyModel.insertMany(seedData.policies);
      console.log(`   ✓ Seeded ${seedData.policies.length} policies`);
    } else {
      console.log('   ⊘ Policies already exist (use --clear to reset)');
    }
  } catch (error) {
    console.error('   ✗ Error seeding policies:', error.message);
  }
}

async function seedSecuritySettings() {
  console.log('\n🔒 Seeding security settings...');
  try {
    const count = await SecuritySettingsModel.countDocuments();
    if (count === 0 || shouldClear) {
      await SecuritySettingsModel.create(seedData.securitySettings);
      console.log('   ✓ Seeded security settings');
    } else {
      console.log('   ⊘ Security settings already exist (use --clear to reset)');
    }
  } catch (error) {
    console.error('   ✗ Error seeding security settings:', error.message);
  }
}

async function main() {
  try {
    console.log('\n🌱 Starting database seeding process...\n');
    console.log('📍 MongoDB URI:', process.env.MONGODB_URI || 'Not set');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/netlink', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✓ Connected to MongoDB\n');

    // Clear collections if requested
    if (shouldClear) {
      await clearCollections();
    }

    // Seed data based on flags
    if (seedAll) {
      await seedModules();
      await seedDepartments();
      await seedJobTitles();
      await seedUsers();
      await seedAnalytics();
      await seedAttendance();
      await seedPolicies();
      await seedSecuritySettings();
    } else if (seedUsersOnly) {
      await seedUsers();
    }

    console.log('\n✅ Seeding completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed\n');
    process.exit(0);
  }
}

// Run the seeder
main();


