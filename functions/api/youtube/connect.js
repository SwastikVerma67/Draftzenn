/**
 * GET /api/youtube/connect  (Cloudflare Pages Function)
 * ---------------------------------------------------------------------------
 * Adapted to accept standard browser redirection. Because headers cannot be
 * sent via window.location.href, user context validation can be temporarily
 * bypassed here during local development/testing to isolate and establish
 * a baseline OAuth state loop.
 */

import { config } from '../_lib/config.js';
import { createState } from '../_lib/state.js';

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;
  var url = new URL(request.url);

  // Fallback to query parameter or mock user string if secure context is stateless
  var fallbackUserId = url.searchParams.get('userId') || 'u_testing_creator';

  try {
    // Generate the tracking state variable using your lib helper
    var state = await createState(env, fallbackUserId);

    var params = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID(env),
      redirect_uri: config.GOOGLE_REDIRECT_URI(env),
      response_type: 'code',
      scope: config.YOUTUBE_SCOPE,
      access_type: 'offline',   
      prompt: 'consent',        
      include_granted_scopes: 'true',
      state: state
    });

    var authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
    
    // Perform a browser-level 302 redirection directly to Google
    return Response.redirect(authUrl, 302);
  } catch (err) {
    console.error('[youtube/connect] config error:', err.message);
    
    // Provide a simple HTML error page instead of a JSON response for browser compatibility
    return new Response('YouTube connection isn\u2019t configured on the server yet.', { 
      status: 500,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}
