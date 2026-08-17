# Phase 1 Part 2 - Testing Guide

## Prerequisites Checklist

✅ **PostgreSQL**: Running on port 5432
✅ **RabbitMQ**: Running on port 5672
✅ **Database**: `identity_db` exists with tables (users, invitations, refresh_tokens, password_reset_tokens)
✅ **Identity Service**: Ready to start on port 3001 (HTTP) and 5001 (gRPC)

---

## Setup

### 1. Start the Identity Service

```bash
cd identity-service
npm run start:dev
```

**Expected Console Output:**
```
[Nest] INFO [Bootstrap] 🔌 gRPC server running on port 5001
[Nest] INFO [Bootstrap] 🚀 Identity service running on port 3001
```

### 2. Verify Services are Listening

```bash
# Check HTTP server
curl http://localhost:3001

# Expected: {"message":"Identity Service is running"}
```

---

## Test Flow Overview

```
SETUP → CREATE INVITATION → VALIDATE TOKEN → ACTIVATE → LOGIN → 
GET PROFILE → REFRESH TOKEN → LOGOUT → BULK UPLOAD → gRPC TESTS
```

---

## Test Case 0: Setup - Create Admin User (If Needed)

**Purpose:** Get an access token for authenticated endpoints

### Option A: If you have an existing admin user

```bash
curl -X POST http://localhost:3001/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@example.com\",\"password\":\"your-password\"}"
```

### Option B: Create a new admin user via invitation

First, manually insert an admin invitation into the database:

```sql
-- Run in pgAdmin or psql
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
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'admin@example.com',
  'SUPER_ADMIN',
  'initial-admin-token-12345',
  'PENDING',
  NOW() + INTERVAL '7 days',
  '00000000-0000-0000-0000-000000000000',
  0,
  NOW(),
  NOW()
);
```

Then activate:

```bash
curl -X POST http://localhost:3001/auth/activate ^
  -H "Content-Type: application/json" ^
  -d "{\"token\":\"initial-admin-token-12345\",\"password\":\"Admin123!\"}"
```

Then login:

```bash
curl -X POST http://localhost:3001/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@example.com\",\"password\":\"Admin123!\"}"
```

**Expected Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@example.com",
    "first_name": "",
    "last_name": ""
  }
}
```

**Save the `accessToken` - you'll use it in all authenticated requests below!**

**Database Check (pgAdmin):**
```sql
SELECT id, email, status, created_at FROM users WHERE email = 'admin@example.com';
```

---

## Test Case 1: POST /invitations - Create Single Invitation

### Request

```bash
curl -X POST http://localhost:3001/invitations ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"organizationId\":\"00000000-0000-0000-0000-000000000001\",\"email\":\"newuser@example.com\",\"role\":\"EMPLOYEE\"}"
```

**Replace `YOUR_ACCESS_TOKEN`** with the token from Test Case 0.

### Expected Response (200 OK)

```json
{
  "id": "a1b2c3d4-e5f6-4321-abcd-123456789012",
  "organization_id": "00000000-0000-0000-0000-000000000001",
  "email": "newuser@example.com",
  "role": "EMPLOYEE",
  "status": "PENDING",
  "expires_at": "2026-08-23T16:30:00.000Z",
  "created_by": "550e8400-e29b-41d4-a716-446655440000",
  "resent_count": 0,
  "created_at": "2026-08-16T16:30:00.000Z",
  "updated_at": "2026-08-16T16:30:00.000Z"
}
```

**Note:** The `token` field is NOT included in the response (security requirement).

### Console Output

Check the identity-service console for:

```
[EmailService] Publishing INVITATION email job for newuser@example.com
[EmailService] Email job published successfully to queue: email-jobs
```

### RabbitMQ Check

Open RabbitMQ Management UI: http://localhost:15672 (default: guest/guest)

1. Go to **Queues** tab
2. Find queue `email-jobs`
3. Click on it
4. Click **Get messages** → **Get Message(s)**

**Expected message payload:**
```json
{
  "type": "INVITATION",
  "to": "newuser@example.com",
  "data": {
    "token": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
    "organizationName": "Organization",
    "role": "EMPLOYEE"
  }
}
```

**Copy the `token` value from this message - you'll need it for the next test!**

### Database Check (pgAdmin)

```sql
SELECT 
  id, 
  email, 
  role, 
  status, 
  token, 
  expires_at, 
  resent_count,
  created_at
