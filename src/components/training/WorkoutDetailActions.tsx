'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useRouter } from '@/i18n/navigation';
import { deleteWorkoutAction, updateWorkoutNoteAction } from '@/server/training';

/** History detail: edit the workout note, or delete the whole workout. */
export function WorkoutDetailActions({ workoutId, note }: { workoutId: string; note: string | null }) {
  const t = useTranslations('training');
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? '');
  const [saved, setSaved] = useState(note ?? '');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function saveNote() {
    setBusy(true);
    try {
      const r = await updateWorkoutNoteAction({ workoutId, note: text });
      if (r.ok) {
        setSaved(text.trim());
        setEditing(false);
        toast({ message: t('detail.noteSaved'), tone: 'success' });
        router.refresh();
      } else toast({ message: t(`errors.${r.error}`), tone: 'error' });
    } catch {
      toast({ message: t('errors.generic'), tone: 'error' });
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try {
      const r = await deleteWorkoutAction({ workoutId });
      if (r.ok) {
        router.replace('/app/history');
        return;
      }
      toast({ message: t(`errors.${r.error}`), tone: 'error' });
    } catch {
      toast({ message: t('errors.generic'), tone: 'error' });
    }
    setBusy(false);
    setConfirm(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {editing ? (
        <div className="flex max-w-xl flex-col gap-3">
          <label htmlFor="workout-note" className="text-sm font-semibold">
            {t('detail.noteLabel')}
          </label>
          <Textarea id="workout-note" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          <div className="flex gap-3">
            <Button variant="ink" loading={busy} onClick={saveNote}>
              {t('edit.save')}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setText(saved);
                setEditing(false);
              }}
            >
              {t('builder.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden="true" />
            {saved ? t('detail.editNote') : t('detail.addNote')}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
          <Trash2 className="size-4" aria-hidden="true" />
          {t('detail.delete')}
        </Button>
      </div>

      <Dialog
        open={confirm}
        onOpenChange={(o) => {
          if (!busy) setConfirm(o);
        }}
        role="alertdialog"
        title={t('detail.deleteTitle')}
        description={t('detail.deleteBody')}
        actions={
          <>
            <Button variant="danger" loading={busy} onClick={remove}>
              {t('detail.delete')}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>
              {t('builder.cancel')}
            </Button>
          </>
        }
      />
    </div>
  );
}
