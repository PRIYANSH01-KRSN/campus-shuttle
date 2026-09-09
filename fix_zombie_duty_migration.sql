-- ============================================================================
-- FIX: Zombie Duty Bug — Drivers remain ON_DUTY with stale/off-campus location
-- after ending their shift because the native background HTTP service keeps
-- pinging update_caddy_telemetry, which unconditionally sets status = 'ON_DUTY'.
--
-- MUST BE RUN IN SUPABASE SQL EDITOR BEFORE DEPLOYING THE CLIENT-SIDE FIXES.
-- ============================================================================

-- 1. Replace update_caddy_telemetry: prevent duty resurrection & add campus geofence
DROP FUNCTION IF EXISTS public.update_caddy_telemetry(FLOAT, FLOAT, FLOAT, FLOAT, FLOAT, BIGINT, TEXT, BOOLEAN, FLOAT, FLOAT) CASCADE;

CREATE OR REPLACE FUNCTION public.update_caddy_telemetry(
    latitude FLOAT,
    longitude FLOAT,
    accuracy FLOAT DEFAULT NULL,
    speed FLOAT DEFAULT NULL,
    bearing FLOAT DEFAULT NULL,
    "time" BIGINT DEFAULT NULL,
    source TEXT DEFAULT NULL,
    simulated BOOLEAN DEFAULT FALSE,
    altitude FLOAT DEFAULT NULL,
    "altitudeAccuracy" FLOAT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
    v_headers JSON;
    v_auth_header TEXT;
    v_raw_token TEXT;
    v_token_hash TEXT;
    v_caddy_id TEXT;
    v_caddy_status TEXT;
BEGIN
    -- Extract telemetry token from HTTP headers
    BEGIN
        v_headers := current_setting('request.headers', true)::json;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Unable to read headers';
    END;

    v_auth_header := v_headers->>'x-telemetry-token';

    IF v_auth_header IS NULL THEN
        RAISE EXCEPTION 'Missing X-Telemetry-Token header';
    END IF;

    -- Hash incoming token
    v_raw_token := v_auth_header;
    v_token_hash := encode(digest(v_raw_token, 'sha256'::text), 'hex');

    -- Server-Authoritative Target (No client caddy_id parameter)
    SELECT caddy_id INTO v_caddy_id
    FROM public.telemetry_sessions
    WHERE token_hash = v_token_hash AND expires_at > now();

    IF v_caddy_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized or expired telemetry token';
    END IF;

    -- ===== FIX 1: NEVER resurrect an OFF_DUTY caddy =====
    -- If a driver ended their shift but the native background service is still
    -- sending pings, silently discard them and auto-revoke the orphaned session.
    SELECT status INTO v_caddy_status FROM public.caddies WHERE id = v_caddy_id;

    IF v_caddy_status IS DISTINCT FROM 'ON_DUTY' THEN
        -- Auto-cleanup: revoke this orphaned session so future pings fail fast
        DELETE FROM public.telemetry_sessions WHERE token_hash = v_token_hash;
        RETURN;
    END IF;

    -- ===== FIX 2: Campus geofence enforcement at DB level =====
    -- Reject coordinates outside the wider campus bounds to prevent ghost
    -- markers from appearing when a driver goes home with the app still open.
    -- Bounds match CAMPUS_BOUNDS from campusData.ts: [[28.5050, 77.5550], [28.5450, 77.5950]]
    IF latitude < 28.5050 OR latitude > 28.5450 OR longitude < 77.5550 OR longitude > 77.5950 THEN
        RETURN;
    END IF;

    -- ===== FIX 3: Do NOT set status in the update =====
    -- The original bug: SET status = 'ON_DUTY' resurrected OFF_DUTY caddies.
    -- Now we only update location data, and only for ON_DUTY caddies.
    UPDATE public.caddies
    SET
        current_lat = latitude,
        current_lng = longitude,
        speed = update_caddy_telemetry.speed,
        heading = update_caddy_telemetry.bearing,
        last_ping = now()
    WHERE id = v_caddy_id AND status = 'ON_DUTY';
END;
$$;

-- 2. Add failsafe revocation by caddy_id
--    Used by End Duty, Driver Logout, and Admin Force End Shift to guarantee
--    ALL sessions for a caddy are terminated, even if the raw token was lost.
CREATE OR REPLACE FUNCTION public.revoke_telemetry_session_by_caddy(
    p_caddy_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
    DELETE FROM public.telemetry_sessions WHERE caddy_id = p_caddy_id;
END;
$$;

-- 3. Cleanup: reset any currently stuck caddies whose last_ping is older than
--    30 minutes. These are zombie entries from before this fix was applied.
UPDATE public.caddies
SET
    status = 'OFF_DUTY',
    current_lat = NULL,
    current_lng = NULL,
    speed = 0,
    heading = 0
WHERE
    status = 'ON_DUTY'
    AND last_ping < (now() - interval '30 minutes');

-- 4. Purge all expired or orphaned telemetry sessions
DELETE FROM public.telemetry_sessions
WHERE expires_at < now()
   OR caddy_id IN (SELECT id FROM public.caddies WHERE status != 'ON_DUTY');