FROM invitations 
WHERE email = 'newuser@example.com';
```

**Expected:**
- `status` = 'PENDING'
- `token` = 64-character hex string (matches RabbitMQ message)
- `expires_at` = 7 days from now
- `resent_count` = 0

---

## Test Case 2: GET /invitations/validate/:token - Validate Token (Public)

### Request

```bash
curl http://localhost:3001/invitations/validate/TOKEN_FROM_RABBITMQ
```

**Replace `TOKEN_FROM_RABBITMQ`** with the token you copied from RabbitMQ.

**Auth Required:** ❌ No (public endpoint)

### Expected Response (200 OK)

```json
{
  "valid": true,
  "email": "newuser@example.com",
  "expiresAt": "2026-08-23T16:30:00.000Z"
}
```

### Test Invalid Token

```bash
curl http://localhost:3001/invitations/validate/invalid-token-123
```

**Expected Response:**
```json
{
  "valid": false
}
```

---

## Test Case 3: POST /auth/activate - Activate Account

### Request

```bash
curl -X POST http://localhost:3001/auth/activate ^
  -H "Content-Type: application/json" ^
  -d "{\"token\":\"TOKEN_FROM_RABBITMQ\",\"password\":\"SecurePass123!\"}"
```

**Auth Required:** ❌ No (public endpoint)

### Expected Response (201 Created)

```json
{
  "message": "Account activated successfully",
  "user": {
    "id": "b2c3d4e5-f6a7-5432-bcde-234567890123",
    "email": "newuser@example.com"
  }
}
```

### Database Check (pgAdmin)

**Check Users table:**
```sql
SELECT 
  id, 
  email, 
  status, 
  password_hash, 
  created_at
FROM users 
WHERE email = 'newuser@example.com';
```

**Expected:**
- New user row created
- `status` = 'ACTIVE'
- `password_hash` = bcrypt hash (starts with `$2b$`)
- `first_name` and `last_name` = empty strings

**Check Invitations table:**
```sql
SELECT 
  status, 
  accepted_at
FROM invitations 
WHERE email = 'newuser@example.com';
```

**Expected:**
- `status` = 'ACCEPTED'
- `accepted_at` = current timestamp

---

## Test Case 4: POST /auth/login - Login

### Request

```bash
curl -X POST http://localhost:3001/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"newuser@example.com\",\"password\":\"SecurePass123!\"}"
```

### Expected Response (200 OK)

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
  "user": {
    "id": "b2c3d4e5-f6a7-5432-bcde-234567890123",
    "email": "newuser@example.com",
    "first_name": "",
    "last_name": ""
  }
}
```

**Save both tokens for subsequent tests!**

### Database Check (pgAdmin)

```sql
SELECT 
  user_id, 
  token_hash, 
  expires_at, 
  revoked, 
  created_at
FROM refresh_tokens 
WHERE user_id = 'b2c3d4e5-f6a7-5432-bcde-234567890123'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected:**
- New refresh token row created
- `token_hash` = SHA-256 hash (64 hex characters)
- `expires_at` = 7 days from now
- `revoked` = false

---

## Test Case 5: GET /users/me - Get Profile

### Request

```bash
curl http://localhost:3001/users/me ^
  -H "Authorization: Bearer NEW_USER_ACCESS_TOKEN"
