# EN CRM & HRM UI/UX Revamp Plan

> **Target Branch:** `ui-revamp-experiment`
> **Date:** 2026-06-01
> **Goal:** Transition the EN HRM/CRM application from a functionally rich but visually primitive state to a refined, professional internal operations product.

---

## 1. Executive Summary

The EN HRM/CRM application is functionally complete through Stage 2F-1 (Client Lifecycle and Financials). However, the UI was built in a utilitarian "vibe-build" mode. Pages are text-heavy, navigation is crowded, and shared UI primitives (cards, tables, forms) are duplicated across files rather than unified in a design system. 

This revamp will restructure the Information Architecture (IA), implement a scalable sidebar with collapsible groups, introduce a cohesive component system, and extract the Internal CRM Assistant into a globally accessible floating drawer. The design direction targets a clean, compact, internal SaaS dashboard feel, utilizing the EN brand colors (blue for structure, red for important/destructive actions) without flashy consumer styling. Crucially, **no business logic, schemas, or server actions will be altered.**

## 2. Current UI Problems

1. **Sidebar Clutter:** The navigation is flat and overcrowded. CRM, HRM, and Admin links are visually mixed without clear hierarchy or icons.
2. **Assistant Misplacement:** The internal CRM Assistant is a full sidebar tab, breaking context when an agent needs to look up a doc while working a lead.
3. **Information Density:** Pages rely heavily on instructional text and raw `<dl>` lists rather than structured visual hierarchy.
4. **Component Fragmentation:** Cards, tables, notices, and buttons are repeatedly redefined inside `page.tsx` files (e.g., `ActionCard`, `Stat`, `Info`, `Notice`) leading to massive visual inconsistency.
5. **Client Lifecycle Navigation:** Client detail pages use basic pill links for tabs, which don't scale well visually as more stages (Visa, Applications, Documents, Closure) are added.
6. **Admin Tools Grouping:** The admin dashboard is a massive scrolling list of QuickLinks and ActionCards lacking tight thematic grouping.

## 3. Proposed Information Architecture (IA)

The navigation will be strictly categorized into collapsible groups.

**Core**
- Dashboard

**HRM**
- Calendar
- Attendance
- Tasks
- My Task History
- Leave
- Employees

**CRM**
- Leads
- Clients
- Follow-ups
- Transfers
- Raw Inbox *(super_admin only)*

**Admin**
- Admin CRM
- Financials
- Payroll Preview
- Paid Holidays
- Task Maintenance

**Global / Floating**
- Assistant Drawer

## 4. Sidebar/Navigation Redesign

- **Component:** Replace the hardcoded `<aside>` in `app/(dashboard)/layout.tsx` with a new `Sidebar` component.
- **Visuals:** Add subtle, standard icons (e.g., Lucide or Heroicons) for each navigation item.
- **Interactions:** Implement collapsible accordion sections for HRM, CRM, and Admin.
- **Active State:** Highlight the active route with a distinct background (subtle EN blue) and heavier font weight.

## 5. Floating Assistant/Drawer Plan

- **Current State:** `/crm/assistant` is a standalone page.
- **Proposed UX:** A floating action button (FAB) in the bottom right corner (or a dedicated icon in the top header) that opens a slide-over panel.
- **Implementation:** 
  - Create a `GlobalAssistantDrawer` client component in the root layout.
  - The drawer will reuse the existing server-side Gemini logic from `/crm/assistant/actions.ts`.
  - For the MVP, if the slide-over is too complex, the FAB can simply deep-link to `/crm/assistant`, but the primary goal is a persistent drawer so agents don't lose their current view (e.g., a lead detail page).

## 6. Shared Component System Plan

Extract in-file components into `components/ui/` to enforce consistency.

- **`PageHeader`**: Standardizes `<h1>`, breadcrumbs, and primary action buttons.
- **`SectionCard`**: A unified container with standard padding, border-radius, and shadow for grouping information.
- **`StatCard`**: Standardized metric display (Label, Value, Hint).
- **`DataTable`**: Replaces the scattered `<Th>` and `<Td>` implementations. Must include standard hover states and empty states.
- **`StatusChip`**: Upgrade the existing `StatusChip` to handle a unified color palette for all CRM/HRM statuses.
- **`EmptyState`**: A standardized component for empty tables or missing data with an optional call-to-action.
- **`ActionBar`**: A floating or sticky bar for bulk actions or primary page-level form submissions.
- **`ConfirmDangerZone`**: A consistent modal/panel for destructive actions (e.g., Task Maintenance deletions, Client Withdrawals).

## 7. Page-by-Page Revamp Map

