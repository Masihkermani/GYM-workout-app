/**
 * Exercise demonstrations: key validation (the /media path-traversal defence), sniffing by bytes, and the sharp
 * pipeline (metadata stripped, orientation applied, size capped, animation kept, junk refused).
 */
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { isValidMediaKey, keyFromSegments, frameSrc, thumbSrc, thumbKeyOf } from '@/lib/media/key';
import { MediaError, processImage, probeImage } from '@/lib/media/process';
import { sniffImage } from '@/lib/media/sniff';

const HEX = 'a'.repeat(32);

describe('media keys', () => {
  it('accepts only 32 hex characters with .webp or .t.webp', () => {
    expect(isValidMediaKey(`${HEX}.webp`)).toBe(true);
    expect(isValidMediaKey(`${HEX}.t.webp`)).toBe(true);
    for (const bad of [
      '',
      '..',
      '../etc/passwd',
      `${HEX}.png`,
      `${HEX}.webp/`,
      `/${HEX}.webp`,
      `${HEX}.WEBP`,
      `${'A'.repeat(32)}.webp`,
      `${HEX.slice(1)}.webp`,
      `${HEX}%2e.webp`,
      `${HEX}.webp\0`,
      `..%2f${HEX}.webp`,
      `sub\\${HEX}.webp`,
    ]) {
      expect(isValidMediaKey(bad), bad).toBe(false);
    }
    expect(isValidMediaKey(null)).toBe(false);
    expect(isValidMediaKey(42)).toBe(false);
  });

  it('accepts exactly one valid route segment', () => {
    expect(keyFromSegments([`${HEX}.webp`])).toBe(`${HEX}.webp`);
    expect(keyFromSegments(undefined)).toBeNull();
    expect(keyFromSegments([])).toBeNull();
    expect(keyFromSegments(['..', `${HEX}.webp`])).toBeNull();
    expect(keyFromSegments([`ab`, `${HEX}.webp`])).toBeNull();
    expect(keyFromSegments(['..'])).toBeNull();
  });

  it('turns frames into URLs: bundled paths as they are, storage keys under /media', () => {
    expect(frameSrc('/exercise-media/everkinetic/0042/1.webp')).toBe('/exercise-media/everkinetic/0042/1.webp');
    expect(frameSrc(`${HEX}.webp`)).toBe(`/media/${HEX}.webp`);
    expect(thumbSrc(`${HEX}.webp`)).toBe(`/media/${thumbKeyOf(`${HEX}.webp`)}`);
    expect(thumbSrc('/exercise-media/x/1.webp')).toBe('/exercise-media/x/1.webp');
  });
});

const solid = (w: number, h: number, rgb = { r: 200, g: 40, b: 40 }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: rgb } });

describe('sniffImage', () => {
  it('reads the format from the bytes', async () => {
    expect(sniffImage(await solid(8, 8).jpeg().toBuffer())).toBe('jpeg');
    expect(sniffImage(await solid(8, 8).png().toBuffer())).toBe('png');
    expect(sniffImage(await solid(8, 8).webp().toBuffer())).toBe('webp');
    expect(sniffImage(await solid(8, 8).gif().toBuffer())).toBe('gif');
  });
  it('does not trust names: text, html and svg are not images', () => {
    for (const text of ['hello world, this is not a png', '<svg xmlns="http://www.w3.org/2000/svg"></svg>', '<!doctype html><html>']) {
      expect(sniffImage(Buffer.from(text))).toBeNull();
    }
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('processImage', () => {
  it('strips EXIF (GPS included) and other metadata', async () => {
    const input = await solid(400, 300)
      .withExif({
        IFD0: { Copyright: 'someone', ImageDescription: 'home gym' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '35/1 41/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '51/1 23/1 0/1' },
      })
      .jpeg()
      .toBuffer();
    const before = await sharp(input).metadata();
    expect(before.exif?.length ?? 0).toBeGreaterThan(0);
    expect(input.includes(Buffer.from('home gym'))).toBe(true);

    const out = await processImage(input);
    const meta = await sharp(out.main).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(out.main.includes(Buffer.from('home gym'))).toBe(false);
    expect(out.main.includes(Buffer.from('EXIF'))).toBe(false);
    expect((await sharp(out.thumb).metadata()).exif).toBeUndefined();
  });

  it('applies the EXIF orientation, then forgets it', async () => {
    // 200x100 stored sideways with orientation 6 (rotate 90 CW): displayed as 100x200
    const input = await solid(200, 100).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await processImage(input);
    expect([out.width, out.height]).toEqual([100, 200]);
    expect((await sharp(out.main).metadata()).orientation).toBeUndefined();
  });

  it('fits inside 960 px without enlarging, and makes a 192 px thumbnail', async () => {
    const big = await processImage(await solid(2400, 1200).png().toBuffer());
    expect([big.width, big.height]).toEqual([960, 480]);
    const small = await processImage(await solid(300, 200).png().toBuffer());
    expect([small.width, small.height]).toEqual([300, 200]);
    const thumb = await sharp(big.thumb).metadata();
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBeLessThanOrEqual(192);
  });

  it('keeps transparency', async () => {
    const png = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const out = await processImage(png);
    expect((await sharp(out.main).metadata()).hasAlpha).toBe(true);
  });

  it('turns an animated GIF into an animated WebP', async () => {
    const colours = [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }];
    const raw = Buffer.concat(await Promise.all(colours.map((c) => solid(50, 40, c).raw().toBuffer())));
    const gif = await sharp(raw, { raw: { width: 50, height: 120, channels: 3, pageHeight: 40 } }).gif({ delay: [200, 200, 200], loop: 0 }).toBuffer();
    const probe = await probeImage(gif);
    expect(probe).toMatchObject({ format: 'gif', frames: 3, animated: true });
    const out = await processImage(gif);
    expect(out.animated).toBe(true);
    const meta = await sharp(out.main, { animated: true }).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.pages).toBe(3);
  });

  it('refuses what is not an image, whatever it is called', async () => {
    await expect(processImage(Buffer.from('just some text pretending to be a png'.repeat(3)))).rejects.toMatchObject({ code: 'type' });
    await expect(processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'))).rejects.toBeInstanceOf(MediaError);
  });

  it('refuses a truncated image', async () => {
    const png = await solid(300, 300).png().toBuffer();
    await expect(processImage(png.subarray(0, 60))).rejects.toMatchObject({ code: expect.stringMatching(/corrupt|type/) });
  });

  it('refuses a picture with too many pixels', async () => {
    const huge = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer();
    await expect(processImage(huge)).rejects.toMatchObject({ code: 'tooLarge' });
  });
});
