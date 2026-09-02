const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');

async function run() {
  const email = (process.argv[2] || '').trim().toLowerCase();

  if (!email) {
    console.error('Usage: node scripts/promote-user-admin.js <email>');
    process.exitCode = 1;
    return;
  }

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set in server/.env');
    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const result = await User.updateOne(
      { email },
      { $set: { role: 'Admin', status: 'Active' } },
    );

    console.log(
      JSON.stringify(
        {
          email,
          matchedCount: result.matchedCount || 0,
          modifiedCount: result.modifiedCount || 0,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error('Failed to promote user:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

run();