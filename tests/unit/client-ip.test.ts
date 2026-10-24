import { describe, expect, it } from 'vitest';
import { UNKNOWN_IP, clientIpFrom, normalizeIp } from '@/lib/client-ip';

const headers = (h: Record<string, string>) => (name: string) => h[name.toLowerCase()] ?? null;

describe('clientIpFrom', () => {
  it('ignores every header unless TRUST_PROXY is on (anyone can forge them)', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '203.0.113.9' }), false)).toBe(UNKNOWN_IP);
  });

  it('takes the first X-Forwarded-For entry when the proxy is trusted', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.9' }), true)).toBe('203.0.113.9');
    expect(clientIpFrom(headers({ 'x-forwarded-for': ' 203.0.113.9 , 10.0.0.1, 10.0.0.2' }), true)).toBe('203.0.113.9');
  });

  it('falls back to X-Real-IP, then to unknown', () => {
    expect(clientIpFrom(headers({ 'x-real-ip': '198.51.100.4' }), true)).toBe('198.51.100.4');
    expect(clientIpFrom(headers({}), true)).toBe(UNKNOWN_IP);
    expect(clientIpFrom(headers({ 'x-forwarded-for': 'not an ip' }), true)).toBe(UNKNOWN_IP);
    expect(clientIpFrom(headers({ 'x-forwarded-for': '<script>' , 'x-real-ip': '198.51.100.4' }), true)).toBe('198.51.100.4');
  });
});

describe('normalizeIp', () => {
  it('keeps IPv4, strips a port', () => {
    expect(normalizeIp('203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIp('203.0.113.9:51234')).toBe('203.0.113.9');
  });

  it('rejects things that are not addresses', () => {
    for (const bad of ['', ' ', 'abc', '999.1.1.1', '1.2.3', '1.2.3.4.5', 'a'.repeat(100), '::g', ':::', '1::2::3', '12345::1']) {
      expect(normalizeIp(bad), bad).toBeNull();
    }
  });

  it('turns an IPv4-mapped IPv6 address into the IPv4 one', () => {
    expect(normalizeIp('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIp('::ffff:cb00:7109')).toBe('203.0.113.9');
  });

  it('reduces IPv6 to its /64 so rotating the lower half does not mint new buckets', () => {
    const a = normalizeIp('2001:db8:aaaa:bbbb:1:2:3:4');
    const b = normalizeIp('2001:0DB8:AAAA:BBBB:ffff:ffff:ffff:ffff');
    const c = normalizeIp('2001:db8:aaaa:bbbb::1');
    expect(a).toBe('2001:db8:aaaa:bbbb::/64');
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(normalizeIp('2001:db8:aaaa:cccc::1')).not.toBe(a);
    expect(normalizeIp('[2001:db8:aaaa:bbbb::1]:443')).toBe(a);
    expect(normalizeIp('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(normalizeIp('::1')).toBe('0:0:0:0::/64');
  });
});