- **`dashboard` (HRM/Employee):** Clean up the basic stats. Use the new `StatCard`.
- **`admin dashboard`:** Group the massive list of ActionCards into distinct sections: Headcount, Action Items, Configuration. Replace the custom `Section` and `Row` with standard grid layouts.
- **`admin financials`:** Elevate the look of the PKR-only tables. Add a subtle amber banner for the non-PKR warning using a unified `Notice` component.
- **`task maintenance`:** Wrap the deletion flow in a `ConfirmDangerZone` component to prevent accidental clicks and make it feel like a serious operations tool.
- **`leads` & `clients` (Lists):** Implement the `DataTable` component. Add the `FilterBar` pattern inspired by Atomic CRM.
- **`client detail` (Shell):** Replace the loose navigation pills with a polished Tab navigation bar. Use `SectionCard` for the Client Shell info.
- **`documents`, `applications`, `visa`, `closure`, `financials`:** Standardize the inner forms and data tables. Ensure the "Missing Milestone" or "Unreviewed Doc" badges align with the new `StatusChip` design.
- **`follow-ups` & `transfers`:** Implement the Kanban/Board visual style for follow-ups (due today, overdue) using tight, compact cards.
- **`raw inbox`:** Ensure the parser payload renders in a clean, code-block style or structured list, rather than a raw JSON dump.

## 8. Risk Assessment

- **Hydration / Client vs. Server:** Many existing pages are heavily server-rendered. Moving to interactive sidebars, tabs, or drawers will require careful placement of `"use client"` boundaries to avoid breaking server actions.
- **Mobile Responsiveness:** Tables with many columns (e.g., Shifts, Clients) will break on mobile if not wrapped in `overflow-x-auto`.
- **Form State:** Refactoring forms (especially in `closure` and `financials`) into shared UI primitives might disrupt the native `formData` handling if not wired correctly.

## 9. What Must Not Change

- **No Schema Changes:** Do not add or alter database columns.
- **No Migrations:** No new SQL files.
- **No Server Action Behavior Changes:** Do not alter the actual logic in `actions.ts` files.
- **No Feature Additions:** WhatsApp API, Gemini Parser, and Client Portal remain deferred.
- **No Permission Changes:** Do not alter RLS or the `lib/auth/` RBAC logic, other than correctly hiding/showing UI elements based on the existing roles.

## 10. Implementation Phases

- **Phase UI-1:** Layout/sidebar groups + active states. (Update `layout.tsx`).
- **Phase UI-2:** Shared UI primitives. (Build components in `components/ui/`).
- **Phase UI-3:** Dashboard / Admin / Financials / Task Maintenance polish. (Apply primitives to admin routes).
- **Phase UI-4:** CRM Lead/Client list polish. (Apply DataTables and Filters).
- **Phase UI-5:** Client lifecycle tab polish. (Revamp the `[id]` shell and its sub-pages).
- **Phase UI-6:** Floating assistant drawer. (Extract the assistant logic into a root-level client component).
- **Phase UI-7:** Final visual QA and responsive cleanup.

## 11. Codex/Claude-Sized Task Breakdown

1. **Task 1: Sidebar & Navigation Component:** Rewrite `app/(dashboard)/layout.tsx` to use a dedicated, collapsible `<Sidebar>` component.
2. **Task 2: Core Primitives (Cards & Chips):** Build `SectionCard`, `StatCard`, and update `StatusChip`. Refactor `/admin` to use them.
3. **Task 3: Core Primitives (Tables & Empty States):** Build `DataTable` and `EmptyState`. Refactor `/crm/clients` and `/crm/leads` to use them.
4. **Task 4: Client Detail Tabs:** Refactor `/crm/clients/[id]/page.tsx` and sibling pages to use a unified Tab navigation component.
5. **Task 5: Client Lifecycle Forms:** Clean up the forms in `/documents`, `/visa`, and `/closure` using standard input primitives and `ConfirmDangerZone` for withdrawals.
6. **Task 6: Assistant Drawer Implementation:** Create a `<AssistantDrawer>` client component, dock it to the layout, and wire it to the Gemini server action.
7. **Task 7: Timeline Polish:** Update the activity timeline to the Atomic CRM reference style (icons, vertical connector lines, compact text).

## 12. Manual Visual QA Checklist

- [ ] Sidebar collapses properly and active routes highlight correctly.
- [ ] Non-admin users cannot see Admin links.
- [ ] Client detail tabs navigate smoothly without layout jumping.
- [ ] Assistant drawer opens globally, maintains its state while open, and doesn't obscure critical UI.
- [ ] Financials page renders PKR warnings correctly.
- [ ] Task maintenance destructive action requires explicit confirmation.
- [ ] All tables scroll horizontally on small viewports.
- [ ] Empty states show a clear, friendly message rather than a broken layout.