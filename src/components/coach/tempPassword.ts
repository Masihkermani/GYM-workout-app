/**
 * Temporary passwords for clients the coach creates or resets. Isomorphic: it only needs Web Crypto
 * (browsers and Node >= 19), so the "Generate" button and the reset action share one generator.
 *
 * 31-symbol alphabet without the look-alikes (i l o 0 1), 12 symbols grouped 4-4-4 so it can be read
 * out over the phone: about 59 bits of entropy. Rejection sampling keeps every symbol equally likely.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateTempPassword(groups = 3, groupSize = 4): string {
  const length = groups * groupSize;
  const limit = 256 - (256 % ALPHABET.length);
  const chars: string[] = [];
  while (chars.length < length) {
    const bytes = new Uint8Array(length * 2);
    globalThis.crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= limit) continue;
      chars.push(ALPHABET[b % ALPHABET.length]);
      if (chars.length === length) break;
    }
  }
  const out: string[] = [];
  for (let i = 0; i < length; i += groupSize) out.push(chars.slice(i, i + groupSize).join(''));
  return out.join('-');
}
