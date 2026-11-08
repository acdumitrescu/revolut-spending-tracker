// The UI is self-contained: no external scripts, fonts, images or network calls.
// Inline styles are allowed because React renders style attributes.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Headers for every response, including the static UI and /healthz. */
export function securityHeaders() {
  return (_req, res, next) => {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  };
}

function hostAllowed(req, allowedHosts) {
  const hosts = new Set([...allowedHosts, `127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}`]);
  const host = req.headers.host;
  return typeof host === 'string' && hosts.has(host.toLowerCase());
}

/** DNS-rebinding guard for every route (the API boundary below also applies it). */
export function hostGuard({ allowedHosts = [] } = {}) {
  return (req, res, next) => {
    if (!hostAllowed(req, allowedHosts)) return res.status(403).json({ error: 'Host not allowed' });
    return next();
  };
}

// No forwarded header is used for authorization: these are attacker-controlled
// unless the deployment independently authenticates its reverse proxy.
export function requestBoundary({ allowedHosts = [], allowedOrigins = [], trustedProxy = false } = {}) {
  return (req, res, next) => {
    if (!hostAllowed(req, allowedHosts)) return res.status(403).json({ error: 'Host not allowed' });
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins.includes(origin)) return res.status(403).json({ error: 'Origin not allowed for private sync' });
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return res.status(403).json({ error: 'Cross-site private API request denied' });
    if (trustedProxy && req.headers['x-ssb-client'] !== 'private-ui') return res.status(403).json({ error: 'Private client header required' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!origin || !allowedOrigins.includes(origin))) return res.status(403).json({ error: 'Origin not allowed for private sync writes' });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return next();
  };
}
