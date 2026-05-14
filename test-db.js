import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('profiles').select('email, kyc_phone_number, kyc_address_proof_url, kyc_submitted_at');
  if (error) console.error(error);
  else console.log(data);
}
main();
