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
- **Voice**: MediaRecorder (mono, 48kHz, echo-cancel + noise-suppress, no auto-gain) → auto-detected MIME (webm/mp4/ogg) → **preview with FX** → presigned URL upload of **raw audio** + FX metadata → message with `mediaType: "audio"` and `mediaMeta: { fx: {...} }`. After recording, members enter a preview step to audition FX, add an optional caption, then send or discard. Raw audio is always uploaded (smaller files, non-destructive). FX settings are stored as JSON metadata on the message and applied live during playback via Web Audio API. Old messages remain re-interpretable with new presets.
- **Video**: getUserMedia (video+audio) → MediaRecorder with 20s limit → presigned URL upload → message with `mediaType: "video"`
- **Captions**: optional text alongside media
- **Delete**: users can delete their own messages via `DELETE /api/rooms/:roomId/messages/:messageId`. Only the DB row is removed — media files in object storage are intentionally preserved forever.
- **Persistence**: messages stored indefinitely. Media files (audio/video) are never deleted from storage, even when a message is deleted.
- **Object storage**: Replit App Storage (GCS bucket), presigned PUT URLs, served back via `/api/storage/objects/*` with Range request support
- **Audio playback**: BlobAudioPlayer uses Web Audio API (BufferSource nodes). Per-track gain node for individual mute control.
- **Multi-track playback**: Members can play 1, 2, 3, or ALL echoes simultaneously. Track count selector in controls bar. When max tracks is reached, the oldest playing track stops to make room. Each track plays independently — no auto-pause-others.
- **Per-message mute**: Every media message has a mute/unmute toggle (Volume2/VolumeX icon). Muting sets gain to 0 without stopping playback. Members sculpt their own mix.
- **Seamless scrolling**: Auto-scroll only triggers on new messages and only if user hasn't manually scrolled up. Playing echoes continue when scrolled out of view.
- **Playback modes**: Toggle between SINGLE and CONTINUOUS. In continuous mode, echoes chain sequentially with 600ms glitch transitions. "PLAY ALL" starts continuous from the first echo.
- **Web Audio API engine**: Full FX bus: source → inputGain → highpass → compressor → EQ (low shelf 200Hz / high shelf 3kHz) → [dry/wet split] → modulation FX → toneFilter → waveshaper → delay section → [vocoder if enabled] → limiter → outputGain → analyser → destination. Proper gain staging prevents clipping.
- **Modulation FX**: Chorus (LFO-modulated 15ms delay), Flanger (3ms delay with 0.7 feedback), Ensemble (3 detuned chorus voices), Phaser (4-stage allpass chain with LFO sweep). Rate (0.1–8Hz) and depth (0–100%) controls.
- **Delay types**: Mono (single delay), Stereo (ping-pong L/R), Cross (cross-feedback L↔R), L/R (independent left/right delay times). All with filtered feedback loop.
- **2-band EQ**: Low shelf at 200Hz and high shelf at 3kHz, each ±12dB.
- **8-band Vocoder**: Bands at 200/400/800/1.2k/2k/3.5k/5.5k/8kHz. Sawtooth carrier at 130.81Hz (C3). Formant shift ±12 semitones. Envelope follower per band (abs waveshaper → 20Hz lowpass smoothing → gain modulation of carrier band).
- **FX panel**: Expandable effects rack organized into sections: Gain (SPEED/INPUT/OUTPUT), EQ (HPASS/TONE/LO SHELF/HI SHELF), Modulation (type selector + RATE/DEPTH), Amp (MIX/CRUSH), Delay (type selector + DELAY/DELAY R/FEEDBACK), Vocoder (ON/OFF + FORMANT). Two preset banks:
  - **Standard presets**: CLEAN, HAUNTED, CRUSHED, SUBMERGED, VOID, NERVE, ROBOT, CATHEDRAL — character-driven sound design presets.
  - **Constants Physics Engine** (`constants-physics.ts`): Mathematical constants now function as physics modes, not just presets. Each constant defines a base FX configuration AND a physics scaling factor that modifies how the audio engine interprets slider values. When a constant is active, the `fxOptions` memo applies `scaleParam()` which computes `identity + physicsScale(constKey, param, rawValue - identity)` clamped to slider bounds. Scaling factors: 0→0x (frozen), 1→1x (unity), 2→2x (doubled), 3→1.5x, π→π/3, φ→1.618x, √2→√2x, e→e/2, i→-1x (inverted), ℙ→prime[paramIdx]/10. Sliders store raw user intent; scaling is applied at the fxOptions computation layer. Each constant has a unique accent color, name, concept, and description displayed in an info panel. Perceptual distance bar shows how far each constant's base config is from identity (0.0–0.75 range). A "disengage" link clears the active constant.
- **RAW/BAKED upload toggle**: Before sending, members choose RAW (default — upload raw audio, apply FX live on playback) or BAKED (always render entire FX chain into the audio file via `renderWithFx` offline renderer, upload as WAV). Baked messages store `mediaMeta.fx.baked = true` and play back with clean/neutral FX (no double-processing). BAKED always renders regardless of whether FX differ from defaults — this locks in exactly what the sender previewed. Offline rendering uses `OfflineAudioContext` with tail duration accounting for the maximum of left/right delay times.
- **Non-destructive FX**: In RAW mode, raw audio is uploaded and FX settings are stored in `mediaMeta.fx` JSON on the message record. Playback applies stored FX live via Web Audio API, meaning older messages can be reinterpreted with different settings. In BAKED mode, the rendered audio is self-contained.
- **DB schema**: `messages.media_meta` — JSONB column storing `{ fx: FxOptions }` alongside `mediaType` and `mediaUrl`.
- **Waveform visualizer**: Canvas-based real-time waveform + frequency spectrum with anaglyphic blue/red dual-trace rendering, random glitch slice displacement, and jitter artifacts.
- **Ambient drone**: Generative low-frequency oscillator layer (3 detuned oscillators + LFO modulation + stereo panning). Intensity scales with message count in room. Activatable via AMBIENT/DRONE toggle.
- **Glitch transitions**: 600ms corrupted transition effect between echoes in continuous mode — brightness/contrast/hue-rotate/blur/skew animation during crossover.
- **Glitch effects**: When media plays, the feed activates visual glitch effects — ambient jitter, scanline overlay, RGB split on playing messages, corrupt text effects.
- **Echo states**: Playing messages get blue/red depth border glow, text corruption animation, and the message card flickers subtly. Images in the feed shift to luminosity blend mode during playback.

## Member Channels

- **General channel**: system-created, permanent, all cohort members auto-join. Pinned at top of dashboard.
- **Member channels**: any cohort member can create a named channel via `POST /api/rooms` with `{ name: "..." }`. Channel numbers are assigned sequentially. All existing cohort members are auto-added to new channels. New applicants joining a cohort are automatically added to all existing member channels. Channels can be deleted via `DELETE /api/rooms/:roomId` by the creator or an admin (general channel is protected from deletion). Deletion removes all messages, memberships, and the room record in a transaction.
- **Membership uniqueness**: `room_members` has a unique index on `(room_id, user_id)`. All membership inserts use `onConflictDoNothing` for idempotent, race-safe operation.
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