```

**Replace `NEW_USER_ACCESS_TOKEN`** with the accessToken from Test Case 4.

### Expected Response (200 OK)

```json
{
  "id": "b2c3d4e5-f6a7-5432-bcde-234567890123",
  "email": "newuser@example.com",
  "first_name": "",
  "last_name": "",
  "phone": null,
  "status": "ACTIVE",
  "created_at": "2026-08-16T16:35:00.000Z",
  "updated_at": "2026-08-16T16:35:00.000Z"
}
```

---

## Test Case 6: POST /auth/refresh-token - Refresh Access Token

### Request

```bash
curl -X POST http://localhost:3001/auth/refresh-token ^
  -H "Content-Type: application/json" ^
  -d "{\"refreshToken\":\"NEW_USER_REFRESH_TOKEN\"}"
```

**Replace `NEW_USER_REFRESH_TOKEN`** with the refreshToken from Test Case 4.

### Expected Response (200 OK)

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5"
}
```

**Note:** Both tokens are NEW (token rotation).

### Database Check (pgAdmin)

```sql
SELECT 
  token_hash, 
  revoked, 
  created_at
FROM refresh_tokens 
WHERE user_id = 'b2c3d4e5-f6a7-5432-bcde-234567890123'
ORDER BY created_at DESC
LIMIT 2;
```

**Expected:**
- 2 rows: one old (revoked=true), one new (revoked=false)
- Old token's `revoked` = true
- New token's `revoked` = false

---

## Test Case 7: POST /auth/logout - Logout

### Request

```bash
curl -X POST http://localhost:3001/auth/logout ^
  -H "Authorization: Bearer NEW_USER_ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"refreshToken\":\"LATEST_REFRESH_TOKEN\"}"
```

**Use the NEW access token and refresh token from Test Case 6.**

### Expected Response (200 OK)

```json
{
  "message": "Logged out successfully"
}
```

### Database Check (pgAdmin)

```sql
SELECT 
  token_hash, 
  revoked
FROM refresh_tokens 
WHERE user_id = 'b2c3d4e5-f6a7-5432-bcde-234567890123'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected:**
- Latest token's `revoked` = true

---

## Test Case 8: GET /invitations - List Invitations

### Request

```bash
curl "http://localhost:3001/invitations?organizationId=00000000-0000-0000-0000-000000000001" ^
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
```

**Use the admin access token from Test Case 0.**

### Expected Response (200 OK)

```json
[
  {
    "id": "a1b2c3d4-e5f6-4321-abcd-123456789012",
    "organization_id": "00000000-0000-0000-0000-000000000001",
    "email": "newuser@example.com",
    "role": "EMPLOYEE",
    "status": "ACCEPTED",
    "token": "...",
    "expires_at": "2026-08-23T16:30:00.000Z",
    "created_by": "550e8400-e29b-41d4-a716-446655440000",
    "resent_count": 0,
    "accepted_at": "2026-08-16T16:35:00.000Z",
    "created_at": "2026-08-16T16:30:00.000Z",
    "updated_at": "2026-08-16T16:35:00.000Z"
  }
]
```

### Test with Status Filter

```bash
curl "http://localhost:3001/invitations?status=PENDING" ^
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
```

---

## Test Case 9: GET /invitations/:invitationId - Get Single Invitation

### Request

```bash
curl http://localhost:3001/invitations/INVITATION_ID ^
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
```

**Replace `INVITATION_ID`** with an actual invitation ID.

### Expected Response (200 OK)

```json
{
  "id": "a1b2c3d4-e5f6-4321-abcd-123456789012",
  "organization_id": "00000000-0000-0000-0000-000000000001",
  "email": "newuser@example.com",
  "role": "EMPLOYEE",
  "status": "ACCEPTED",
  "token": "...",
  "expires_at": "2026-08-23T16:30:00.000Z",
  "created_by": "550e8400-e29b-41d4-a716-446655440000",
  "resent_count": 0,
  "accepted_at": "2026-08-16T16:35:00.000Z",
  "created_at": "2026-08-16T16:30:00.000Z",
  "updated_at": "2026-08-16T16:35:00.000Z"
}
```

---

## Test Case 10: POST /invitations/:invitationId/resend - Resend Invitation

### Setup: Create a new invitation first

```bash
curl -X POST http://localhost:3001/invitations ^
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"organizationId\":\"00000000-0000-0000-0000-000000000001\",\"email\":\"resendtest@example.com\",\"role\":\"EMPLOYEE\"}"
```

**Note the invitation ID from the response.**

### Request

```bash
curl -X POST http://localhost:3001/invitations/INVITATION_ID/resend ^
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
```

### Expected Response (200 OK)

```json
{
  "id": "...",
  "organization_id": "00000000-0000-0000-0000-000000000001",
  "email": "resendtest@example.com",
  "role": "EMPLOYEE",
  "status": "PENDING",
  "expires_at": "2026-08-23T16:45:00.000Z",
  "created_by": "...",
  "resent_count": 1,
  "created_at": "...",
  "updated_at": "..."
}
```

**Note:** `token` is NOT included (security).

### Console Output

```
[EmailService] Publishing INVITATION email job for resendtest@example.com
[EmailService] Email job published successfully to queue: email-jobs
```

### RabbitMQ Check

New message in `email-jobs` queue with a DIFFERENT token.

### Database Check (pgAdmin)

```sql
SELECT 
  token, 
  status, 
  expires_at, 
  resent_count
