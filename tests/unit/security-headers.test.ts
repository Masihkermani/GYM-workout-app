import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from '@/lib/security-headers';

const directives = (csp: string) =>
  Object.fromEntries(csp.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));

describe('contentSecurityPolicy (production)', () => {
  const csp = directives(contentSecurityPolicy());

  it('locks everything to our own origin by default', () => {
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['font-src']).toEqual(["'self'"]);
    expect(csp['connect-src']).toEqual(["'self'"]);
  });

  it('forbids framing, plugins, base-tag and foreign form targets', () => {
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'self'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
  });

  it('allows what Next and Tailwind need and nothing from other hosts', () => {
    expect(csp['script-src']).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp['img-src']).toEqual(["'self'", 'data:', 'blob:']);
    const all = Object.values(csp).flat();
    expect(all.filter((s) => /https?:|\*/.test(s))).toEqual([]);
    expect(all).not.toContain("'unsafe-eval'");
  });
});

describe('contentSecurityPolicy (development)', () => {
  it('adds eval and the HMR websocket, and only there', () => {
    const csp = directives(contentSecurityPolicy({ dev: true }));
    expect(csp['script-src']).toContain("'unsafe-eval'");
    expect(csp['connect-src']).toEqual(expect.arrayContaining(["'self'", 'ws:', 'wss:']));
  });
});

describe('securityHeaders', () => {
  const byKey = Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]));

  it('sends the full set', () => {
    expect(Object.keys(byKey).sort()).toEqual(
      ['Content-Security-Policy', 'Permissions-Policy', 'Referrer-Policy', 'X-Content-Type-Options', 'X-Frame-Options'].sort(),
    );
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['X-Frame-Options']).toBe('DENY');
    expect(byKey['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('leaves HSTS to the proxy', () => {
    expect(byKey['Strict-Transport-Security']).toBeUndefined();
  });
});
