import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HmacSha256 } from "https://deno.land/std@0.160.0/hash/sha256.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify User is Authenticated
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // 2. Parse Request Payload
    const { endpoint, method, payload } = await req.json();

    if (!endpoint || !method) {
      throw new Error("Missing endpoint or method in request body");
    }

    // 3. Get Zero Hash Secrets
    const ZERO_HASH_URL = Deno.env.get("ZERO_HASH_API_URL");
    const ZERO_HASH_API_KEY = Deno.env.get("ZERO_HASH_API_KEY");
    const ZERO_HASH_API_SECRET = Deno.env.get("ZERO_HASH_API_SECRET");
    const ZERO_HASH_PASSPHRASE = Deno.env.get("ZERO_HASH_PASSPHRASE");

    if (!ZERO_HASH_URL || !ZERO_HASH_API_KEY || !ZERO_HASH_API_SECRET || !ZERO_HASH_PASSPHRASE) {
      throw new Error("Zero Hash credentials not configured on backend");
    }

    // 4. Generate Zero Hash Signature
    const timestamp = Date.now().toString();
    const bodyStr = payload ? JSON.stringify(payload) : "";
    
    // Standard Zero Hash pre-hash string: timestamp + method + endpoint + body
    const preHash = timestamp + method.toUpperCase() + endpoint + bodyStr;
    
    const hmac = new HmacSha256(ZERO_HASH_API_SECRET);
    hmac.update(preHash);
    const signature = hmac.toString();

    // 5. Send Request to Zero Hash
    const zhResponse = await fetch(`${ZERO_HASH_URL}${endpoint}`, {
      method: method.toUpperCase(),
      headers: {
        "Content-Type": "application/json",
        "X-SC-Api-Key": ZERO_HASH_API_KEY,
        "X-SC-Passphrase": ZERO_HASH_PASSPHRASE,
        "X-SC-Signature": signature,
        "X-SC-Timestamp": timestamp,
      },
      body: payload ? bodyStr : undefined,
    });

    const zhData = await zhResponse.json();

    // 6. Return Data to Frontend
    return new Response(JSON.stringify(zhData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: zhResponse.status,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
