const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://jyufwzwcjzhbdbcmnihc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dWZ3endjanpoYmRiY21uaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4OTEyNTYsImV4cCI6MjEwMjQ2NzI1Nn0.S14CDLPcecvUsJeIl2L47S932lP2v4vlGkjj0GKMLRs'
);

const waypoints = [
  [28.53318, 77.57664], // Gate 1
  [28.52817, 77.57449], // G Block
  [28.52557, 77.57167], // Inner Gate
  [28.52420, 77.57310], // Chilika 1B
  [28.52350, 77.57060], // Cluster 4
  [28.52250, 77.57030], // Cluster 5
  [28.52147, 77.57283], // Cluster 6
  [28.52817, 77.57449], // G Block
  [28.53318, 77.57664], // Gate 1
];

// Generate smooth interpolated steps
const steps = [];
for (let i = 0; i < waypoints.length - 1; i++) {
  const p1 = waypoints[i];
  const p2 = waypoints[i + 1];
  const numDivisions = 12;
  for (let step = 0; step < numDivisions; step++) {
    const fraction = step / numDivisions;
    const lat = p1[0] + (p2[0] - p1[0]) * fraction;
    const lng = p1[1] + (p2[1] - p1[1]) * fraction;
    
    // Calculate heading angle
    const dLat = p2[0] - p1[0];
    const dLng = p2[1] - p1[1];
    let heading = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
    steps.push({ lat, lng, heading: Math.round(heading) });
  }
}

console.log(`Generated ${steps.length} simulation steps along Gate 1 loop.`);

let currentIndex = 0;

async function updateDriverGps() {
  const pt = steps[currentIndex];
  currentIndex = (currentIndex + 1) % steps.length;

  const { error } = await supabase
    .from('caddies')
    .update({
      current_lat: pt.lat,
      current_lng: pt.lng,
      heading: pt.heading,
      speed: 15.5 + Math.sin(currentIndex) * 2.5,
      status: 'ON_DUTY',
      route_id: 'route-gate1',
      current_driver_id: '48dd1b6b-402a-4ca7-8ed9-eee286528f96', // Pappan
      last_ping: new Date().toISOString()
    })
    .eq('id', 'caddy-1788978779043');

  if (error) {
    console.error('Error updating driver location:', error);
  } else {
    process.stdout.write(`[Driver Ping] Lat: ${pt.lat.toFixed(5)}, Lng: ${pt.lng.toFixed(5)}, Hdg: ${pt.heading}°\r`);
  }
}

// Initial activate
updateDriverGps().then(() => {
  setInterval(updateDriverGps, 1800);
});
