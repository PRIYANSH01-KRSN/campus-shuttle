-- ============================================================================
-- SHUTTLE TRACKING SYSTEM - DATABASE SCHEMA & SECURITY POLICIES
-- ============================================================================
-- This script sets up the database schema, Row-Level Security (RLS) policies,
-- automatic triggers, and seed data for the Shuttle Tracking System.
-- Designed for Shiv Nadar University (SNU) Greater Noida Campus.
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. ENUMS & USERS
-- ----------------------------------------------------------------------------

-- Create user role enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('admin', 'driver', 'student');
  END IF;
END $$;

-- Create profiles table linked to Supabase Auth users
CREATE TABLE IF NOT EXISTS public.profiles (
  -- Driver terminals use a phone/PIN identity; this is not necessarily an
  -- auth.users UUID. Keeping it independent makes onboarding persistent.
  id uuid PRIMARY KEY,
  role public.user_role DEFAULT 'student'::public.user_role NOT NULL,
  full_name text,
  phone text,
  pin text, -- Driver custom 4-digit verification PIN
  created_at timestamptz DEFAULT now() NOT NULL
);

-- ----------------------------------------------------------------------------
-- 2. ROUTES & STATIONS
-- ----------------------------------------------------------------------------

-- Create routes table
CREATE TABLE IF NOT EXISTS public.routes (
  id text PRIMARY KEY,
  name text NOT NULL,
  color text DEFAULT '#2563EB' NOT NULL,
  is_active boolean DEFAULT true NOT NULL
);

-- Create campus stations table
CREATE TABLE IF NOT EXISTS public.campus_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id text REFERENCES public.routes(id) ON DELETE CASCADE,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  stop_order integer NOT NULL,
  waiting_count integer DEFAULT 0 NOT NULL
);

-- Create route paths table for geospatial path coordinates
CREATE TABLE IF NOT EXISTS public.route_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id text REFERENCES public.routes(id) ON DELETE CASCADE UNIQUE,
  coordinates jsonb NOT NULL -- Array of [lat, lng] coordinates
);

-- ----------------------------------------------------------------------------
-- 3. CADDIES & TRACKING
-- ----------------------------------------------------------------------------

-- Create caddies table
CREATE TABLE IF NOT EXISTS public.caddies (
  id text PRIMARY KEY, -- 'caddy-1', 'caddy-2', 'caddy-3', 'caddy-4'
  name text NOT NULL,
  route_id text REFERENCES public.routes(id) ON DELETE SET NULL,
  current_driver_id uuid,
  status text CHECK (status IN ('OFF_DUTY', 'ON_DUTY', 'ON_BREAK', 'IN_MAINTENANCE')) DEFAULT 'OFF_DUTY' NOT NULL,
  current_lat double precision,
  current_lng double precision,
  speed double precision DEFAULT 0 NOT NULL,
  heading double precision DEFAULT 0 NOT NULL,
  last_ping timestamptz DEFAULT now() NOT NULL
);

-- ----------------------------------------------------------------------------
-- 4. SECURE DEMAND FLAGS
-- ----------------------------------------------------------------------------

-- Create wait flags table
CREATE TABLE IF NOT EXISTS public.wait_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid REFERENCES public.campus_stations(id) ON DELETE CASCADE NOT NULL,
  student_id uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz DEFAULT (now() + interval '10 minutes') NOT NULL
);

-- ----------------------------------------------------------------------------
-- 5. ADS / SPONSORSHIP CMS
-- ----------------------------------------------------------------------------

-- Create ad banners table
CREATE TABLE IF NOT EXISTS public.ad_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  sponsor_name text NOT NULL,
  image_url text NOT NULL,
  target_url text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  impressions integer DEFAULT 0 NOT NULL,
  clicks integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- ----------------------------------------------------------------------------
-- AUTOMATED TRIGGERS & BUSINESS LOGIC
-- ----------------------------------------------------------------------------

-- A. PROFILE AUTO-SYNC FROM AUTH
-- Automatically creates a profile row when a new user signs up in Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
AS $$
DECLARE
  default_role public.user_role;
