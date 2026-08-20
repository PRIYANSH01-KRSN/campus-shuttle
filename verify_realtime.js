const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://jyufwzwcjzhbdbcmnihc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dWZ3endjanpoYmRiY21uaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4OTEyNTYsImV4cCI6MjEwMjQ2NzI1Nn0.S14CDLPcecvUsJeIl2L47S932lP2v4vlGkjj0GKMLRs'
);

async function verifyRealtime() {
  console.log('1. Connecting to Supabase Realtime channel [caddies-live-changes]...');
  
  let eventReceived = false;

  const channel = supabase
    .channel('caddies-live-changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'caddies' }, (payload) => {
      console.log('\n✅ REALTIME EVENT RECEIVED!');
      console.log('Payload Type:', payload.eventType);
      console.log('Caddy ID:', payload.new.id);
      console.log('New Lat:', payload.new.current_lat);
      console.log('New Lng:', payload.new.current_lng);
      console.log('Last Ping:', payload.new.last_ping);
      eventReceived = true;
    })
    .subscribe(async (status) => {
      console.log('Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('\n2. Triggering database UPDATE to test replication...');
        
        // Update Caddy 1 to trigger realtime
        const { data, error } = await supabase
          .from('caddies')
          .update({ 
            current_lat: 28.5300 + (Math.random() * 0.001), 
            current_lng: 77.5750 + (Math.random() * 0.001),
            last_ping: new Date().toISOString()
          })
          .eq('id', 'caddy-1')
          .select();
          
        if (error) {
          console.error('Failed to update caddy:', error);
          process.exit(1);
        } else {
          console.log(`Successfully updated caddy-1 via REST API. Waiting for realtime echo...`);
        }
      }
    });

  // Timeout after 10 seconds
  setTimeout(() => {
    if (!eventReceived) {
      console.error('\n❌ FAILED: No realtime event received after 10 seconds.');
      console.error('The caddies table is STILL NOT broadcasting events.');
      process.exit(1);
    } else {
      console.log('\n✅ VERIFICATION COMPLETE: Issue 2 is successfully resolved backend-to-frontend.');
      process.exit(0);
    }
  }, 10000);
}

verifyRealtime();