FROM invitations 
WHERE email = 'resendtest@example.com';
```

**Expected:**
- `token` = NEW 64-character hex string (different from original)
- `status` = 'PENDING' (reset from any previous status)
- `expires_at` = NEW timestamp (7 days from resend time)
- `resent_count` = 1 (incremented)

---

## Test Case 11: POST /invitations/bulk - Bulk Upload (Success Case)

### Create Test CSV File

Create `test-invitations.csv`:

```csv
email,role,branchId
user1@example.com,EMPLOYEE,
user2@example.com,EMPLOYEE,
user3@example.com,BRANCH_ADMIN,
```

### Request (Windows CMD)

```bash
curl -X POST http://localhost:3001/invitations/bulk ^
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN" ^
  -F "file=@test-invitations.csv" ^
  -F "organizationId=00000000-0000-0000-0000-000000000001"
```

### Expected Response (201 Created)

```json
{
  "created": 3,
  "invitations": [
    {
      "id": "...",
      "organization_id": "00000000-0000-0000-0000-000000000001",
      "email": "user1@example.com",
      "role": "EMPLOYEE",
      "status": "PENDING",
      "expires_at": "...",
      "created_by": "...",
      "resent_count": 0,
      "created_at": "...",
      "updated_at": "..."
    },
    {
      "id": "...",
      "email": "user2@example.com",
      ...
    },
    {
      "id": "...",
      "email": "user3@example.com",
      ...
    }
  ]
}
```

### Console Output

```
[EmailService] Publishing INVITATION email job for user1@example.com
[EmailService] Email job published successfully to queue: email-jobs
[EmailService] Publishing INVITATION email job for user2@example.com
[EmailService] Email job published successfully to queue: email-jobs
[EmailService] Publishing INVITATION email job for user3@example.com
[EmailService] Email job published successfully to queue: email-jobs
```

### RabbitMQ Check

3 new messages in `email-jobs` queue (one per invitation).

### Database Check (pgAdmin)

```sql
SELECT 
  email, 
  role, 
  status
FROM invitations 
WHERE email IN ('user1@example.com', 'user2@example.com', 'user3@example.com')
ORDER BY email;
```

**Expected:** 3 rows, all with `status` = 'PENDING'

---

## Test Case 12: POST /invitations/bulk - Bulk Upload (Failure Case)

### Create Invalid CSV File

Create `test-invitations-invalid.csv`:

```csv
email,role,branchId
invalid-email,EMPLOYEE,
user4@example.com,INVALID_ROLE,
user5@example.com,EMPLOYEE,not-a-uuid
```

### Request

```bash
curl -X POST http://localhost:3001/invitations/bulk ^
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN" ^
  -F "file=@test-invitations-invalid.csv" ^
  -F "organizationId=00000000-0000-0000-0000-000000000001"
