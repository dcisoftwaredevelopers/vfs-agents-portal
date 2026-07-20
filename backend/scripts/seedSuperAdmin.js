require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Agent = require('../models/Agent');

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set in .env');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('SUPER_ADMIN_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existing = await Agent.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    console.log('Super admin already exists. No changes made.');
    await mongoose.disconnect();
    return;
  }

  const superAdmin = new Agent({
    agencyName: 'Platform Administrator',
    ownerName: 'Super Admin',
    email: email.toLowerCase().trim(),
    password,
    mobile: process.env.SUPER_ADMIN_MOBILE || '0000000000',
    panNumber: 'N/A',
    aadharNumber: 'N/A',
    address: 'N/A',
    city: 'N/A',
    state: 'N/A',
    country: 'India',
    role: 'SUPER_ADMIN',
    status: 'Active',
    isActive: true
  });

  await superAdmin.save();
  console.log('Super admin created for:', email);
  console.log('Remove SUPER_ADMIN_PASSWORD from .env now - no longer needed at runtime.');
  await mongoose.disconnect();
}

seedSuperAdmin().catch(async (err) => {
  console.error('Seed failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // Ignore disconnect errors during failed seed shutdown.
  }
  process.exit(1);
});
