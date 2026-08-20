-- Enable pgcrypto for SHA-256 hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Create the telemetry_sessions table
CREATE TABLE IF NOT EXISTS public.telemetry_sessions (
    token_hash TEXT PRIMARY KEY,
    driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    caddy_id TEXT REFERENCES public.caddies(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

-- 2. Hardened RLS Security: Block ALL direct client access
ALTER TABLE public.telemetry_sessions ENABLE ROW LEVEL SECURITY;
-- No policies created enforces default-deny for all operations.

-- 3. Index for fast revocation/cleanup
CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_driver ON public.telemetry_sessions(driver_id);

-- =======================================================================================
-- RPC: CREATE SESSION
-- =======================================================================================
CREATE OR REPLACE FUNCTION public.create_telemetry_session(
    p_phone TEXT,
    p_pin TEXT,
    p_caddy_id TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_driver_id UUID;
    v_raw_token TEXT;
    v_token_hash TEXT;
BEGIN
    -- Authenticate driver
    SELECT id INTO v_driver_id FROM public.profiles WHERE phone = p_phone AND pin = p_pin;
    
    IF v_driver_id IS NULL THEN
        -- Limitation: No built-in rate limiting here. A proper implementation would use 
        -- a rate-limit table or external system (like Redis/Fail2Ban) to prevent brute force.
        RAISE EXCEPTION 'Invalid phone or PIN';
    END IF;

    -- Verify vehicle assignment
    IF NOT EXISTS (
        SELECT 1 FROM public.caddies WHERE id = p_caddy_id AND current_driver_id = v_driver_id
    ) THEN
        RAISE EXCEPTION 'Driver is not assigned to this caddy';
    END IF;

    -- Concurrency: Delete all old active sessions for this driver so Session A dies if Session B is created.
    DELETE FROM public.telemetry_sessions WHERE driver_id = v_driver_id;

    -- Generate UUIDv4 raw token & hash it (SHA-256)
    v_raw_token := gen_random_uuid()::text;
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    -- Persist ONLY the hash
    INSERT INTO public.telemetry_sessions (token_hash, driver_id, caddy_id, expires_at)
    VALUES (v_token_hash, v_driver_id, p_caddy_id, now() + interval '12 hours');

    RETURN v_raw_token;
END;
$$;

-- =======================================================================================
-- RPC: INGEST TELEMETRY (Target for Native Webhook)
-- =======================================================================================
CREATE OR REPLACE FUNCTION public.update_caddy_telemetry(
    latitude FLOAT,
    longitude FLOAT,
    accuracy FLOAT DEFAULT NULL,
    speed FLOAT DEFAULT NULL,
    heading FLOAT DEFAULT NULL,
    "time" BIGINT DEFAULT NULL,
    source TEXT DEFAULT NULL,
    simulated BOOLEAN DEFAULT FALSE,
    altitude FLOAT DEFAULT NULL,
    "altitudeAccuracy" FLOAT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_headers JSON;
    v_auth_header TEXT;
    v_raw_token TEXT;
    v_token_hash TEXT;
    v_caddy_id TEXT;
BEGIN
    -- Extract Bearer token natively from HTTP headers
    -- Note: PostgREST exposes headers via current_setting
    BEGIN
        v_headers := current_setting('request.headers', true)::json;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Unable to read headers';
    END;
    
    v_auth_header := v_headers->>'authorization';

    IF v_auth_header IS NULL OR NOT v_auth_header ILIKE 'Bearer %' THEN
        RAISE EXCEPTION 'Missing or invalid Authorization header';
    END IF;

    -- Hash incoming token
    v_raw_token := substring(v_auth_header from 8);
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    -- Server-Authoritative Target (No client caddy_id parameter)
    SELECT caddy_id INTO v_caddy_id
    FROM public.telemetry_sessions
    WHERE token_hash = v_token_hash AND expires_at > now();

    IF v_caddy_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized or expired telemetry token';
    END IF;

    -- Secure scoped update
    UPDATE public.caddies
    SET 
        current_lat = latitude,
        current_lng = longitude,
        speed = update_caddy_telemetry.speed,
        heading = update_caddy_telemetry.heading,
        last_ping = now(), -- Server-authoritative timestamp
        status = 'ON_DUTY'
    WHERE id = v_caddy_id;
END;
$$;

-- =======================================================================================
-- RPC: REVOKE SESSION
-- =======================================================================================
CREATE OR REPLACE FUNCTION public.revoke_telemetry_session(
    p_raw_token TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_token_hash TEXT;
BEGIN
    v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');
    DELETE FROM public.telemetry_sessions WHERE token_hash = v_token_hash;
END;
$$;

-- =======================================================================================
-- EXECUTE PRIVILEGE LOCKDOWN
-- =======================================================================================
REVOKE EXECUTE ON FUNCTION public.create_telemetry_session(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_caddy_telemetry(FLOAT, FLOAT, FLOAT, FLOAT, FLOAT, BIGINT, TEXT, BOOLEAN, FLOAT, FLOAT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_telemetry_session(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_telemetry_session(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_caddy_telemetry(FLOAT, FLOAT, FLOAT, FLOAT, FLOAT, BIGINT, TEXT, BOOLEAN, FLOAT, FLOAT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_telemetry_session(TEXT) TO anon, authenticated;
