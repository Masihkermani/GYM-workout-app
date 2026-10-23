'use client';

import { useEffect, useState } from 'react';

/**
 * A ticking "now" in ms. Starts from `initial` (the server's clock) so server and client render the
 * same first frame, then follows the real clock while `active`.
 */
export function useNow(active: boolean, intervalMs = 1000, initial?: number): number {
  const [now, setNow] = useState(() => initial ?? Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
