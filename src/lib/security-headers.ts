/**
 * Response headers for every route (next.config.ts `headers()`). Pure, so the policy is unit-tested.
 *
 * Content-Security-Policy trade-off, on purpose: `script-src` and `style-src` keep `'unsafe-inline'`.
 * Next 15 renders inline bootstrap scripts (`self.__next_f.push(...)`, the RSC payload) into every HTML
 * response, and Tailwind/React emit inline `style` attributes. Dropping `'unsafe-inline'` for scripts means
 * a per-request nonce, which needs a middleware that rewrites the header on every request and forces every
 * page to be rendered dynamically (no static landing page, no CDN caching). The app has no XSS sink
 * (no `dangerouslySetInnerHTML`, no user HTML), so the CSP is defence in depth here, and what it buys
 * today is everything that does NOT depend on inline script: no framing (`frame-ancestors`), no plugins
 * (`object-src`), no `<base>` hijack, forms only to ourselves, no third-party scripts, images, fonts,
 * connections or frames (`default-src 'self'`). Revisit with nonces when a page ever renders
 * user-controlled markup.
 *
 * HSTS is NOT sent by the app: it is only meaningful over HTTPS, which the reverse proxy terminates, so it
 * lives in the README's Caddy block.
 */
export interface SecurityHeader {
  key: string;
  value: string;
}

export function contentSecurityPolicy({ dev = false }: { dev?: boolean } = {}): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // dev: React Refresh / Turbopack evaluate code strings
    'script-src': ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    // dev: the HMR websocket
    'connect-src': ["'self'", ...(dev ? ['ws:', 'wss:'] : [])],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

export function securityHeaders({ dev = false }: { dev?: boolean } = {}): SecurityHeader[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy({ dev }) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    // older browsers that ignore CSP frame-ancestors
    { key: 'X-Frame-Options', value: 'DENY' },
  ];
}
