import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

/** Only plain, same-site paths go into a CSS url(): no quotes, parentheses, spaces or schemes can break out of it. */
const SAFE_URL = /^\/[A-Za-z0-9._~\-/%]+$/;

export function maskStyle(src: string): CSSProperties | undefined {
  if (!SAFE_URL.test(src)) return undefined;
  const value = `url("${src}")`;
  return { maskImage: value, WebkitMaskImage: value };
}

/**
 * Transparent-background line art drawn in the ink colour: the picture is a mask and the fill is
 * `--ink`, so the same file reads black on the light card and chalk on the dark one.
 */
export function LineArt({ src, label, className }: { src: string; label?: string; className?: string }) {
  const style = maskStyle(src);
  if (!style) return null;
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('demo-mask', className)}
      style={style}
    />
  );
}