```

### Expected Response (400 Bad Request)

```json
{
  "message": "Validation failed",
  "errors": [
    {
      "row": 2,
      "errors": ["Invalid email address"]
    },
    {
      "row": 3,
      "errors": ["Invalid role. Must be one of: BRANCH_ADMIN, EMPLOYEE"]
    },
    {
      "row": 4,
      "errors": ["Invalid branchId format (must be UUID)"]
    }
  ]
}
```

### Database Check (pgAdmin)

```sql
SELECT COUNT(*) 
FROM invitations 
WHERE email IN ('invalid-email', 'user4@example.com', 'user5@example.com');
```

**Expected:** 0 rows (all-or-nothing validation - NOTHING was created)

### RabbitMQ Check

No new messages published (validation failed before any DB operations).

---

## Test Case 13: POST /invitations/bulk - Excel Upload

### Create Test Excel File

Create `test-invitations.xlsx` with:

| email | role | branchId |
|-------|------|----------|
| excel1@example.com | EMPLOYEE | |
| excel2@example.com | BRANCH_ADMIN | |

### Request

```bash
curl -X POST http://localhost:3001/invitations/bulk ^
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN" ^
  -F "file=@test-invitations.xlsx" ^
  -F "organizationId=00000000-0000-0000-0000-000000000001"
```

### Expected Response (201 Created)

```json
{
  "created": 2,
  "invitations": [...]
}
```

Same behavior as CSV upload.

---

## Test Case 14: gRPC - GetUser

### Request

```bash
node scripts/test-grpc-identity.js USER_ID
```

**Replace `USER_ID`** with the user ID from Test Case 4 (the newuser@example.com user).

### Expected Output

```
================================================================================
gRPC Identity Service Test
================================================================================

1. Testing GetUser...
   Request: { user_id: "b2c3d4e5-f6a7-5432-bcde-234567890123" }
   ✓ Response: {
  "id": "b2c3d4e5-f6a7-5432-bcde-234567890123",
  "first_name": "",
  "last_name": "",
  "email": "newuser@example.com",
  "status": "ACTIVE"
}

2. Testing GetUsersByIds...
   Request: { user_ids: ["b2c3d4e5-f6a7-5432-bcde-234567890123"] }
   ✓ Response: {
  "users": [
    {
      "id": "b2c3d4e5-f6a7-5432-bcde-234567890123",
      "first_name": "",
      "last_name": "",
      "email": "newuser@example.com",
      "status": "ACTIVE"
    }
  ]
}

3. Testing ValidateToken...
   ⊘ Skipped (no access token provided)

================================================================================
Tests completed!
================================================================================
```

---

## Test Case 15: gRPC - ValidateToken

### Request

```bash
node scripts/test-grpc-identity.js USER_ID ACCESS_TOKEN
```

**Replace with:**
- `USER_ID`: User ID from Test Case 4
- `ACCESS_TOKEN`: A valid access token (login first if needed)

### Expected Output

```
================================================================================
gRPC Identity Service Test
================================================================================

1. Testing GetUser...
   ✓ Response: {...}

2. Testing GetUsersByIds...
   ✓ Response: {...}

3. Testing ValidateToken...
   Request: { access_token: "eyJhbGciOiJIUzI1Ni..." }
   ✓ Response: {
  "valid": true,
  "user_id": "b2c3d4e5-f6a7-5432-bcde-234567890123",
  "email": "newuser@example.com"
}

