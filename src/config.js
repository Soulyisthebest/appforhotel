'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL         = process.env.SUPABASE_URL         || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY    || SUPABASE_SERVICE_KEY;

console.log('[Config] SUPABASE_URL:', SUPABASE_URL ? 'SET' : 'MISSING');
console.log('[Config] SERVICE_KEY:', SUPABASE_SERVICE_KEY ? 'SET' : 'MISSING');

let supabase = null;
let supabaseAnon = null;

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('[Config] Supabase clients created successfully');
} else {
  console.error('[Config] Supabase NOT configured - check Railway Variables');
}

module.exports = { supabase, supabaseAnon };
