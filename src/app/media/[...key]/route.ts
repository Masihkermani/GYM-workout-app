import { keyFromSegments } from '@/lib/media/key';
import { readStored } from '@/lib/media/storage';

/**
 * Serves the demonstrations a coach uploaded (or a licensed pack imported) from MEDIA_DIR. It lives
 * outside [locale], and middleware.ts leaves /media alone.
 *
 * The URL is `/media/<32 hex>.webp` or `/media/<32 hex>.t.webp` and nothing else: any other shape (a
 * second segment, `..`, an encoded slash, another extension) is a 404 before the file system is touched.
 * Files are named by random 128-bit ids and never change, so they are cached for a year.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ key?: string[] }> };

const NOT_FOUND = () =>
  new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

async function serve(ctx: Ctx, withBody: boolean): Promise<Response> {
  const key = keyFromSegments((await ctx.params).key);
  if (!key) return NOT_FOUND();
  const data = await readStored(key);
  if (!data) return NOT_FOUND();
  return new Response(withBody ? new Uint8Array(data) : null, {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(data.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}

export const GET = (_req: Request, ctx: Ctx) => serve(ctx, true);
export const HEAD = (_req: Request, ctx: Ctx) => serve(ctx, false);
