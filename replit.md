# Workspace

## Overview

pnpm workspace monorepo using TypeScript. This is Host App — a members-only platform for artists with hidden organizational logic.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: express-session + bcryptjs + connect-pg-simple
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + framer-motion

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── host-app/           # React + Vite frontend (Host App)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Host App Concept

Host App is a members-only app for artists with hidden organizational logic.

### Cohort Logic

- Every 100 applications creates one independent cohort
- Application order is fixed once written (immutable)
- Prime positions within the cohort (2,3,5,7,...,97) determine selected users
- Team A: positions 2,3,5,7,11,13,17,19,23,29,31,37 (12 users)
- Team B: positions 41,43,47,53,59,61,67,71,73,79,83,89 (12 users)
- Hidden Leader: position 97 (1 user, appears as normal member outwardly)
- Non-prime positions: peripheral users with restricted access

### Role Types

1. **Applicant** - submitted profile, awaits status
2. **Team Member** (Team A or B) - placed in team room
3. **Hidden Leader** - position 97, extra permissions but appears normal
4. **Peripheral User** - restricted anonymous access
5. **Admin** - external operator with full access

### Status Labels (never reveal selection rule)

- "Assigned Participant" (team member)
- "Provisional Member" (leader)
- "Restricted Access Participant" (peripheral)
- "Further Instructions Pending" (unassigned)

## DB Schema

Tables: `users`, `cohorts`, `applications`, `cohort_roles`, `rooms`, `room_members`, `messages`, `instructions`

## API Routes

- `GET /api/healthz` - Health check
- `GET /api/auth/me` - Current user
- `POST /api/auth/register` - Register
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/applications` - Submit application
- `GET /api/applications` - Get my application
- `GET /api/applications/all` - All applications (admin)
- `GET /api/cohorts` - All cohorts (admin)
- `GET /api/cohorts/current` - Open cohort status
- `POST /api/cohorts/:id/process` - Process cohort (admin)
- `GET /api/my-role` - My role assignment
- `GET /api/rooms` - My accessible rooms
- `GET /api/rooms/:id/messages` - Room messages
- `POST /api/rooms/:id/messages` - Send message
- `GET /api/instructions` - My instructions
- `POST /api/instructions` - Create instruction (admin)
- `GET /api/admin/stats` - Admin stats

## Cohort Engine (`artifacts/api-server/src/lib/cohort-engine.ts`)

The prime-based selection logic. When admin calls `POST /api/cohorts/:id/process`:
1. Assigns roles based on application order
2. Creates 5 room types: team_a, team_b, leader, peripheral, admin_broadcast
3. Adds users to appropriate rooms based on their role
4. Locks the cohort and marks applications as assigned
