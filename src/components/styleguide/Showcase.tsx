'use client';

import { useState, type ReactNode } from 'react';
import { CalendarDays, Dumbbell, Plus } from 'lucide-react';
import { useLocale } from 'next-intl';
import { Avatar } from '@/components/ui/Avatar';
import { BarbellDiagram } from '@/components/ui/BarbellDiagram';
import { Button, ButtonLink, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { DirIcon } from '@/components/ui/DirIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { Input } from '@/components/ui/Input';
import { NumberInput } from '@/components/ui/NumberInput';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { Stamp, type StampStatus } from '@/components/ui/Stamp';
import { Tabs } from '@/components/ui/Tabs';
import { Tally } from '@/components/ui/Tally';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatKg, formatSet, formatTime } from '@/lib/format';

const COPY = {
  en: {
    colours: 'Colour and type',
    buttons: 'Buttons',
    fields: 'Fields',
    stepper: 'Set logger inputs',
    stamps: 'Stamps and tally',
    feedback: 'Feedback',
    people: 'Avatars and direction',
    overlays: 'Tabs, sheet, dialog',
    barbell: 'Barbell diagram',
    heading: 'Pick a slot',
    body: 'Pick a slot. I will confirm within a few hours.',
    name: 'Full name',
    nameHint: 'As you want me to write it on the card.',
    phone: 'Phone number',
    phoneError: 'Enter a valid phone number, like 0912 123 4567.',
    password: 'Password',
    goal: 'Goal',
    goalOptional: 'In your own words',
    day: 'Training day',
    days: ['A — Push', 'B — Pull', 'C — Legs'],
    weight: 'Weight',
    reps: 'Reps',
    same: 'Same as last set',
    typed: 'Parsed value',
    loading: 'Saving',
    disabled: 'Disabled',
    primary: 'Book session',
    openSheet: 'Open sheet',
    openDialog: 'Open dialog',
    sheetTitle: 'Confirm booking',
    sheetBody: 'Saturday 17:00, with the coach. Pending until confirmed.',
    dialogTitle: 'Cancel this session?',
    dialogBody: 'You can cancel until 24 hours before. After that, call the coach.',
    keep: 'Keep it',
    cancelIt: 'Cancel session',
    toast: 'Show toast',
    toastText: 'Saved. 3 sets left.',
    emptyTitle: 'No sessions yet',
    emptyBody: 'Pick a slot and I will confirm it.',
    flashInfo: 'Your coach confirms within a few hours.',
    flashOk: 'Set logged: 8 × 30 kg.',
    flashWarn: 'This slot starts in under 12 hours.',
    flashErr: 'Wrong phone number or password.',
    tabs: ['Week', 'Month', 'List'],
    tabsLabel: 'View',
    land: 'Land stamp',
    addStroke: 'Add set',
    names: ['Arash Kamali', 'Mahsa Rahimi', 'Behnam Akbari'],
  },
  fa: {
    colours: 'رنگ و حروف',
    buttons: 'دکمه‌ها',
    fields: 'فیلدها',
    stepper: 'ورودی‌های ثبت ست',
    stamps: 'مهرها و شمارش',
    feedback: 'بازخورد',
    people: 'آواتار و جهت',
    overlays: 'تب، برگه، گفتگو',
    barbell: 'نمودار هالتر',
    heading: 'یک ساعت را انتخاب کن',
    body: 'یک ساعت را انتخاب کن؛ تا چند ساعت دیگر تأیید می‌کنم.',
    name: 'نام و نام خانوادگی',
    nameHint: 'همان‌طور که می‌خواهی روی کارت نوشته شود.',
    phone: 'شماره‌ی موبایل',
    phoneError: 'یک شماره‌ی موبایل معتبر وارد کن؛ مثلاً ۰۹۱۲ ۱۲۳ ۴۵۶۷.',
    password: 'رمز عبور',
    goal: 'هدف',
    goalOptional: 'با زبان خودت',
    day: 'روز تمرین',
    days: ['روز اول — سینه و سرشانه', 'روز دوم — پشت و جلوبازو', 'روز سوم — پا'],
    weight: 'وزنه',
    reps: 'تکرار',
    same: 'مثل ست قبل',
    typed: 'مقدار خوانده‌شده',
    loading: 'در حال ذخیره',
    disabled: 'غیرفعال',
    primary: 'رزرو جلسه',
    openSheet: 'باز کردن برگه',
    openDialog: 'باز کردن گفتگو',
    sheetTitle: 'تأیید رزرو',
    sheetBody: 'شنبه ساعت ۱۷:۰۰ با مربی. تا تأیید مربی در انتظار می‌ماند.',
    dialogTitle: 'این جلسه لغو شود؟',
    dialogBody: 'تا ۲۴ ساعت قبل می‌توانی لغو کنی. بعد از آن با مربی تماس بگیر.',
    keep: 'نگه دار',
    cancelIt: 'لغو جلسه',
    toast: 'نمایش اعلان',
    toastText: 'ذخیره شد. ۳ ست مانده.',
    emptyTitle: 'هنوز جلسه‌ای نداری',
    emptyBody: 'یک ساعت را انتخاب کن تا تأیید کنم.',
    flashInfo: 'مربی تا چند ساعت دیگر تأیید می‌کند.',
    flashOk: 'ست ثبت شد: ۸ × ۳۰ کیلو.',
    flashWarn: 'این ساعت کمتر از ۱۲ ساعت دیگر شروع می‌شود.',
    flashErr: 'شماره یا رمز عبور درست نیست.',
    tabs: ['هفته', 'ماه', 'فهرست'],
    tabsLabel: 'نما',
    land: 'فرود مهر',
    addStroke: 'افزودن ست',
    names: ['آرش کمالی', 'مهسا رحیمی', 'علی‌رضا نوری'],
  },
} as const;

