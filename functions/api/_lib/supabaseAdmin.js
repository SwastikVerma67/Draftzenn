/**
 * Draftzenn API — Supabase admin client (service role).
 * ---------------------------------------------------------------------------
 * SERVER-SIDE ONLY. Uses the service_role key, which bypasses Row Level
 * Security entirely. This module must never be imported by anything that
 * ships to the browser — only by files under /functions/api.
 *
 * @supabase/supabase-js v2 is fetch-based and runs fine on Cloudflare's
 * Workers runtime. Unlike the old singleton-per-process Node version, a new
 * client is created per request here — Workers isolate each request rather
 * than keeping a long-lived Node process, so there's no benefit (and a
 * correctness risk) to caching this across requests/env values.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export function getAdminClient(env) {
  return createClient(config.SUPABASE_URL(env), config.SUPABASE_SERVICE_ROLE_KEY(env), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
