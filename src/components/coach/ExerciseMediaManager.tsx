'use client';

import { useRef, useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, Star, Trash2, Upload, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { ExerciseDemo } from '@/components/media/ExerciseDemo';
import { clearExerciseInfoCache } from '@/components/media/ExerciseInfoSheet';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Flash } from '@/components/ui/Flash';
import { useToast } from '@/components/ui/Toast';
import { ACCEPT_ATTR, MAX_FILE_BYTES, MAX_FRAMES, MAX_UPLOAD_BYTES } from '@/lib/media/constants';
import type { MediaDTO } from '@/lib/media/dto';
import {
  deleteExerciseMediaAction,
  reorderExerciseMediaAction,
  updateMediaFramesAction,
  uploadExerciseMediaAction,
  type MediaResult,
} from '@/server/media';
import type { CoachErrorCode } from './schemas';

const rawFrame = (url: string) => (url.startsWith('/media/') ? url.slice('/media/'.length) : url);

/**
 * The "Demonstrations" section of the exercise editor: what clients see for this exercise. Upload 1-8 images
 * (a frame sequence) or one animated GIF/WebP, choose which demonstration is shown first, reorder or remove the
 * frames of a flipbook, delete a demonstration. Each change is saved at once (it is not part of the Save button).
 */
