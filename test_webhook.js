const { createClient } = require('@supabase/supabase-js');


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testNativePush() {
  console.log('Fetching active caddy assignment...');
  const { data: caddies } = await supabase.from('caddies').select('*').not('current_driver_id', 'is', null);
  if (!caddies || caddies.length === 0) {
    console.log('No caddies have drivers assigned! Cannot test.');
    return;
  }
  const caddy = caddies[0];
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', caddy.current_driver_id).single();
  
  console.log(`Using Driver: ${profile.phone}, Caddy: ${caddy.id}`);

  console.log('1. Creating telemetry session...');
  const { data: token, error: sessionErr } = await supabase.rpc('create_telemetry_session', {
    p_phone: profile.phone,
    p_pin: profile.pin,
    p_caddy_id: caddy.id
  });
  
  if (sessionErr) {
    console.log('Failed to create session:', sessionErr);
    return;
  }
  
  console.log('Token received:', token);

  console.log('2. Simulating Capgo POST payload...');
  const payload = {
    latitude: 28.525,
    longitude: 77.575,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    simulated: false,
    speed: 5.5,
    bearing: 45.0,
    time: Date.now(),
    source: 'native'
  };

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/update_caddy_telemetry`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'X-Telemetry-Token': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  console.log('Response Status:', response.status);
  const text = await response.text();
  console.log('Response Body:', text);
}

testNativePush();
