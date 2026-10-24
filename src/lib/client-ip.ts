/**
 * Which network address a request came from, for rate limiting. Pure (no Next imports) so the rules are
 * unit-tested; `request-ip.ts` feeds it the real headers.
 *
 * A header is only believable when the app sits behind a reverse proxy that sets it. With
 * `TRUST_PROXY=1` the first `X-Forwarded-For` entry (or `X-Real-IP`) is used; the README's Caddy block
 * overwrites both, so a client cannot choose its own value. Without it every header is ignored, because
 * anyone who can reach the app directly could invent a new "address" per request and walk around the
 * limits. The answer is then `UNKNOWN_IP` and callers skip the per-address limits (the per-phone ones
 * still apply).
 */
export const UNKNOWN_IP = 'unknown';

export type HeaderGetter = (name: string) => string | null | undefined;

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** Expand an IPv6 literal to 8 groups of 16 bits, or null when it is not one. */
function expandIpv6(raw: string): number[] | null {
  let text = raw;
  // an IPv4 tail (::ffff:1.2.3.4) is two more groups
  const tail = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail) {
    if (!IPV4.test(tail[2])) return null;
    const [a, b, c, d] = tail[2].split('.').map(Number);
    text = `${tail[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  if (!/^[0-9a-f:]+$/i.test(text) || text.includes(':::')) return null;
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (s: string) => (s === '' ? [] : s.split(':'));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? Number.parseInt(g, 16) : Number.NaN));
  return out.length === 8 && out.every((n) => Number.isInteger(n)) ? out : null;
}

/**
 * Canonical key for an address: IPv4 as is; IPv4-mapped IPv6 as IPv4; any other IPv6 reduced to its /64
 * (one subscriber usually owns the whole /64, so rotating the lower 64 bits must not mint new buckets).
 * Null when the text is not an address at all.
 */
export function normalizeIp(raw: string): string | null {
  let text = raw.trim();
  if (!text || text.length > 64) return null;
  // "[::1]:443" and "1.2.3.4:5678" styles
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(text);
  if (bracket) text = bracket[1];
  else if (/^[\d.]+:\d+$/.test(text)) text = text.slice(0, text.lastIndexOf(':'));
  text = text.replace(/%.*$/, ''); // zone id

  if (IPV4.test(text)) return text;
  if (!text.includes(':')) return null;
  const groups = expandIpv6(text);
  if (!groups) return null;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
  }
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}

/** The address to rate limit on, or `UNKNOWN_IP`. */
export function clientIpFrom(get: HeaderGetter, trustProxy: boolean): string {
  if (!trustProxy) return UNKNOWN_IP;
  const forwarded = get('x-forwarded-for');
  if (forwarded) {
    const first = normalizeIp(forwarded.split(',')[0] ?? '');
    if (first) return first;
  }
  const real = get('x-real-ip');
  return (real && normalizeIp(real)) || UNKNOWN_IP;
}
