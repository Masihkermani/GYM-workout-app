import { describe, expect, it } from 'vitest';
import { homeFor, safeNextPath, stripLocalePrefix } from '@/lib/redirects';

describe('stripLocalePrefix', () => {
  it('removes the locale', () => {
    expect(stripLocalePrefix('/fa/app/book')).toBe('/app/book');
    expect(stripLocalePrefix('/en')).toBe('/');
    expect(stripLocalePrefix('/en?x=1')).toBe('/?x=1');
    expect(stripLocalePrefix('/app')).toBe('/app');
    expect(stripLocalePrefix('/fax/app')).toBe('/fax/app');
  });
});

describe('safeNextPath', () => {
  it('falls back to the role home', () => {
    expect(safeNextPath(null, 'fa', 'CLIENT')).toBe('/fa/app');
    expect(safeNextPath(undefined, 'en', 'COACH')).toBe('/en/coach');
    expect(homeFor('COACH', 'fa')).toBe('/fa/coach');
  });
  it('keeps same-area paths and re-prefixes with the current locale', () => {
    expect(safeNextPath('/fa/app/book?week=2', 'en', 'CLIENT')).toBe('/en/app/book?week=2');
    expect(safeNextPath('/app/progress', 'fa', 'CLIENT')).toBe('/fa/app/progress');
    expect(safeNextPath('/en/coach/clients/abc', 'fa', 'COACH')).toBe('/fa/coach/clients/abc');
  });
  it('lets the coach open client pages but never the reverse', () => {
    expect(safeNextPath('/fa/app/book', 'fa', 'COACH')).toBe('/fa/app/book');
    expect(safeNextPath('/fa/coach', 'fa', 'CLIENT')).toBe('/fa/app');
  });
  it('rejects open-redirect attempts', () => {
    for (const evil of [
      'https://evil.example/app',
      '//evil.example/app',
      '/\\evil.example',
      '/fa/app/../../evil',
      'javascript:alert(1)',
      '/javascript:alert(1)',
      '/fa/login',
      '/fa/appendix',
      '/fa/app\u0000',
      'app',
      '',
    ]) {
      const result = safeNextPath(evil, 'fa', 'CLIENT');
      expect(result, evil).toMatch(/^\/fa\/app(\/|$)/);
      expect(result, evil).not.toContain('evil.example');
    }
  });
});