BEGIN
  -- Extract role from metadata, defaulting to 'student'
  default_role := COALESCE(
    (new.raw_user_meta_data->>'role')::public.user_role, 
    'student'::public.user_role
  );

  INSERT INTO public.profiles (id, role, full_name, phone, pin)
  VALUES (
    new.id,
    default_role,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    COALESCE(new.raw_user_meta_data->>'pin', '')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auth sync
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- B. WAITING COUNT SYNCHRONIZER
-- Automatically updates campus_stations.waiting_count based on wait_flags additions/removals
CREATE OR REPLACE FUNCTION public.handle_wait_flag_change()
RETURNS trigger
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.campus_stations
    SET waiting_count = waiting_count + 1
    WHERE id = new.station_id;
    RETURN new;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.campus_stations
    SET waiting_count = GREATEST(0, waiting_count - 1)
    WHERE id = old.station_id;
    RETURN old;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (old.station_id <> new.station_id) THEN
      UPDATE public.campus_stations
      SET waiting_count = GREATEST(0, waiting_count - 1)
      WHERE id = old.station_id;
      UPDATE public.campus_stations
      SET waiting_count = waiting_count + 1
      WHERE id = new.station_id;
    END IF;
    RETURN new;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for waiting counts
CREATE OR REPLACE TRIGGER on_wait_flag_change
  AFTER INSERT OR UPDATE OR DELETE ON public.wait_flags
  FOR EACH ROW EXECUTE FUNCTION public.handle_wait_flag_change();

-- ----------------------------------------------------------------------------
-- SECURITY DEFINER HELPER FUNCTIONS FOR RLS POLICIES
-- ----------------------------------------------------------------------------

-- Helper function to check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
SECURITY DEFINER
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()),
    false
  );
END;
$$ LANGUAGE plpgsql;

-- Helper function to check if the current user is a driver
CREATE OR REPLACE FUNCTION public.is_driver()
RETURNS boolean
SECURITY DEFINER
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT role = 'driver' FROM public.profiles WHERE id = auth.uid()),
    false
  );
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 6. SECURITY POLICIES (ROW-LEVEL SECURITY)
-- ----------------------------------------------------------------------------

-- Enable Row-Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caddies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wait_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_banners ENABLE ROW LEVEL SECURITY;

-- === A. PROFILES POLICIES ===
DROP POLICY IF EXISTS "Allow public read access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow admin full control on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public full control on profiles" ON public.profiles;
CREATE POLICY "Allow public full control on profiles" ON public.profiles
  FOR ALL TO public USING (true) WITH CHECK (true);

-- === B. ROUTES POLICIES ===
DROP POLICY IF EXISTS "Allow public read access to routes" ON public.routes;
DROP POLICY IF EXISTS "Allow admin full control on routes" ON public.routes;
DROP POLICY IF EXISTS "Allow public full control on routes" ON public.routes;
CREATE POLICY "Allow public full control on routes" ON public.routes
  FOR ALL TO public USING (true) WITH CHECK (true);

-- === C. CAMPUS STATIONS POLICIES ===
DROP POLICY IF EXISTS "Allow public read access to campus_stations" ON public.campus_stations;
DROP POLICY IF EXISTS "Allow admin full control on campus_stations" ON public.campus_stations;
DROP POLICY IF EXISTS "Allow public full control on campus_stations" ON public.campus_stations;
CREATE POLICY "Allow public full control on campus_stations" ON public.campus_stations
  FOR ALL TO public USING (true) WITH CHECK (true);

-- === D. ROUTE PATHS POLICIES ===
DROP POLICY IF EXISTS "Allow public read access to route_paths" ON public.route_paths;
DROP POLICY IF EXISTS "Allow admin full control on route_paths" ON public.route_paths;
DROP POLICY IF EXISTS "Allow public full control on route_paths" ON public.route_paths;
CREATE POLICY "Allow public full control on route_paths" ON public.route_paths
  FOR ALL TO public USING (true) WITH CHECK (true);

-- === E. CADDIES POLICIES ===
DROP POLICY IF EXISTS "Allow public read access to caddies" ON public.caddies;
DROP POLICY IF EXISTS "Allow admin full control on caddies" ON public.caddies;
DROP POLICY IF EXISTS "Allow drivers to update their assigned caddy" ON public.caddies;
DROP POLICY IF EXISTS "Allow public full control on caddies" ON public.caddies;
CREATE POLICY "Allow public full control on caddies" ON public.caddies
  FOR ALL TO public USING (true) WITH CHECK (true);

-- === F. WAIT FLAGS POLICIES ===
DROP POLICY IF EXISTS "Allow public read access to wait_flags" ON public.wait_flags;
DROP POLICY IF EXISTS "Allow public to insert wait flags" ON public.wait_flags;
DROP POLICY IF EXISTS "Allow public full control on wait_flags" ON public.wait_flags;
CREATE POLICY "Allow public full control on wait_flags" ON public.wait_flags
  FOR ALL TO public USING (true) WITH CHECK (true);

