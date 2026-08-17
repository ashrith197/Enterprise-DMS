const axios = require('axios');
const { Client } = require('pg');

const BASE_URL = 'http://localhost:3001';

// Database config
const dbConfig = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'identity_db',
};

// Test admin credentials
const ADMIN_EMAIL = 'admin@dms.com';
const ADMIN_PASSWORD = 'AdminSecure123!';

async function checkExistingAdmin() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    const result = await client.query(
      "SELECT id, email, status FROM users WHERE email = $1",
      [ADMIN_EMAIL]
    );
    
    await client.end();
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    return null;
  } catch (error) {
    console.error('❌ Database error:', error.message);
    process.exit(1);
  }
}

async function createAdminInvitation() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    
    // Create admin invitation
    const invitationId = require('crypto').randomUUID();
    const token = 'initial-admin-token-' + require('crypto').randomBytes(16).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    await client.query(`
      INSERT INTO invitations (
        id, 
        organization_id, 
        email, 
        role, 
        token, 
        status, 
        expires_at, 
        created_by, 
        resent_count, 
        created_at, 
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
      )
    `, [
      invitationId,
      '00000000-0000-0000-0000-000000000001',
      ADMIN_EMAIL,
      'SUPER_ADMIN',
      token,
      'PENDING',
      expiresAt,
      '00000000-0000-0000-0000-000000000000',
      0
    ]);
    
    await client.end();
    
    console.log('✓ Admin invitation created in database');
    return token;
  } catch (error) {
    console.error('❌ Failed to create invitation:', error.message);
    process.exit(1);
  }
}

async function activateAdmin(token) {
  try {
    const response = await axios.post(`${BASE_URL}/auth/activate`, {
      token: token,
      password: ADMIN_PASSWORD,
    });
    
    console.log('✓ Admin account activated');
    return response.data.user;
  } catch (error) {
    console.error('❌ Activation failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

async function loginAdmin() {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    
    console.log('✓ Admin login successful');
    return {
      userId: response.data.user.id,
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
    };
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

async function saveTokensToFile(tokens) {
  const fs = require('fs');
  const path = require('path');
  
  const tokenFile = path.join(__dirname, '.test-tokens.json');
  fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));
  
  console.log(`✓ Tokens saved to ${tokenFile}`);
}

async function main() {
  console.log('═'.repeat(80));
  console.log('TEST CASE 0: Setup Admin User');
  console.log('═'.repeat(80));
  
  // Step 1: Check if admin user exists
  console.log('\n[Step 1] Checking for existing admin user...');
  const existingAdmin = await checkExistingAdmin();
  
  if (existingAdmin) {
    console.log(`✓ Admin user found: ${existingAdmin.email} (${existingAdmin.status})`);
    
    if (existingAdmin.status !== 'ACTIVE') {
      console.log('⚠️  Admin user exists but is not ACTIVE');
      console.log('   Please activate the admin account manually or delete and recreate.');
      process.exit(1);
    }
    
    // Option A: Login with existing admin
    console.log('\n[Option A] Logging in with existing admin user...');
    const tokens = await loginAdmin();
    
    console.log('\n═'.repeat(80));
    console.log('ADMIN ACCESS TOKEN:');
    console.log('═'.repeat(80));
    console.log(tokens.accessToken);
    console.log('\n═'.repeat(80));
    console.log('USER ID:', tokens.userId);
    console.log('═'.repeat(80));
    
    await saveTokensToFile(tokens);
    
    console.log('\n✅ Test Case 0 Complete - Admin user ready!');
    console.log('   Email:', ADMIN_EMAIL);
    console.log('   Password:', ADMIN_PASSWORD);
    console.log('   User ID:', tokens.userId);
    console.log('   Access Token saved to: scripts/.test-tokens.json');
    
  } else {
    console.log('✗ No admin user found');
    
    // Option B: Create new admin via invitation
    console.log('\n[Option B] Creating new admin user...');
    
    console.log('\n[Step 2] Creating admin invitation in database...');
    const token = await createAdminInvitation();
    console.log(`   Token: ${token}`);
    
    console.log('\n[Step 3] Activating admin account...');
    const user = await activateAdmin(token);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    
    console.log('\n[Step 4] Logging in...');
    const tokens = await loginAdmin();
    
    console.log('\n═'.repeat(80));
    console.log('ADMIN ACCESS TOKEN:');
    console.log('═'.repeat(80));
    console.log(tokens.accessToken);
    console.log('\n═'.repeat(80));
    console.log('USER ID:', tokens.userId);
    console.log('═'.repeat(80));
    
    await saveTokensToFile(tokens);
    
    console.log('\n✅ Test Case 0 Complete - New admin user created!');
    console.log('   Email:', ADMIN_EMAIL);
    console.log('   Password:', ADMIN_PASSWORD);
    console.log('   User ID:', tokens.userId);
    console.log('   Access Token saved to: scripts/.test-tokens.json');
  }
  
  console.log('\n💡 Use this access token for all subsequent authenticated requests.');
  process.exit(0);
}

// Run the script
main().catch(error => {
  console.error('\n❌ Script failed:', error);
  process.exit(1);
});
