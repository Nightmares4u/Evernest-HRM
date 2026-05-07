# EN HRM — Current State

## Day-0 Checkpoint

**Current project path:** `~/EN HRM`
**Git status:** Initialized, no commits yet.

### What Exists
- Next.js 15 / Tailwind CSS scaffold
- Supabase client/server files
- Supabase migration `0001_init.sql`
- HRM planning docs under `memory/projects/hrm/`
- Ignored password-bearing seed file at `memory/projects/hrm/seed/users.csv`

### What is Safe to Commit
- All planning documentation (`memory/projects/hrm/*.md` and `memory/projects/hrm/seed/users.csv.example`)
- Next.js application structure, configuration files, and middleware
- Supabase migrations and helper scripts
- `.gitignore`, `package.json`, `README.md`, etc.

### What Must Never Be Committed
- **`memory/projects/hrm/seed/users.csv`** (contains real, plaintext passwords)
- **`.env.local`** (when created, will contain real Supabase and Cron secrets)

### Known Missing Day-1 Items
- `scripts/seed-users.ts`
- `.env.local`
- Real Supabase project/keys
- Actual UI/server actions

### Next Recommended Step
- Prepare initial commit of safe scaffold/planning docs only.