# Identity Service

Identity Service for Enterprise DMS - handles authentication, user management, and invitations.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- RabbitMQ (for email queue)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create the database:
```bash
createdb identity_db
```

3. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

4. Run migrations:
```bash
npm run migration:run
```

## Development

Start the service in development mode:
```bash
npm run start:dev
```

The service will be available at `http://localhost:3001`

## Testing Phase 1 Part 1

### 1. Run the migration
```bash
npm run migration:run
```

### 2. Start the service
```bash
npm run start:dev
```

Confirm it's listening on port 3001.

### 3. Seed a test invitation
```bash
node scripts/seed-test-invitation.js
```

This creates an invitation with token: `test-invitation-token-12345` and email: `testuser@example.com`

### 4. Test the full authentication flow

**Step 1: Activate account**
```bash
curl -X POST http://localhost:3001/auth/activate \
  -H "Content-Type: application/json" \
  -d '{
    "token": "test-invitation-token-12345",
    "password": "Password123"
  }'
```

**Step 2: Login**
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "Password123"
  }'
```
Save the `accessToken` and `refreshToken` from the response.

**Step 3: Get user profile**
```bash
curl http://localhost:3001/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Step 4: Refresh token**
```bash
curl -X POST http://localhost:3001/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

**Step 5: Logout**
```bash
curl -X POST http://localhost:3001/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

**Step 6: Forgot password**
```bash
curl -X POST http://localhost:3001/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com"
  }'
```
Check console for the password reset email (or Mailhog if SMTP is configured).

**Step 7: Reset password**
```bash
curl -X POST http://localhost:3001/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TOKEN_FROM_EMAIL",
    "newPassword": "NewPassword456"
  }'
```

**Step 8: Login with new password**
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "NewPassword456"
  }'
```

### 5. Cleanup
Delete the seed script after testing:
```bash
rm scripts/seed-test-invitation.js
```

## Available Endpoints

### Authentication (`/auth`)
- `POST /auth/login` - Login with email and password
- `POST /auth/refresh-token` - Refresh access token
- `POST /auth/logout` - Logout and revoke refresh token
- `POST /auth/activate` - Activate account with invitation token
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with token

### Users (`/users`)
- `GET /users/me` - Get current user profile (requires auth)
- `GET /users/:userId` - Get user by ID (requires auth)
- `PATCH /users/:userId` - Update user profile (requires auth)
- `PATCH /users/:userId/status` - Update user status (requires auth)

## Email Configuration

The service uses RabbitMQ for email queuing. If `SMTP_HOST` is not configured, emails will be logged to the console with full content and links.

To use real SMTP (e.g., Mailhog for local testing):
1. Uncomment SMTP variables in `.env`
2. Set `SMTP_HOST=localhost` and `SMTP_PORT=1025`
3. Restart the service

## Migration Commands

Generate a new migration:
```bash
npm run migration:generate src/migrations/MigrationName
```

Run migrations:
```bash
npm run migration:run
```

Revert last migration:
```bash
npm run migration:revert
```
