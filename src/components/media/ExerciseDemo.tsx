'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import type { MediaDTO } from '@/lib/media/dto';
import { useReducedMotion } from './hooks';
import { LineArt } from './LineArt';
import { MediaCreditLine } from './MediaCredit';

/** How long one frame stays before the next crossfades in: ~900 ms held + 200 ms fade (globals.css .demo-frame). */
export const FRAME_PERIOD_MS = 1100;

type T = (key: string, values?: Record<string, string | number>) => string;

function frameLabel(t: T, name: string, i: number, n: number, animated: boolean): string {
  if (animated) return t('demo.alt.animated', { name });
  if (n === 1) return t('demo.alt.single', { name });
  if (i === 0) return t('demo.alt.start', { name });
  if (i === n - 1) return t('demo.alt.end', { name });
  return t('demo.alt.step', { name, n: i + 1 });
}

/**
 * An animated image (GIF stored as animated WebP) with a pause button. A browser cannot pause an <img>, so
 * while paused the frame being shown is painted onto a canvas of the same size and the image is hidden;
 * resuming shows the image again (its animation never stopped). With reduced motion it starts paused.
 */
function AnimatedFrame({ src, label, playing }: { src: string; label: string; playing: boolean }) {
  const img = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const paint = useCallback(() => {
    const el = img.current;
    const cv = canvas.current;
    if (!el || !cv || !el.complete || el.naturalWidth === 0) return;
    try {
      cv.width = el.naturalWidth;
      cv.height = el.naturalHeight;
      cv.getContext('2d')?.drawImage(el, 0, 0);
    } catch {
      /* an image the canvas cannot read just stays an image */
    }
  }, []);

  useLayoutEffect(() => {
    if (!playing) paint();
  }, [playing, paint]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- animated WebP from our own storage */}
      <img
        ref={img}
        src={src}
        alt={playing ? label : ''}
        loading="lazy"
        decoding="async"
        onLoad={() => {
          if (!playing) paint();
        }}
        style={playing ? undefined : { visibility: 'hidden', position: 'absolute' }}
      />
      <canvas ref={canvas} role="img" aria-label={label} style={playing ? { display: 'none' } : undefined} />
    </>
  );
}

/**
 * The demonstration of one exercise: a fixed-ratio stage (no layout shift) that plays a flipbook of 2-8
 * frames (crossfade 200 ms, hold ~900 ms) with a labelled pause/play button, or shows a single image or an
 * animated image. With prefers-reduced-motion every frame is shown still, side by side. Line art is drawn with
 * a CSS mask in --ink on --card; photos are plain images. Bundled and licensed pictures carry a credit line.
 */
export function ExerciseDemo({ media, name, className }: { media: MediaDTO; name: string; className?: string }) {
  const t = useTranslations('training');
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(true);
  const [index, setIndex] = useState(0);
  const frames = media.frames;
  const n = frames.length;
  const flip = media.kind === 'FRAMES' && n > 1;
  const animated = media.kind === 'GIF';

  useEffect(() => {
    if (!flip || !playing || reduced) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % n), FRAME_PERIOD_MS);
    return () => window.clearInterval(id);
  }, [flip, playing, reduced, n]);

  const active = flip ? index % n : 0;
  const showControl = (flip || animated) && !reduced;
  const toggle = playing ? t('demo.pause') : t('demo.play');

  return (
    <figure className={cn('m-0', className)} data-testid="exercise-demo">
      <div
        className="demo-stage"
        data-flip={flip ? 'true' : 'false'}
        data-frame={flip ? active : undefined}
        data-playing={showControl ? String(playing) : undefined}
        style={flip ? ({ '--demo-cols': Math.min(n, 2) } as CSSProperties) : undefined}
      >
        {frames.map((src, i) => {
          const label = frameLabel(t as unknown as T, name, i, n, animated);
          return (
            <div
              key={`${src}-${i}`}
              className="demo-frame"
              data-active={i === active ? 'true' : 'false'}
              data-frame-index={i}
              // a flipbook shows one frame at a time; the others are decoration for assistive tech unless motion is reduced
              aria-hidden={flip && i !== active && !reduced ? true : undefined}
            >
              {media.recolorable ? (
                <LineArt src={src} label={label} />
              ) : animated ? (
                <AnimatedFrame src={src} label={label} playing={playing && !reduced} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- already processed by the media pipeline
                <img src={src} alt={label} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
              )}
            </div>
          );
        })}
        {showControl ? (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={toggle}
            title={toggle}
            data-testid="demo-toggle"
            className="demo-controls absolute bottom-1 end-1 z-10 flex size-11 items-center justify-center rounded-[var(--r)] border-[1.5px] border-ink bg-card text-ink tx hover:bg-paper-2"
          >
            {playing ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
          </button>
        ) : null}
      </div>
      {media.credit ? (
        <figcaption className="mt-2">
          <MediaCreditLine credit={media.credit} />
        </figcaption>
      ) : null}
    </figure>
  );
}

/** The same stage with nothing to show: the exercise has no demonstration yet. */
export function DemoPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="demo-stage flex items-center justify-center bg-paper-2 px-6 text-center" data-testid="demo-empty">
      <p className="text-sm text-ink-2">{children}</p>
    </div>
  );
}
