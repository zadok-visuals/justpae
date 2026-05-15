import { supabase } from './src/integrations/supabase/client';

async function verifyUser() {
  const userId = '28789b38-04a9-48c1-9f85-6ca16c3f6308';
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('User not found:', error);
  } else {
    console.log('User found:', data);
  }
}

// I can't run this directly, but I can use it as a reference or try to run it via a command if node is available
