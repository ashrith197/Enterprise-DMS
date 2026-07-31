# Document Management System - Phase 0

A microservices-based Document Management System built with NestJS, gRPC, PostgreSQL, and Next.js.

## Prerequisites

Before starting, ensure you have the following installed on your machine:

- **Node.js**: v18.x or higher
- **PostgreSQL**: Installed natively
  - **macOS**: `brew install postgresql@15 && brew services start postgresql@15`
  - **Ubuntu/Debian**: `sudo apt update && sudo apt install postgresql postgresql-contrib`
  - **Windows**: Download from [PostgreSQL official site](https://www.postgresql.org/download/windows/)
- **Redis**: Installed natively
  - **macOS**: `brew install redis && brew services start redis`
  - **Ubuntu/Debian**: `sudo apt install redis-server`
  - **Windows**: Download from [Redis for Windows](https://github.com/microsoftarchive/redis/releases)
- **RabbitMQ**: Installed natively with management plugin enabled
  - **macOS**: `brew install rabbitmq && brew services start rabbitmq`
  - **Ubuntu/Debian**: `sudo apt install rabbitmq-server && sudo rabbitmq-plugins enable rabbitmq_management`
  - **Windows**: Download from [RabbitMQ official site](https://www.rabbitmq.com/download.html)
  - **Management UI**: Accessible at http://localhost:15672 (default credentials: guest/guest)

## Database Setup

Each service has its own isolated database. Create all databases using the following commands:

```bash
createdb identity_db
createdb organization_db
createdb branch_db
createdb team_db
createdb document_db
createdb transfer_db
createdb notification_db
createdb audit_db
```

**Note**: If you encounter permission issues, you may need to create a PostgreSQL user first or use `sudo -u postgres createdb <dbname>` on Linux. The gateway service does not have a database as it acts purely as an API proxy.

## Service Configuration

Each service has a `.env.example` file in its root directory. Copy this file to `.env` and configure as needed:

```bash
# For each service directory
cd <service-folder>
cp .env.example .env
```

The `.env.example` files already contain the correct `DATABASE_URL` values if you followed the `createdb` commands exactly. No changes are needed unless you have a custom PostgreSQL setup.

Example for identity-service:
```env
PORT=3001
GRPC_PORT=5001
DATABASE_URL=postgresql://localhost:5432/identity_db
```

## Proto Sync Script

The `/contracts` folder contains all gRPC proto definitions. This is the single source of truth.

**Important**: Whenever you modify any `.proto` file in the `/contracts` folder, you MUST run the sync script to propagate changes to all services:

```bash
node scripts/sync-protos.js
```

This script copies the necessary proto files into each service's `proto/` folder based on their dependencies.

**Never hand-edit proto files inside service folders** — they will be overwritten by the sync script.

## Running Services

Each service is a standalone NestJS application and must be run in its own terminal window/tab.

### Install Dependencies

For each service:

```bash
cd <service-folder>
npm install
```

Services to install:
- gateway
- identity-service
- organization-service
- branch-service
- team-service
- document-service
- transfer-service
- notification-service
- audit-service

### Start Services

Each service must be started in its own terminal:

```bash
cd <service-folder>
npm run start:dev
```

**There is no single command to start all services.** You need to open 9 terminal windows/tabs and run each service individually.

Service ports:
- **gateway**: http://localhost:3000
- **identity-service**: http://localhost:3001
- **organization-service**: http://localhost:3002
- **branch-service**: http://localhost:3003
- **team-service**: http://localhost:3004
- **document-service**: http://localhost:3005
- **transfer-service**: http://localhost:3006
- **notification-service**: http://localhost:3007
- **audit-service**: http://localhost:3008
- **frontend**: http://localhost:3009

## Running Frontend

The frontend is a standalone Next.js application:

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at: http://localhost:3009

## Architecture Notes

- **No Monorepo Tooling**: This project intentionally does not use Nx, Turborepo, or npm/yarn workspaces. Each service is completely independent with its own `package.json`, `node_modules`, and configuration.

- **No Docker (Yet)**: Docker is intentionally not used in local development for Phase 0. All services (PostgreSQL, Redis, RabbitMQ) are expected to run natively. Docker will be introduced in later phases for deployment.

- **Service Isolation**: Each microservice has its own database and operates independently. No shared code or dependencies across service boundaries (each service has its own copy of common utilities).

- **gRPC Communication**: Services communicate with each other via gRPC. The `/contracts` folder defines all service contracts.

- **Gateway as Proxy Only**: The gateway service does not own any data and has no database. It acts purely as an API proxy, forwarding HTTP requests to backend services over gRPC.

## Project Structure

```
document-management-system/
├── contracts/              # gRPC proto definitions (single source of truth)
├── scripts/                # Utility scripts (proto sync)
├── gateway/                # API Gateway service
├── identity-service/       # User authentication & authorization
├── organization-service/   # Organization management
├── branch-service/         # Branch management
├── team-service/           # Team management
├── document-service/       # Document management
├── transfer-service/       # Document transfer handling
├── notification-service/   # Notification handling
├── audit-service/          # Audit logging
└── frontend/               # Next.js frontend application
```

## Development Workflow

1. Modify proto files in `/contracts` (if needed)
2. Run `node scripts/sync-protos.js` to sync changes
3. Implement service logic in individual services
4. Test services independently
5. Integrate via gRPC calls

## Phase 0 Scope

This phase includes ONLY:
- ✅ Folder structure and service scaffolding
- ✅ Proto contract stubs
- ✅ Proto sync script
- ✅ Basic NestJS setup with common utilities (logger, exception filter, gRPC client factory)
- ✅ Database connection configuration (no tables yet)
- ✅ Service boot verification

**Not included in Phase 0**:
- ❌ Business logic implementation
- ❌ Database entities/tables
- ❌ Actual gRPC service methods
- ❌ API endpoints
- ❌ Authentication/authorization
- ❌ Docker configuration

These will be added in subsequent phases.

## Troubleshooting

**Port already in use**: Make sure no other applications are using ports 3000-3008 or 5000-5008.

**Database connection failed**: Verify PostgreSQL is running (`pg_isready` command) and databases were created correctly.

**Proto sync errors**: Ensure all service directories exist before running the sync script.

**npm install fails**: Try clearing npm cache (`npm cache clean --force`) and retry.

## Next Steps

Phase 1 will introduce:
- Database entities and migrations
- gRPC service implementations
- API endpoints in the gateway
- Basic authentication
