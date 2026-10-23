'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Loader2, Lock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Textarea } from '@/components/ui/Textarea';
import { formatTime } from '@/lib/format';
import { saveCoachNotesAction } from '@/server/coach';
import { COACH_NOTES_MAX } from './schemas';

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'error' };

const DEBOUNCE_MS = 900;

/**
 * Private coach notes with autosave: saves shortly after typing stops, on blur and when the tab is
 * hidden. The status line is a live region; a failed save keeps the text and offers a retry.
 */
export function CoachNotes({ clientId, initial, timeZone }: { clientId: string; initial: string; timeZone: string }) {
  const t = useTranslations('coach');
  const locale = useLocale();
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const lastSaved = useRef(initial);
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const save = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const text = latest.current;
    if (text === lastSaved.current) return;
    const mine = ++seq.current;
    setState({ kind: 'saving' });
    try {
      const result = await saveCoachNotesAction(clientId, text);
      if (mine !== seq.current) return; // a newer save is in flight; let it report
      if (result.ok) {
        lastSaved.current = text;
        // typed more while saving: the next debounce will pick it up
        setState({ kind: 'saved', at: new Date() });
      } else {
        setState({ kind: 'error' });
      }
    } catch {
      if (mine === seq.current) setState({ kind: 'error' });
    }
  };

  const onChange = (next: string) => {
    setValue(next);
    latest.current = next;
    if (next === lastSaved.current) {
      if (timer.current) clearTimeout(timer.current);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, DEBOUNCE_MS);
  };

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void save();
    };
    document.addEventListener('visibilitychange', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      if (timer.current) clearTimeout(timer.current);
    };
    // save() only reads refs and the stable clientId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const status =
    state.kind === 'saving' ? (
      <span className="flex items-center gap-1.5">
        <Loader2 className="spin size-4" aria-hidden="true" />
        {t('client.notes.saving')}
      </span>
    ) : state.kind === 'saved' ? (
      <span className="flex items-center gap-1.5">
        <CircleCheck className="size-4 text-plate-green" aria-hidden="true" />
        {t('client.notes.saved', { time: formatTime(state.at, locale, { timeZone }) })}
      </span>
    ) : state.kind === 'error' ? (
      <span className="flex items-center gap-1.5 font-semibold text-danger">
        <CircleAlert className="size-4" aria-hidden="true" />
        {t('client.notes.error')}
        <button type="button" onClick={() => void save()} className="min-h-11 px-2 underline underline-offset-4">
          {t('shared.retry')}
        </button>
      </span>
    ) : (
      <span>{t('client.notes.autosave')}</span>
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="coach-notes" className="label-caps text-ink-2">
          {t('client.notes.label')}
        </label>
        <span className="flex items-center gap-1.5 text-sm text-ink-2">
          <Lock className="size-4" aria-hidden="true" />
          {t('client.notes.private')}
        </span>
      </div>
      <Textarea
        id="coach-notes"
        name="coachNotes"
        rows={6}
        maxLength={COACH_NOTES_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => void save()}
        placeholder={t('client.notes.placeholder')}
        aria-describedby="coach-notes-status"
      />
      <div id="coach-notes-status" role="status" aria-live="polite" className="min-h-6 text-sm text-ink-2">
        {status}
      </div>
    </div>
  );
}
