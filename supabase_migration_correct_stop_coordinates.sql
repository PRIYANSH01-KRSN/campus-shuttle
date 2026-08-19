-- Apply once in the Supabase SQL Editor. These values keep the existing stop
-- names and IDs while replacing the original placeholder coordinates.
UPDATE public.campus_stations AS station
SET lat = source.lat, lng = source.lng
FROM (VALUES
  ('a1000001-0000-0000-0000-000000000001'::uuid, 28.5212::double precision, 77.5711::double precision),
  ('a1000001-0000-0000-0000-000000000002'::uuid, 28.5225::double precision, 77.5703::double precision),
  ('a1000001-0000-0000-0000-000000000003'::uuid, 28.5235::double precision, 77.5706::double precision),
  ('a1000001-0000-0000-0000-000000000004'::uuid, 28.5248::double precision, 77.5709::double precision),
  ('a1000001-0000-0000-0000-000000000005'::uuid, 28.5242::double precision, 77.5731::double precision),
  ('a1000001-0000-0000-0000-000000000006'::uuid, 28.5234::double precision, 77.5746::double precision),

  ('a2000001-0000-0000-0000-000000000010'::uuid, 28.5298::double precision, 77.5772::double precision),
  ('a2000001-0000-0000-0000-000000000011'::uuid, 28.5225::double precision, 77.5703::double precision),
  ('a2000001-0000-0000-0000-000000000012'::uuid, 28.5235::double precision, 77.5706::double precision),
  ('a2000001-0000-0000-0000-000000000013'::uuid, 28.5248::double precision, 77.5709::double precision),
  ('a2000001-0000-0000-0000-000000000014'::uuid, 28.5242::double precision, 77.5731::double precision),
  ('a2000001-0000-0000-0000-000000000015'::uuid, 28.5254::double precision, 77.5753::double precision),
  ('a2000001-0000-0000-0000-000000000016'::uuid, 28.5261::double precision, 77.5757::double precision),
  ('a2000001-0000-0000-0000-000000000017'::uuid, 28.5266::double precision, 77.5763::double precision),
  ('a2000001-0000-0000-0000-000000000018'::uuid, 28.5269::double precision, 77.5771::double precision),
  ('a2000001-0000-0000-0000-000000000019'::uuid, 28.5298::double precision, 77.5791::double precision)
) AS source(id, lat, lng)
WHERE station.id = source.id;

UPDATE public.route_paths
SET coordinates = CASE route_id
  WHEN 'route-gate1' THEN '[[28.5212,77.5711],[28.5225,77.5703],[28.5235,77.5706],[28.5248,77.5709],[28.5242,77.5731],[28.5234,77.5746],[28.5212,77.5711]]'::jsonb
  WHEN 'route-gate2' THEN '[[28.5298,77.5772],[28.5225,77.5703],[28.5235,77.5706],[28.5248,77.5709],[28.5242,77.5731],[28.5254,77.5753],[28.5261,77.5757],[28.5266,77.5763],[28.5269,77.5771],[28.5298,77.5791],[28.5298,77.5772]]'::jsonb
  ELSE coordinates
END
WHERE route_id IN ('route-gate1', 'route-gate2');