-- === G. AD BANNERS POLICIES ===
DROP POLICY IF EXISTS "Allow public read access to ad_banners" ON public.ad_banners;
DROP POLICY IF EXISTS "Allow admin full control on ad_banners" ON public.ad_banners;
DROP POLICY IF EXISTS "Allow public full control on ad_banners" ON public.ad_banners;
CREATE POLICY "Allow public full control on ad_banners" ON public.ad_banners
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- SEED DATA (Shiv Nadar University - Greater Noida Campus)
-- Campus Center: 28.5265, 77.5755
-- Geofence Bounds: SW [28.518, 77.568] — NE [28.535, 77.585]
-- ----------------------------------------------------------------------------

-- Seed Routes (Gate 1 Loop = Blue, Gate 2 Loop = Emerald)
INSERT INTO public.routes (id, name, color, is_active) VALUES
  ('route-gate1', 'Gate 1 Loop', '#2563EB', true),   -- Vibrant Blue
  ('route-gate2', 'Gate 2 Loop', '#10B981', true)     -- Emerald Green
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name, 
  color = EXCLUDED.color, 
  is_active = EXCLUDED.is_active;

-- Seed Campus Stations
-- Gate 1 Route (6 stops): Gate 1 → Cluster 5 → Cluster 4 → Gir Hostel → Chilika Hostel 1B → G Block
-- Gate 2 Route (10 stops): Gate 2 → Cluster 5 → Cluster 4 → Gir Hostel → Chilika Hostel 1B → D Block → C Block → B Block → A Block → Towers
INSERT INTO public.campus_stations (id, route_id, name, lat, lng, stop_order, waiting_count) VALUES
  -- Gate 1 Loop stops
  ('a1000001-0000-0000-0000-000000000001', 'route-gate1', 'Gate 1',            28.5225, 77.5725, 1, 0),
  ('a1000001-0000-0000-0000-000000000002', 'route-gate1', 'Cluster 5',         28.5248, 77.5742, 2, 0),
  ('a1000001-0000-0000-0000-000000000003', 'route-gate1', 'Cluster 4',         28.5258, 77.5755, 3, 0),
  ('a1000001-0000-0000-0000-000000000004', 'route-gate1', 'Gir Hostel',        28.5270, 77.5768, 4, 0),
  ('a1000001-0000-0000-0000-000000000005', 'route-gate1', 'Chilika Hostel 1B', 28.5278, 77.5778, 5, 0),
  ('a1000001-0000-0000-0000-000000000006', 'route-gate1', 'G Block',           28.5238, 77.5718, 6, 0),

  -- Gate 2 Loop stops
  ('a2000001-0000-0000-0000-000000000001', 'route-gate2', 'Gate 2',            28.5312, 77.5792, 1, 0),
  ('a2000001-0000-0000-0000-000000000002', 'route-gate2', 'Cluster 5',         28.5248, 77.5742, 2, 0),
  ('a2000001-0000-0000-0000-000000000003', 'route-gate2', 'Cluster 4',         28.5258, 77.5755, 3, 0),
  ('a2000001-0000-0000-0000-000000000004', 'route-gate2', 'Gir Hostel',        28.5270, 77.5768, 4, 0),
  ('a2000001-0000-0000-0000-000000000005', 'route-gate2', 'Chilika Hostel 1B', 28.5278, 77.5778, 5, 0),
  ('a2000001-0000-0000-0000-000000000006', 'route-gate2', 'D Block',           28.5283, 77.5765, 6, 0),
  ('a2000001-0000-0000-0000-000000000007', 'route-gate2', 'C Block',           28.5289, 77.5770, 7, 0),
  ('a2000001-0000-0000-0000-000000000008', 'route-gate2', 'B Block',           28.5294, 77.5776, 8, 0),
  ('a2000001-0000-0000-0000-000000000009', 'route-gate2', 'A Block',           28.526944, 77.577111, 9, 0),
  ('a2000001-0000-0000-0000-000000000010', 'route-gate2', 'Towers',            28.5306, 77.5788, 10, 0)
ON CONFLICT (id) DO UPDATE SET 
  route_id = EXCLUDED.route_id,
  name = EXCLUDED.name,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  stop_order = EXCLUDED.stop_order;