export function ExerciseMediaManager({
  exerciseId,
  exerciseName,
  initial,
}: {
  exerciseId: string;
  exerciseName: string;
  initial: MediaDTO[];
}) {
  const t = useTranslations('coach');
  const locale = useLocale();
  const { toast } = useToast();
  const [media, setMedia] = useState<MediaDTO[]>(initial);
  const [error, setError] = useState<CoachErrorCode | 'tooBig' | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, start] = useTransition();
  const [toDelete, setToDelete] = useState<MediaDTO | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const apply = (r: MediaResult, message?: string) => {
    if (r.ok) {
      setMedia(r.media);
      setError(null);
      clearExerciseInfoCache(exerciseId);
      if (message) toast({ tone: 'success', message });
    } else {
      setError(r.error);
    }
    return r.ok;
  };

  const run = (job: () => Promise<MediaResult>, message?: string, then?: () => void) =>
    start(async () => {
      try {
        if (apply(await job(), message)) then?.();
      } catch {
        setError('generic');
      }
    });

  const pick = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    setFiles(picked);
    setError(
      picked.length > MAX_FRAMES
        ? 'mediaTooMany'
        : picked.some((f) => f.size > MAX_FILE_BYTES) || picked.reduce((s, f) => s + f.size, 0) > MAX_UPLOAD_BYTES
          ? 'tooBig'
          : null,
    );
  };

  const upload = () => {
    if (files.length === 0) return setError('mediaEmpty');
    const fd = new FormData();
    fd.set('exerciseId', exerciseId);
    for (const f of files) fd.append('files', f);
    run(
      () => uploadExerciseMediaAction(fd),
      t('exercises.editor.media.uploaded'),
      () => {
        setFiles([]);
        if (input.current) input.current.value = '';
      },
    );
  };

  const move = (m: MediaDTO, from: number, to: number) => {
    const frames = m.frames.map(rawFrame);
    [frames[from], frames[to]] = [frames[to], frames[from]];
    run(() => updateMediaFramesAction(m.id, frames));
  };

  const errText = error === 'tooBig' ? t('exercises.editor.media.tooBig') : error ? t(`errors.${error}`) : null;
  const kindLabel = (m: MediaDTO) =>
    m.kind === 'FRAMES'
      ? t('exercises.editor.media.kindFrames', { count: m.frames.length })
      : t(m.kind === 'GIF' ? 'exercises.editor.media.kindGif' : 'exercises.editor.media.kindImage');
  const sourceLabel = (m: MediaDTO) =>
    t(
      m.source === 'COACH'
        ? 'exercises.editor.media.sourceCoach'
        : m.source === 'LICENSED'
          ? 'exercises.editor.media.sourceLicensed'
          : 'exercises.editor.media.sourceBundled',
    );

  return (
    <section aria-labelledby="exercise-media-title" className="mt-6 flex flex-col gap-4 border-t border-rule pt-5" data-testid="media-manager">
      <div>
        <h3 id="exercise-media-title" className="text-base font-bold">
          {t('exercises.editor.media.title')}
        </h3>
        <p className="mt-1 text-sm text-ink-2">{t('exercises.editor.media.hint')}</p>
      </div>

      {media.length === 0 ? (
        <p className="border-[1.5px] border-dashed border-ink-3 px-4 py-5 text-center text-sm text-ink-2">{t('exercises.editor.media.none')}</p>
      ) : (
        <ul className="flex flex-col gap-5">
          {media.map((m, i) => {
            const editableFrames = m.kind === 'FRAMES' && m.source !== 'BUNDLED_OPEN';
            return (
              <li key={m.id} className="flex flex-col gap-2" data-testid="media-row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {t('exercises.editor.media.rowLabel', { n: i + 1 })}
                    <span className="font-normal text-ink-2">
                      {locale === 'fa' ? '، ' : ', '}
                      {kindLabel(m)}
                      {locale === 'fa' ? '، ' : ', '}
                      {sourceLabel(m)}
                    </span>
                  </p>
                  {i === 0 ? (
                    <span className="label-caps text-ink-2">{t('exercises.editor.media.primaryTag')}</span>
                  ) : null}
                </div>
                <ExerciseDemo media={m} name={exerciseName} />
                {editableFrames ? (
                  <ol className="flex flex-wrap gap-2">
                    {m.frames.map((src, fi) => (
                      <li key={src} className="flex w-24 flex-col border border-rule bg-card">
                        {/* eslint-disable-next-line @next/next/no-img-element -- processed upload */}
                        <img src={m.thumb && fi === 0 ? m.thumb : src} alt={t('exercises.editor.media.frame', { n: fi + 1 })} className="aspect-[4/3] w-full object-contain" loading="lazy" />
                        <div className="flex justify-between">
                          <button
                            type="button"
                            disabled={pending || fi === 0}
                            onClick={() => move(m, fi, fi - 1)}
                            aria-label={t('exercises.editor.media.moveEarlier', { n: fi + 1 })}
                            className="flex size-11 items-center justify-center tx hover:bg-paper-2 disabled:opacity-40"
                          >
                            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={pending || fi === m.frames.length - 1}
                            onClick={() => move(m, fi, fi + 1)}
                            aria-label={t('exercises.editor.media.moveLater', { n: fi + 1 })}
                            className="flex size-11 items-center justify-center tx hover:bg-paper-2 disabled:opacity-40"
                          >
                            <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                          </button>
                        </div>
                        {m.frames.length > 1 ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => updateMediaFramesAction(m.id, m.frames.filter((_, k) => k !== fi).map(rawFrame)))}
                            aria-label={t('exercises.editor.media.removeFrame', { n: fi + 1 })}
                            className="flex h-11 items-center justify-center border-t border-rule text-ink-2 tx hover:bg-paper-2 hover:text-ink"
                          >
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {i > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => reorderExerciseMediaAction(exerciseId, [m.id, ...media.filter((x) => x.id !== m.id).map((x) => x.id)]))}
                    >
                      <Star className="size-4" aria-hidden="true" />
                      {t('exercises.editor.media.makePrimary')}
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => setToDelete(m)}>
                    <Trash2 className="size-4" aria-hidden="true" />
                    {t('exercises.editor.media.deleteMedia')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-3 border-[1.5px] border-rule-strong bg-paper-2 p-3">
        <label htmlFor="exercise-media-files" className="text-sm font-semibold">
          {t('exercises.editor.media.choose')}
        </label>
        <input
          ref={input}
          id="exercise-media-files"
          data-testid="media-file-input"
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          onChange={(e) => pick(e.target.files)}
          className="block w-full text-sm file:me-3 file:min-h-11 file:border-[1.5px] file:border-ink file:bg-card file:px-3 file:font-semibold file:text-ink"
        />
        {files.length > 0 ? (
          <p className="text-sm text-ink-2">{t('exercises.editor.media.files', { count: files.length })}</p>
        ) : null}
        {errText ? (
          <Flash tone="error">
            {errText}
          </Flash>
        ) : null}
        <div>
          <Button onClick={upload} loading={pending} disabled={files.length === 0 || error === 'tooBig' || error === 'mediaTooMany'} data-testid="media-upload">
            <Upload className="size-4" aria-hidden="true" />
            {pending ? t('exercises.editor.media.uploading') : t('exercises.editor.media.upload')}
          </Button>
        </div>
      </div>

      <Dialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        role="alertdialog"
        title={t('exercises.editor.media.deleteTitle')}
        description={t('exercises.editor.media.deleteBody')}
        actions={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              {t('shared.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => toDelete && run(() => deleteExerciseMediaAction(toDelete.id), t('exercises.editor.media.deleted'), () => setToDelete(null))}
            >
              {t('exercises.editor.media.deleteConfirm')}
            </Button>
          </>
        }
      />
    </section>
  );
}
