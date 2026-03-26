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
- **Design system**: Woven textile minimalism — black/cream/white palette, IBM Plex Mono monospace, anaglyphic blue/red depth text, geometric weave patterns

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
- `GET /api/rooms` - My accessible rooms (sorted: general first, then member channels by number)
- `POST /api/rooms` - Create a member channel (name required, auto-assigns channel number)
- `GET /api/rooms/:id/messages` - Room messages (no auto-expiry, all messages persist)
- `POST /api/rooms/:id/messages` - Send message
- `DELETE /api/rooms/:roomId/messages/:messageId` - Delete own message
- `GET /api/instructions` - My instructions
- `POST /api/instructions` - Create instruction (admin)
- `GET /api/admin/stats` - Admin stats
- `POST /api/storage/uploads/request-url` - Request presigned GCS upload URL (auth required)
- `GET /api/storage/objects/*` - Serve stored media objects
- `GET /api/storage/public-objects/*` - Serve public assets

## Media Messaging

Members can send photos, voice messages, and short videos in rooms. All identities remain hidden.

- **Photo**: getUserMedia → canvas capture → JPEG blob → presigned URL upload → message with `mediaType: "image"`
- **Voice**: MediaRecorder → auto-detected MIME (webm/mp4/ogg) → presigned URL upload → message with `mediaType: "audio"`
- **Video**: getUserMedia (video+audio) → MediaRecorder with 20s limit → presigned URL upload → message with `mediaType: "video"`
- **Captions**: optional text alongside media
- **Delete**: users can delete their own messages via `DELETE /api/rooms/:roomId/messages/:messageId`
- **Persistence**: messages are stored indefinitely (no auto-expiry). Members can manually delete their own messages.
- **Object storage**: Replit App Storage (GCS bucket), presigned PUT URLs, served back via `/api/storage/objects/*` with Range request support
- **Audio playback**: BlobAudioPlayer component fetches audio as blob, detects format from magic bytes (MP4/WebM/OGG), creates blob URL for reliable playback

## Member Channels

- **General channel**: system-created, permanent, all cohort members auto-join. Pinned at top of dashboard.
- **Member channels**: any cohort member can create a named channel via `POST /api/rooms` with `{ name: "..." }`. Channel numbers are assigned sequentially. All existing cohort members are auto-added to new channels.
- **Dashboard layout**: General pinned at top, member-created channels listed below with left-border indent. "New Channel" button at bottom.
- **Room types**: `general`, `member_channel`, plus system types (`team_a`, `team_b`, `leader`, `peripheral`, `admin_broadcast`)
- **DB columns on rooms**: `display_name` (text, nullable), `channel_number` (integer, nullable), `created_by_user_id` (integer, nullable FK to users)

## Anonymous Identity System

- Each member has a persistent `maskedLabel` per room stored in `room_members.masked_label`
- Labels format: `ADJECTIVE-NOUN-###` (e.g. `SILENT-CONDUIT-487`)
- Assigned when user joins a room; backfilled automatically on first message if missing
- Displayed as sender identity in all messages — user IDs never exposed

## Cohort Engine (`artifacts/api-server/src/lib/cohort-engine.ts`)

The prime-based selection logic. When admin calls `POST /api/cohorts/:id/process`:
1. Assigns roles based on application order
2. Creates 5 room types: team_a, team_b, leader, peripheral, admin_broadcast
3. Adds users to appropriate rooms based on their role
4. Locks the cohort and marks applications as assigned