-- Seed Route Paths (detailed polyline coordinates tracing campus roads)
INSERT INTO public.route_paths (id, route_id, coordinates) VALUES
  (
    'f1000001-0000-0000-0000-000000000001', 
    'route-gate1', 
    '[[28.5225,77.5725],[28.5228,77.5727],[28.5232,77.5730],[28.5236,77.5733],[28.5240,77.5736],[28.5244,77.5739],[28.5248,77.5742],[28.5250,77.5745],[28.5253,77.5749],[28.5255,77.5752],[28.5258,77.5755],[28.5260,77.5758],[28.5263,77.5761],[28.5266,77.5764],[28.5270,77.5768],[28.5272,77.5771],[28.5275,77.5774],[28.5278,77.5778],[28.5275,77.5775],[28.5270,77.5768],[28.5265,77.5758],[28.5258,77.5748],[28.5252,77.5740],[28.5246,77.5732],[28.5242,77.5725],[28.5238,77.5718],[28.5236,77.5719],[28.5232,77.5721],[28.5228,77.5723],[28.5225,77.5725]]'::jsonb
  ),
  (
    'f2000001-0000-0000-0000-000000000001', 
    'route-gate2', 
    '[[28.5312,77.5792],[28.5308,77.5788],[28.5303,77.5783],[28.5298,77.5778],[28.5292,77.5772],[28.5285,77.5764],[28.5278,77.5756],[28.5270,77.5750],[28.5262,77.5745],[28.5255,77.5742],[28.5248,77.5742],[28.5250,77.5745],[28.5253,77.5749],[28.5255,77.5752],[28.5258,77.5755],[28.5260,77.5758],[28.5263,77.5761],[28.5266,77.5764],[28.5270,77.5768],[28.5272,77.5771],[28.5275,77.5774],[28.5278,77.5778],[28.5280,77.5774],[28.5281,77.5770],[28.5283,77.5765],[28.5285,77.5766],[28.5287,77.5768],[28.5289,77.5770],[28.5291,77.5772],[28.5292,77.5774],[28.5294,77.5776],[28.5296,77.5778],[28.5297,77.5780],[28.5299,77.5782],[28.5301,77.5784],[28.5303,77.5786],[28.5306,77.5788],[28.5308,77.5789],[28.5310,77.5790],[28.5312,77.5792]]'::jsonb
  )
ON CONFLICT (route_id) DO UPDATE SET 
  coordinates = EXCLUDED.coordinates;

-- Seed Caddies (2 units, both starting OFF_DUTY — live-only enforcement)
-- Caddies only appear as active when a driver starts duty via the Driver App
INSERT INTO public.caddies (id, name, route_id, status, current_lat, current_lng, speed, heading, last_ping) VALUES
  ('caddy-1', 'Caddy 1', 'route-gate1', 'OFF_DUTY', NULL, NULL, 0.0, 0.0, now()),
  ('caddy-2', 'Caddy 2', 'route-gate2', 'OFF_DUTY', NULL, NULL, 0.0, 0.0, now())
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  route_id = EXCLUDED.route_id,
  status = EXCLUDED.status,
  current_lat = EXCLUDED.current_lat,
  current_lng = EXCLUDED.current_lng,
  speed = EXCLUDED.speed,
  heading = EXCLUDED.heading,
  last_ping = EXCLUDED.last_ping;

-- Seed Ad Banners
INSERT INTO public.ad_banners (id, title, sponsor_name, image_url, target_url, is_active, impressions, clicks) VALUES
  ('d15e5aeb-0f6a-7fa0-be16-22456789ab01', 'SNU TechFest 2026', 'Google Cloud', 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800', 'https://snu.edu.in/techfest', true, 1204, 85),
  ('d15e5aeb-0f6a-7fa0-be16-22456789ab02', 'Monsoon Cafe Delights', 'Campus Bistro', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800', 'https://snu.edu.in/bistro', true, 942, 112),
  ('d15e5aeb-0f6a-7fa0-be16-22456789ab03', 'Student Wellness Services', 'Fortis Clinic', 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800', 'https://snu.edu.in/wellness', false, 0, 0)
ON CONFLICT (id) DO UPDATE SET 
  title = EXCLUDED.title,
  sponsor_name = EXCLUDED.sponsor_name,
  image_url = EXCLUDED.image_url,
  target_url = EXCLUDED.target_url,
  is_active = EXCLUDED.is_active,
  impressions = EXCLUDED.impressions,
  clicks = EXCLUDED.clicks;
