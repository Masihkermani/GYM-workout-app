/** Identify an image by its first bytes. The file name and the browser's `type` are never trusted. */

export type SniffedFormat = 'jpeg' | 'png' | 'webp' | 'gif';

const eq = (buf: Uint8Array, at: number, bytes: readonly number[]) => bytes.every((b, i) => buf[at + i] === b);
const ascii = (buf: Uint8Array, at: number, text: string) =>
  [...text].every((c, i) => buf[at + i] === c.charCodeAt(0));

export function sniffImage(buf: Uint8Array): SniffedFormat | null {
  if (buf.length < 12) return null;
  if (eq(buf, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (eq(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (ascii(buf, 0, 'GIF87a') || ascii(buf, 0, 'GIF89a')) return 'gif';
  if (ascii(buf, 0, 'RIFF') && ascii(buf, 8, 'WEBP')) return 'webp';
  return null;
}
