'use client';

import { useEffect, useState } from 'react';
import { Sheet, type SheetProps } from '@/components/ui/Sheet';

/**
 * A Sheet for panels that mount already open (the add-client panel, the exercise editor that opens
 * from `?edit=`). The shared Sheet drives a native <dialog> from an effect keyed on `open`; a
 * component that mounts with `open` already true gets that effect run, torn down and run again by
 * React Strict Mode in development, and the teardown's native `close` event reports "closed" to the
 * parent. Opening one render later (open false, then true) makes the effect run only on an update,
 * where Strict Mode does not double it.
 */
export function MountedSheet({ open, ...props }: SheetProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return <Sheet {...props} open={open && ready} />;
}