================================================================================
Tests completed!
================================================================================
```

### Test Invalid Token

```bash
node scripts/test-grpc-identity.js USER_ID invalid-token-123
```

**Expected:**
```json
{
  "valid": false,
  "user_id": "",
  "email": ""
}
```

---

## Test Case 16: gRPC - GetUsersByIds (Multiple Users)

First, create multiple users (repeat Test Cases 1-4 with different emails), then:

### Request

Create a test script `test-grpc-multi.js`:

```javascript
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '..', 'contracts', 'identity.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const identityProto = grpc.loadPackageDefinition(packageDefinition).identity;
const client = new identityProto.IdentityService(
  'localhost:5001',
  grpc.credentials.createInsecure(),
);

const userIds = [
  'b2c3d4e5-f6a7-5432-bcde-234567890123', // newuser
  '550e8400-e29b-41d4-a716-446655440000', // admin
];

client.GetUsersByIds({ user_ids: userIds }, (error, response) => {
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Response:', JSON.stringify(response, null, 2));
  }
  process.exit(0);
});
```

Run:
```bash
node scripts/test-grpc-multi.js
```

### Expected Output

```json
{
  "users": [
    {
      "id": "b2c3d4e5-f6a7-5432-bcde-234567890123",
      "first_name": "",
      "last_name": "",
      "email": "newuser@example.com",
      "status": "ACTIVE"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "first_name": "",
      "last_name": "",
      "email": "admin@example.com",
      "status": "ACTIVE"
    }
  ]
}
```

---

## Verification Summary

### Database Final State Check (pgAdmin)

```sql
-- Users created
SELECT email, status FROM users ORDER BY created_at;

-- Invitations and their statuses
SELECT email, role, status, resent_count FROM invitations ORDER BY created_at;

-- Refresh tokens (should have some revoked, some active)
SELECT 
  u.email,
  rt.revoked,
  rt.expires_at,
  rt.created_at
FROM refresh_tokens rt
JOIN users u ON rt.user_id = u.id
ORDER BY rt.created_at DESC
LIMIT 10;
```

### RabbitMQ Final Check

1. Open http://localhost:15672
2. Go to **Queues** → `email-jobs`
3. Verify multiple INVITATION messages were queued
4. Check **Message rates** graph shows activity

### Console Logs Review

Search identity-service console for:
- "🔌 gRPC server running on port 5001"
- "🚀 Identity service running on port 3001"
- "Publishing INVITATION email job"
- "Email job published successfully"

---

## Common Issues & Solutions

### Issue: "Invalid email or password"
**Solution:** Ensure you activated the account before logging in (Test Case 3 before Test Case 4).

### Issue: "Invitation has expired"
**Solution:** Check the `expires_at` timestamp. You may need to resend the invitation.

### Issue: "Authorization header missing"
**Solution:** Include `-H "Authorization: Bearer YOUR_TOKEN"` in authenticated requests.

### Issue: "File is required" (bulk upload)
**Solution:** Use `-F "file=@filename.csv"` (with `@` symbol) in curl command.

### Issue: gRPC connection refused
**Solution:** Verify identity-service started successfully and shows "gRPC server running on port 5001".

### Issue: No messages in RabbitMQ
**Solution:** 
1. Check RabbitMQ is running: `netstat -an | findstr 5672`
2. Verify `RABBITMQ_URL` in .env matches your RabbitMQ setup
3. Check console for error messages about RabbitMQ connection

---

## Phase 1 Part 2 - COMPLETE! ✅

You've successfully tested:
- ✅ All 7 REST invitation endpoints
- ✅ Token security (never exposed in responses)
- ✅ Bulk upload (CSV & Excel, success & failure cases)
- ✅ Email job queuing to RabbitMQ
- ✅ All 3 gRPC methods (GetUser, GetUsersByIds, ValidateToken)
- ✅ Hybrid HTTP + gRPC server
- ✅ Database integrity (users, invitations, tokens)

**Next Steps:** Proceed to Phase 2 or other services as planned!
