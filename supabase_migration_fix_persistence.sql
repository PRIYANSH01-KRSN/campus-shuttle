-- Apply this once in the Supabase SQL editor for an existing installation.
-- The app uses PIN-based driver and anonymous student device identities, not
-- Supabase Auth identities. The old foreign keys therefore rejected valid
-- writes from the app and made newly added drivers and wait signals disappear.

ALTER TABLE public.caddies
  DROP CONSTRAINT IF EXISTS caddies_current_driver_id_fkey;

ALTER TABLE public.wait_flags
  DROP CONSTRAINT IF EXISTS wait_flags_student_id_fkey;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Phone number is the driver's stable login identifier. This lets onboarding
-- update an existing driver rather than creating ambiguous duplicate records.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone)
  WHERE phone IS NOT NULL AND phone <> '';

-- A device should have only one active request per station. It also prevents
-- a refresh/retry from inflating the waiting count.
CREATE UNIQUE INDEX IF NOT EXISTS wait_flags_station_student_unique
  ON public.wait_flags (station_id, student_id);

-- Remove expired requests so station waiting_count stays accurate. Run this
-- from a scheduled Supabase job every minute, or call it before reading flags.
CREATE OR REPLACE FUNCTION public.expire_wait_flags()
RETURNS void
SECURITY DEFINER
LANGUAGE sql
AS $$
  DELETE FROM public.wait_flags WHERE expires_at <= now();
$$;
