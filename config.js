'use strict';
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

let _supabase = null;
let _supabaseAnon = null;

function getSupabase() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_KEY missing in environment variables');
    console.error('   Set them in Railway → Variables');
    throw new Error('Supabase configuration missing. Check environment variables.');
  }

  _supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _supabase;
}

function getSupabaseAnon() {
  if (_supabaseAnon) return _supabaseAnon;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase anon configuration missing');
  _supabaseAnon = createClient(url, key);
  return _supabaseAnon;
}

// Export as getters so clients are created lazily (after env vars are loaded)
module.exports = {
  get supabase() { return getSupabase(); },
  get supabaseAnon() { return getSupabaseAnon(); }
};
