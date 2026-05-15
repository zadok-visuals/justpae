const { createClient } = require('@supabase/supabase-client');

const supabaseUrl = 'https://enqakeujjvnibtcoeewn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVucWFrZXVqanZuaWJ0Y29lZXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2ODgwODQsImV4cCI6MjA4NTI2NDA4NH0.NrgxcyaAmBSbWl0KQkFUo90tgVjyniLUxz3rCs8U9jo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser() {
  const userId = '28789b38-04a9-48c1-9f85-6ca16c3f6308';
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', userId);

  if (error) {
    console.error('Error:', error);
  } else if (data && data.length > 0) {
    console.log('User Found:', data[0]);
  } else {
    console.log('User NOT found in profiles table.');
  }
}

checkUser();
