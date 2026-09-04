/**
 * Draftzenn API — tiny Response helpers for Cloudflare Pages Functions.
 * ---------------------------------------------------------------------------
 * Pages Functions use the standard Fetch API's Request/Response, not
 * Vercel/Node's (req, res). These helpers keep the handlers below close to
 * their original shape.
 */

export function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function methodNotAllowed(allow) {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: allow || 'POST' }
  });
}
