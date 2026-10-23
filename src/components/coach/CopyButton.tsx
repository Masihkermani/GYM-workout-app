'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, type ButtonProps } from '@/components/ui/Button';

/** Copies text to the clipboard and says so ("Copied") for a moment, announced politely. */
export function CopyButton({
  text,
  label,
  variant = 'outline',
  size = 'sm',
}: {
  text: string;
  label: string;
} & Pick<ButtonProps, 'variant' | 'size'>) {
  const t = useTranslations('coach');
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API blocked (insecure origin, permissions): fall back to a hidden textarea.
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.insetBlockStart = '0';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
      } catch {
        // nothing else to try; the text stays visible for manual copying
      }
      area.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2200);
  };

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={copy}>
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        {copied ? t('shared.copied') : label}
      </Button>
      <span className="sr-only" role="status">
        {copied ? t('shared.copied') : ''}
      </span>
    </>
  );
}