const SWATCHES = [
  ['bg-paper', 'paper'],
  ['bg-paper-2', 'paper-2'],
  ['bg-card', 'card'],
  ['bg-ink', 'ink'],
  ['bg-ink-2', 'ink-2'],
  ['bg-ink-3', 'ink-3'],
  ['bg-plate-red', 'red 25'],
  ['bg-plate-blue', 'blue 20'],
  ['bg-plate-yellow', 'yellow 15'],
  ['bg-plate-green', 'green 10'],
  ['bg-plate-white', 'white 5'],
  ['bg-danger', 'danger'],
] as const;

const STAMPS: StampStatus[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'OPEN', 'PR'];
const VARIANTS: ButtonVariant[] = ['primary', 'ink', 'outline', 'ghost', 'danger'];
const SIZES: ButtonSize[] = ['sm', 'md', 'lg', 'xl'];

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

/** One copy of every primitive. Rendered twice by the page (light + dark scopes). */
export function Showcase() {
  const locale = useLocale() === 'fa' ? 'fa' : 'en';
  const c = COPY[locale];
  const { toast } = useToast();

  const [weight, setWeight] = useState<number | null>(62.5);
  const [reps, setReps] = useState<number | null>(8);
  const [free, setFree] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [tally, setTally] = useState(7);
  const [stampKey, setStampKey] = useState(0);
  const [barWeight, setBarWeight] = useState<number | null>(102.5);
  const sample = new Date('2026-03-21T13:30:00Z');

  return (
    <div className="flex flex-col gap-12">
      <Block title={c.colours}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {SWATCHES.map(([cls, name]) => (
            <div key={name} className="border border-rule-strong bg-card">
              <div className={`h-10 ${cls}`} />
              <p className="px-2 py-1 text-xs text-ink-2">{name}</p>
            </div>
          ))}
        </div>
        <div className="border-[1.5px] border-rule-strong bg-card p-4">
          <p className="text-4xl font-expanded">{c.heading}</p>
          <p className="mt-2 text-base text-ink-2">{c.body}</p>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="num text-5xl">{formatKg(62.5, locale)}</span>
            <span className="num text-2xl">{formatSet({ sets: 3, reps: 8, weightKg: 30 }, locale)}</span>
            <span className="num text-2xl">
              {formatDate(sample, locale, { style: 'long' })} · {formatTime(sample, locale)}
            </span>
          </p>
        </div>
      </Block>

      <Block title={c.buttons}>
        <div className="flex flex-wrap items-center gap-3">
          {VARIANTS.map((v) => (
            <Button key={v} variant={v}>
              {v === 'primary' ? c.primary : v}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {SIZES.map((s) => (
            <Button key={s} size={s} variant="ink">
              {s}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button loading>{c.loading}</Button>
          <Button disabled variant="outline">
            {c.disabled}
          </Button>
          <ButtonLink href="/login" variant="outline">
            {c.primary}
            <DirIcon name="arrow-forward" className="size-4" />
          </ButtonLink>
          <Button variant="ghost" aria-label="add">
            <Plus className="size-5" aria-hidden="true" />
          </Button>
        </div>
      </Block>

      <Block title={c.fields}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={c.name} hint={c.nameHint} required>
            <Input name="sg-name" defaultValue={c.names[1]} autoComplete="off" />
          </Field>
          <Field label={c.phone} error={c.phoneError}>
            <PhoneInput name="sg-phone" defaultValue="۰۹۱۲ ۱۲۳ ۴۵۶۷" />
          </Field>
          <Field label={c.password}>
            <PasswordInput name="sg-pass" defaultValue="client-pass-1234" autoComplete="off" />
          </Field>
          <Field label={c.day}>
            <Select defaultValue="1">
              {c.days.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={c.goal} optional className="md:col-span-2">
            <Textarea placeholder={c.goalOptional} rows={3} />
          </Field>
        </div>
      </Block>

      <Block title={c.stepper}>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Field label={`${c.weight} (kg)`}>
            <NumberInput value={weight} onChange={setWeight} min={0} max={500} step={2.5} unit={locale === 'fa' ? 'کیلو' : 'kg'} size="xl" />
          </Field>
          <Field label={c.reps}>
            <NumberInput value={reps} onChange={setReps} min={1} max={100} step={1} size="xl" />
          </Field>
          <Field label={`${c.weight} (md)`} hint={`${c.typed}: ${free ?? '—'}`}>
            <NumberInput value={free} onChange={setFree} min={0} step={2.5} unit="kg" placeholder="0" />
          </Field>
          <div className="flex items-end">
            <Button
              variant="outline"
              fullWidth
              onClick={() => {
                setWeight(62.5);
                setReps(8);
              }}
            >
              {c.same}
            </Button>
          </div>
        </div>
        <Button size="xl" fullWidth>
          {locale === 'fa' ? 'ثبت ست' : 'Log set'}
        </Button>
      </Block>

      <Block title={c.stamps}>
        <div className="flex flex-wrap items-center gap-3">
          {STAMPS.map((s) => (
            <Stamp key={s} status={s} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Stamp key={stampKey} status="CONFIRMED" size="lg" land={stampKey > 0} />
          <Button variant="outline" size="sm" onClick={() => setStampKey((k) => k + 1)}>
            {c.land}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-6 border-[1.5px] border-rule-strong bg-card p-4">
          <Tally count={tally} animateNewest />
          <Button variant="outline" size="sm" onClick={() => setTally((n) => n + 1)}>
            {c.addStroke}
          </Button>
          <Tally count={3} size={20} />
          <Tally count={5} size={20} />
          <Tally count={12} size={20} />
        </div>
      </Block>

      <Block title={c.feedback}>
        <Flash tone="info">{c.flashInfo}</Flash>
        <Flash tone="success">{c.flashOk}</Flash>
        <Flash tone="warning">{c.flashWarn}</Flash>
        <Flash tone="error">{c.flashErr}</Flash>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => toast({ message: c.toastText, tone: 'success' })}>
            {c.toast}
          </Button>
          <Button variant="outline" onClick={() => toast({ message: c.flashErr, tone: 'error' })}>
            {c.toast} (error)
          </Button>
        </div>
        <EmptyState
          icon={CalendarDays}
          title={c.emptyTitle}
          description={c.emptyBody}
          action={<Button>{c.primary}</Button>}
        />
      </Block>

      <Block title={c.people}>
        <div className="flex flex-wrap items-center gap-4">
          {c.names.map((n) => (
            <div key={n} className="flex items-center gap-2">
              <Avatar name={n} />
              <span className="text-sm font-semibold">{n}</span>
            </div>
          ))}
          <Avatar name={c.names[0]} size="lg" />
          <Avatar name={c.names[1]} size="sm" />
        </div>
        <div className="flex items-center gap-4 text-ink">
          <DirIcon name="chevron-back" className="size-6" />
          <DirIcon name="chevron-forward" className="size-6" />
          <DirIcon name="arrow-back" className="size-6" />
          <DirIcon name="arrow-forward" className="size-6" />
          <Dumbbell className="size-6" aria-hidden="true" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="hatch flex min-h-14 items-center border-[1.5px] border-rule-strong px-3 text-sm font-semibold">
            {locale === 'fa' ? 'ساعت آزاد' : 'Open slot'}
          </div>
          <div className="flex min-h-14 items-center bg-paper-2 px-3 text-sm text-ink-2">
            {locale === 'fa' ? 'رزرو شده' : 'Booked'}
          </div>
        </div>
      </Block>

      <Block title={c.overlays}>
        <Tabs
          label={c.tabsLabel}
          tabs={c.tabs.map((label, i) => ({
            id: String(i),
            label,
            panel: <p className="text-base text-ink-2">{label}</p>,
          }))}
        />
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setSheet(true)}>
            {c.openSheet}
          </Button>
          <Button variant="outline" onClick={() => setDialog(true)}>
            {c.openDialog}
          </Button>
        </div>
        <Sheet
          open={sheet}
          onOpenChange={setSheet}
          title={c.sheetTitle}
          description={c.sheetBody}
          footer={
            <Button fullWidth onClick={() => setSheet(false)}>
              {c.primary}
            </Button>
          }
        >
          <Field label={c.goal} optional>
            <Textarea rows={3} />
          </Field>
        </Sheet>
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          role="alertdialog"
          title={c.dialogTitle}
          description={c.dialogBody}
          actions={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>
                {c.keep}
              </Button>
              <Button variant="danger" onClick={() => setDialog(false)}>
                {c.cancelIt}
              </Button>
            </>
          }
        />
      </Block>

      <Block title={c.barbell}>
        <Field label={`${c.weight} (kg)`}>
          <NumberInput value={barWeight} onChange={setBarWeight} min={0} step={2.5} unit="kg" />
        </Field>
        <BarbellDiagram weightKg={barWeight ?? 0} />
        <div className="grid gap-4 sm:grid-cols-2">
          <BarbellDiagram weightKg={20} compact />
          <BarbellDiagram weightKg={60} compact />
          <BarbellDiagram weightKg={140} compact />
          <BarbellDiagram weightKg={31} compact />
          <BarbellDiagram weightKg={15} compact />
          <BarbellDiagram weightKg={87.5} compact />
        </div>
      </Block>
    </div>
  );
}
