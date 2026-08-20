const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://jyufwzwcjzhbdbcmnihc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dWZ3endjanpoYmRiY21uaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4OTEyNTYsImV4cCI6MjEwMjQ2NzI1Nn0.S14CDLPcecvUsJeIl2L47S932lP2v4vlGkjj0GKMLRs'
);

async function checkPublication() {
  const { data, error } = await supabase.rpc('query_publications'); // this might not exist
  console.log('RPC check:', data, error);
  
  const res = await supabase.from('caddies').select('*');
  console.log('Select check:', res.data?.length, res.error);
}

checkPublication();
