/**
 * CRM lifecycle feature flags.
 *
 * The raw-inbox → lead → client intake pipeline (WhatsApp ingestion,
 * lead qualification, transfers, conversion queue) is paused as of the
 * 2026-07 business pivot: clients are created directly as client shells.
 *
 * Nothing from the intake pipeline is deleted — its routes are gated on
 * this flag and its nav entries are commented out in the dashboard
 * layout. Flip to true (and restore the nav items) to re-enable the old
 * lifecycle when raw-inbox/client wiring returns.
 */
export const CRM_INTAKE_ENABLED = false;
