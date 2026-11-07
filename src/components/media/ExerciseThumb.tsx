'use client';

import { Dumbbell } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ExerciseThumbDTO } from '@/lib/media/dto';
import { useSeen } from './hooks';
import { LineArt } from './LineArt';

/**
 * The small picture of an exercise in lists and next to a name. Decorative (the name is always beside
 * it); an exercise without a demonstration gets a neutral placeholder, never a broken image.
 * `size` is the side of the square in px; the box is fixed, so nothing shifts when the picture loads.
 */
export function ExerciseThumb({
  thumb,
  size = 48,
  className,
}: {
  thumb?: ExerciseThumbDTO | null;
  size?: number;
  className?: string;
}) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-testid="exercise-thumb"
      data-has-media={thumb ? 'true' : 'false'}
      className={cn('demo-thumb flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {thumb ? (
        thumb.recolorable ? (
          seen ? <LineArt src={thumb.src} /> : null
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- already processed and sized by the media pipeline
          <img src={thumb.src} alt="" loading="lazy" decoding="async" width={size} height={size} />
        )
      ) : (
        <Dumbbell className="size-1/2" strokeWidth={1.5} />
      )}
    </span>
  );
}
