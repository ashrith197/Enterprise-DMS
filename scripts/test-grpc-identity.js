const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load the proto file
const PROTO_PATH = path.join(__dirname, '..', 'contracts', 'identity.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const identityProto = grpc.loadPackageDefinition(packageDefinition).identity;

// Create client
const client = new identityProto.IdentityService(
  'localhost:5001',
  grpc.credentials.createInsecure(),
);

// Test functions
function testGetUser(userId) {
  return new Promise((resolve, reject) => {
    client.GetUser({ user_id: userId }, (error, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

function testGetUsersByIds(userIds) {
  return new Promise((resolve, reject) => {
    client.GetUsersByIds({ user_ids: userIds }, (error, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

function testValidateToken(accessToken) {
  return new Promise((resolve, reject) => {
    client.ValidateToken({ access_token: accessToken }, (error, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

// Main test execution
async function runTests() {
  console.log('='.repeat(80));
  console.log('gRPC Identity Service Test');
  console.log('='.repeat(80));

  // Get userId and accessToken from command line
  const userId = process.argv[2];
  const accessToken = process.argv[3];

  if (!userId) {
    console.log('\n⚠️  Usage: node test-grpc-identity.js <userId> [accessToken]');
    console.log('\nExample:');
    console.log('  node test-grpc-identity.js abc123-def456-ghi789');
    console.log('  node test-grpc-identity.js abc123-def456-ghi789 eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
    process.exit(1);
  }

  try {
    // Test 1: GetUser
    console.log('\n1. Testing GetUser...');
    console.log(`   Request: { user_id: "${userId}" }`);
    try {
      const userResponse = await testGetUser(userId);
      console.log('   ✓ Response:', JSON.stringify(userResponse, null, 2));
    } catch (error) {
      console.log('   ✗ Error:', error.message);
    }

    // Test 2: GetUsersByIds
    console.log('\n2. Testing GetUsersByIds...');
    console.log(`   Request: { user_ids: ["${userId}"] }`);
    try {
      const usersResponse = await testGetUsersByIds([userId]);
      console.log('   ✓ Response:', JSON.stringify(usersResponse, null, 2));
    } catch (error) {
      console.log('   ✗ Error:', error.message);
    }

    // Test 3: ValidateToken (if provided)
    if (accessToken) {
      console.log('\n3. Testing ValidateToken...');
      console.log(`   Request: { access_token: "${accessToken.substring(0, 20)}..." }`);
      try {
        const validateResponse = await testValidateToken(accessToken);
        console.log('   ✓ Response:', JSON.stringify(validateResponse, null, 2));
      } catch (error) {
        console.log('   ✗ Error:', error.message);
      }
    } else {
      console.log('\n3. Testing ValidateToken...');
      console.log('   ⊘ Skipped (no access token provided)');
    }

    console.log('\n' + '='.repeat(80));
    console.log('Tests completed!');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }

  process.exit(0);
}

runTests();
