# EN CRM — Agent Reference Index

> **Read this file FIRST before any other CRM doc.**
> **Last updated:** 2026-05-23.
>
> Purpose: tell agents (Claude / Codex / GPT / Gemini) which docs to load
> for which kind of task. Everything outside this list is either archived
> or doesn't exist.

---

## How to use this file

1. Identify what your task is in the table below.
2. Open ONLY the docs the table tells you to open. Don't grab everything.
3. If your task isn't in the table, default to: `CURRENT_STATE.md` +
   `CRM_MASTER_CONTEXT.md` and stop there until you know more.
4. **Never read anything from `archive/`** — those docs are pre-Stage-1
   or superseded. Treat that directory as deleted.

---

## Active docs — what each one is for

### Operating state

| Doc | Use when |
|---|---|
| **`CURRENT_STATE.md`** | You need to know what's actually shipped right now. Single source of truth. Updated after every feature lands. |
| **`CRM_BOARD.md`** | You need to know the active task backlog and priorities. |

### Architecture and philosophy

| Doc | Use when |
|---|---|
| **`CRM_MASTER_CONTEXT.md`** | You need the CRM's philosophy: WhatsApp-first, parser vs assignment, transfers as first-class, etc. |
| **`STAGE_1_DECISIONS.md`** | You need the locked decisions from Stage 1 (roles allowed, what Stage 1 does and does not do). |
| **`CRM_HRM_INTEGRATION.md`** | You're touching anything that crosses HRM ↔ CRM (employees, branches, roles, tasks). |
| **`CRM_SETTINGS_INTEGRATION_NOTES.md`** | You're working on permissions, roles, settings, or anything that needs to align with the future System Settings RBAC plan. |

### Plans

| Doc | Use when |
|---|---|
| **`CLIENT_LIFECYCLE_STAGE_2_PLAN.md`** | You're building anything Stage 2 (client lifecycle): conversion, documents, applications, country milestones, closure. **All Phase 2A–2F plans live here, in §11.** |
| **`WHATSAPP_META_PIPELINE.md`** | You're working on the WhatsApp ingestion architecture (Meta API, webhooks, parser pipeline). |
| **`WHATSAPP_STAGE_1_INTAKE.md`** | You're working on Stage 1 raw intake specifics (mock or real). |

### Reference (read-only, copy-with-attribution rules)

| Doc | Use when |
|---|---|
| **`REFERENCE_CODE_EXTRACTION_MAP.md`** | You need UI/UX patterns from open-source CRMs. Lists C-01 through C-14 candidates (Atomic CRM MIT, Krayin MIT, Frappe AGPL inspiration-only, etc.). |
| **`REFERENCE_CRM_INTEGRATION_AUDIT.md`** | Companion to the extraction map — license verification + architectural notes. |

### Agent continuity

| Doc | Use when |
|---|---|
| **`CRM_AI_HANDOFF_AND_REFERENCE_ARCHITECTURE.md`** | You're a new agent picking up the project. Long-form architectural overview. |
| **`INDEX.md`** | This file. |

---

## Task → docs mapping (quick lookup)

| Task | Docs to load |
|---|---|
| "What's the current state of the CRM?" | `CURRENT_STATE.md` |
| "What features are next?" | `CRM_BOARD.md` + `CURRENT_STATE.md` |
| "Build Phase 2B (documents)" | `CLIENT_LIFECYCLE_STAGE_2_PLAN.md` §6, §11 + `CURRENT_STATE.md` |
| "Build Phase 2C (applications)" | `CLIENT_LIFECYCLE_STAGE_2_PLAN.md` §5, §11 + `CURRENT_STATE.md` |
| "Build Phase 2D (country milestones / visa)" | `CLIENT_LIFECYCLE_STAGE_2_PLAN.md` §7, §11 + `CURRENT_STATE.md` |
| "Add a new permission check" | `CRM_SETTINGS_INTEGRATION_NOTES.md` + `STAGE_1_DECISIONS.md` |
| "Anything that touches HRM employees/branches/roles" | `CRM_HRM_INTEGRATION.md` |
| "Adapt UI from external CRMs" | `REFERENCE_CODE_EXTRACTION_MAP.md` + `REFERENCE_CRM_INTEGRATION_AUDIT.md` |
| "Add WhatsApp webhook handling" | `WHATSAPP_META_PIPELINE.md` + `WHATSAPP_STAGE_1_INTAKE.md` |
| "Onboard onto the CRM project" | `CRM_AI_HANDOFF_AND_REFERENCE_ARCHITECTURE.md` then this INDEX |

---

## Update rules for this index

- When a new active doc lands → add it here with its purpose.
- When a doc is superseded → move it to `archive/` and remove its row.
- When CURRENT_STATE changes → update it, but **leave this INDEX alone**
  unless the doc list changes.
- This INDEX is documentation about documentation. It doesn't describe
  features.

---

## What's NOT here

- Migration files. Those live in `supabase/migrations/`.
- Code. Routes live in `app/(dashboard)/crm/*` and `app/(dashboard)/admin/crm/*`.
- HRM docs. Those live in `memory/projects/hrm/` (separate INDEX should
  exist there eventually — not yet).
- Run-of-the-mill todos. Those live in `CRM_BOARD.md`.
