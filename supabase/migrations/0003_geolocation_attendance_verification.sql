-- =========================================================
-- 0003 — geolocation-first attendance verification
--
-- Apply before Phase A app code is tested.
-- Adds first-class office geofence fields and attendance verification columns.
-- Existing geolocation JSON is preserved for backwards compatibility.
-- =========================================================

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS office_latitude double precision,
  ADD COLUMN IF NOT EXISTS office_longitude double precision,
  ADD COLUMN IF NOT EXISTS office_radius_meters int NOT NULL DEFAULT 200;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS check_in_latitude double precision,
  ADD COLUMN IF NOT EXISTS check_in_longitude double precision,
  ADD COLUMN IF NOT EXISTS check_out_latitude double precision,
  ADD COLUMN IF NOT EXISTS check_out_longitude double precision,
  ADD COLUMN IF NOT EXISTS check_in_distance_meters int,
  ADD COLUMN IF NOT EXISTS check_out_distance_meters int,
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS review_reason text;

UPDATE branches
SET
  office_latitude = 24.860302723715073,
  office_longitude = 67.05738448332636,
  office_radius_meters = 200
WHERE code = 'KHI';

UPDATE branches
SET
  office_latitude = 31.470122612909403,
  office_longitude = 74.27147368765019,
  office_radius_meters = 200
WHERE code = 'LHE';

CREATE INDEX IF NOT EXISTS attendance_verification_status_idx
  ON attendance_records(verification_status, date DESC);

CREATE INDEX IF NOT EXISTS attendance_requires_review_idx
  ON attendance_records(requires_review, date DESC)
  WHERE requires_review = true;
