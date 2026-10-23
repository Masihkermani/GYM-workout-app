'use client';

import { useEffect, type ReactNode } from 'react';
import { CalendarRange } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useFocusFirstError } from '@/components/auth/useFocusFirstError';
import { ButtonLink } from '@/components/ui/Button';
import { DirIcon } from '@/components/ui/DirIcon';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { Input } from '@/components/ui/Input';
import { NumberInput } from '@/components/ui/NumberInput';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { formatNumber } from '@/lib/format';
import { Link } from '@/i18n/navigation';
import { saveSettingsAction, type SettingsState } from '@/server/coach';
import { SETTINGS_LIMITS, SETTINGS_TEXT_LIMITS, type CoachErrorCode, type SettingsField } from './schemas';
import { Switch } from './Switch';
import { useManualForm } from './useManualForm';

export interface SettingsFormValues {
  coachName: string;
  coachNameFa: string;
  bioEn: string;
  bioFa: string;
  locationEn: string;
  locationFa: string;
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
  horizonDays: number;
  minNoticeHours: number;
  cancelWindowHours: number;
  requireApproval: boolean;
  allowSignup: boolean;
  barKg: number;
}

const TIMEZONE_SUGGESTIONS = [
  'Asia/Tehran',
  'Asia/Dubai',
  'Asia/Istanbul',
  'Asia/Kabul',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Stockholm',
  'America/Toronto',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

function Group({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-x-8 gap-y-5 border-0 p-0 lg:grid-cols-12">
      <legend className="sr-only">{title}</legend>
      <div className="lg:col-span-4">
        <SectionLabel as="h2">{title}</SectionLabel>
        {description ? <p className="mt-3 max-w-prose text-sm text-ink-2">{description}</p> : null}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:col-span-8">{children}</div>
    </fieldset>
  );
}

/** Everything in CoachSettings except the weekly hours, which live on the schedule page. */
export function SettingsForm({ initial }: { initial: SettingsFormValues }) {
  const t = useTranslations('coach');
  const locale = useLocale();
  const { toast } = useToast();
  const { state, pending, onSubmit } = useManualForm<SettingsState>(saveSettingsAction, {});
  const formRef = useFocusFirstError<HTMLFormElement>(state);
  const e = state.errors ?? {};

  useEffect(() => {
    if (state.ok) toast({ tone: 'success', message: t('settings.saved') });
    // once per successful save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);

  const range = (key: keyof typeof SETTINGS_LIMITS) =>
    t('settings.range', {
      min: formatNumber(SETTINGS_LIMITS[key].min, locale, { grouping: false }),
      max: formatNumber(SETTINGS_LIMITS[key].max, locale, { grouping: false }),
    });
  const err = (field: SettingsField, code?: CoachErrorCode) => {
    if (!code) return undefined;
    const limits = (SETTINGS_LIMITS as Record<string, { min: number; max: number }>)[field];
    return t(`errors.${code}`, {
      min: limits ? formatNumber(limits.min, locale, { grouping: false }) : '',
      max: limits ? formatNumber(limits.max, locale, { grouping: false }) : '',
    });
  };
  const val = (field: SettingsField) => state.values?.[field];

  const numberField = (
    field: 'slotMinutes' | 'bufferMinutes' | 'horizonDays' | 'minNoticeHours' | 'cancelWindowHours',
    step: number,
  ) => (
    <Field label={t(`settings.fields.${field}.label`)} hint={`${t(`settings.fields.${field}.hint`)} ${range(field)}`} error={err(field, e[field])} required>
      <NumberInput
        name={field}
        defaultValue={initial[field]}
        min={SETTINGS_LIMITS[field].min}
        max={SETTINGS_LIMITS[field].max}
        step={step}
        decimals={0}
        unit={t(`settings.fields.${field}.unit`)}
      />
    </Field>
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-10">
      <input type="hidden" name="locale" value={locale} />
      {e.form ? <Flash tone="error">{t(`errors.${e.form}`)}</Flash> : null}

      <Group title={t('settings.profile.title')} description={t('settings.profile.description')}>
        <Field label={t('settings.fields.coachName')} error={err('coachName', e.coachName)} required>
          <Input name="coachName" dir="ltr" lang="en" defaultValue={val('coachName') ?? initial.coachName} maxLength={SETTINGS_TEXT_LIMITS.name} autoComplete="off" />
        </Field>
        <Field label={t('settings.fields.coachNameFa')} error={err('coachNameFa', e.coachNameFa)} required>
          <Input name="coachNameFa" dir="rtl" lang="fa" defaultValue={val('coachNameFa') ?? initial.coachNameFa} maxLength={SETTINGS_TEXT_LIMITS.name} autoComplete="off" />
        </Field>
        <Field label={t('settings.fields.bioEn')} error={err('bioEn', e.bioEn)}>
          <Textarea name="bioEn" dir="ltr" lang="en" rows={4} defaultValue={val('bioEn') ?? initial.bioEn} maxLength={SETTINGS_TEXT_LIMITS.bio} />
        </Field>
        <Field label={t('settings.fields.bioFa')} error={err('bioFa', e.bioFa)}>
          <Textarea name="bioFa" dir="rtl" lang="fa" rows={4} defaultValue={val('bioFa') ?? initial.bioFa} maxLength={SETTINGS_TEXT_LIMITS.bio} />
        </Field>
        <Field label={t('settings.fields.locationEn')} error={err('locationEn', e.locationEn)}>
          <Input name="locationEn" dir="ltr" lang="en" defaultValue={val('locationEn') ?? initial.locationEn} maxLength={SETTINGS_TEXT_LIMITS.location} autoComplete="off" />
        </Field>
        <Field label={t('settings.fields.locationFa')} error={err('locationFa', e.locationFa)}>
          <Input name="locationFa" dir="rtl" lang="fa" defaultValue={val('locationFa') ?? initial.locationFa} maxLength={SETTINGS_TEXT_LIMITS.location} autoComplete="off" />
        </Field>
      </Group>

      <Group title={t('settings.booking.title')} description={t('settings.booking.description')}>
        {numberField('slotMinutes', 5)}
        {numberField('bufferMinutes', 5)}
        {numberField('horizonDays', 1)}
        {numberField('minNoticeHours', 1)}
        {numberField('cancelWindowHours', 1)}
        <Field label={t('settings.fields.timezone.label')} hint={t('settings.fields.timezone.hint')} error={err('timezone', e.timezone)} required>
          <Input
            name="timezone"
            dir="ltr"
            list="timezone-suggestions"
            defaultValue={val('timezone') ?? initial.timezone}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="rtl:text-end"
          />
          <datalist id="timezone-suggestions">
            {TIMEZONE_SUGGESTIONS.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </Field>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Switch
            name="requireApproval"
            label={t('settings.fields.requireApproval.label')}
            hint={t('settings.fields.requireApproval.hint')}
            defaultChecked={initial.requireApproval}
          />
          <Switch
            name="allowSignup"
            label={t('settings.fields.allowSignup.label')}
            hint={t('settings.fields.allowSignup.hint')}
            defaultChecked={initial.allowSignup}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-[1.5px] border-dashed border-ink-3 px-4 py-3 sm:col-span-2">
          <p className="min-w-0 flex-1 text-sm text-ink-2">{t('settings.booking.scheduleNote')}</p>
          <ButtonLink href="/coach/schedule" variant="outline" size="sm">
            <CalendarRange className="size-4" aria-hidden="true" />
            {t('settings.booking.scheduleLink')}
            <DirIcon name="chevron-forward" className="size-4" />
          </ButtonLink>
        </div>
      </Group>

      <Group title={t('settings.training.title')} description={t('settings.training.description')}>
        <Field
          label={t('settings.fields.barKg.label')}
          hint={`${t('settings.fields.barKg.hint')} ${range('barKg')}`}
          error={err('barKg', e.barKg)}
          required
        >
          <NumberInput
            name="barKg"
            defaultValue={initial.barKg}
            min={SETTINGS_LIMITS.barKg.min}
            max={SETTINGS_LIMITS.barKg.max}
            step={0.5}
            decimals={2}
            unit={t('settings.fields.barKg.unit')}
          />
        </Field>
      </Group>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t-[1.5px] border-rule-strong bg-paper px-4 py-3 md:static md:mx-0 md:border-t-0 md:bg-transparent md:px-0 md:py-0">
        <SubmitButton size="lg" loading={pending}>
          {t('settings.save')}
        </SubmitButton>
        <Link href="/coach" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold underline underline-offset-4">
          {t('shared.cancel')}
        </Link>
        <p role="status" aria-live="polite" className="text-sm font-semibold text-ink-2">
          {state.ok ? t('settings.saved') : ''}
        </p>
      </div>
    </form>
  );
}
