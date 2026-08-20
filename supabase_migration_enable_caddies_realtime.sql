-- Enable Supabase Realtime for the caddies table
-- This allows the frontend to receive postgres_changes events when a driver's location updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.caddies;
