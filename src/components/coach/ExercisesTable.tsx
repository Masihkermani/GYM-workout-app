import { getTranslations } from 'next-intl/server';
import { DirIcon } from '@/components/ui/DirIcon';
import { Stamp } from '@/components/ui/Stamp';
import { Link } from '@/i18n/navigation';
import { joinMeta } from './format';
import { taxonomyDict, taxonomyLabel } from './taxonomy';
import type { ExerciseListItem } from './queries';

export interface ExercisesTableProps {
  items: ExerciseListItem[];
  locale: string;
  /** Query string of the current filters (no `edit`), so the editor link keeps the list as it was. */
  baseQuery: string;
}

function ExerciseName({ item, locale, missing }: { item: ExerciseListItem; locale: string; missing: string }) {
  const primary = locale === 'fa' ? (item.nameFa ?? item.nameEn) : item.nameEn;
  const secondary = locale === 'fa' ? (item.nameFa ? item.nameEn : null) : item.nameFa;
  return (
    <span className="block min-w-0">
      <bdi className="block truncate font-semibold text-ink">{primary}</bdi>
      {secondary ? (
        <bdi className="block truncate text-sm text-ink-2" dir={locale === 'fa' ? 'ltr' : 'rtl'}>
          {secondary}
        </bdi>
      ) : locale === 'en' ? (
        <span className="block text-sm text-ink-3">{missing}</span>
      ) : null}
    </span>
  );
}

export async function ExercisesTable({ items, locale, baseQuery }: ExercisesTableProps) {
  const t = await getTranslations({ locale, namespace: 'coach' });
  const body = taxonomyDict(t, 'bodyPart');
  const gear = taxonomyDict(t, 'equipment');
  const target = taxonomyDict(t, 'target');
  const editHref = (id: string) => `/coach/exercises?${baseQuery ? `${baseQuery}&` : ''}edit=${encodeURIComponent(id)}`;

  const flags = (item: ExerciseListItem) => (
    <>
      {item.isCustom ? <Stamp status="CONFIRMED" size="sm" label={t('exercises.flag.custom')} /> : null}
      {item.archived ? <Stamp status="CANCELLED" size="sm" label={t('exercises.flag.archived')} /> : null}
    </>
  );

  return (
    <>
      <div className="hidden border-[1.5px] border-rule-strong bg-card md:block">
        <table className="w-full border-collapse text-start text-base">
          <caption className="sr-only">{t('exercises.title')}</caption>
          <thead className="border-b-[1.5px] border-rule-strong text-sm">
            <tr>
              <th scope="col" className="min-h-11 px-3 py-2.5 text-start font-bold">
                {t('exercises.col.name')}
              </th>
              <th scope="col" className="px-3 py-2.5 text-start font-bold">
                {t('exercises.col.bodyPart')}
              </th>
              <th scope="col" className="px-3 py-2.5 text-start font-bold">
                {t('exercises.col.equipment')}
              </th>
              <th scope="col" className="px-3 py-2.5 text-start font-bold">
                {t('exercises.col.target')}
              </th>
              <th scope="col" className="px-3 py-2.5 text-start font-bold">
                <span className="sr-only">{t('exercises.col.flags')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="relative border-b border-rule last:border-b-0 tx hover:bg-paper-2">
                <th scope="row" className="max-w-[22rem] px-3 py-1.5 text-start font-normal">
                  <Link
                    href={editHref(item.id)}
                    scroll={false}
                    aria-label={t('exercises.editAria', { name: locale === 'fa' ? (item.nameFa ?? item.nameEn) : item.nameEn })}
                    className="flex min-h-11 items-center after:absolute after:inset-0 after:content-['']"
                  >
                    <ExerciseName item={item} locale={locale} missing={t('exercises.noPersian')} />
                  </Link>
                </th>
                <td className="px-3 py-1.5 text-ink-2">{taxonomyLabel(body, item.bodyPart)}</td>
                <td className="px-3 py-1.5 text-ink-2">{taxonomyLabel(gear, item.equipment)}</td>
                <td className="px-3 py-1.5 text-ink-2">{taxonomyLabel(target, item.target)}</td>
                <td className="px-3 py-1.5">
                  <span className="flex flex-wrap gap-1.5">{flags(item)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="border-[1.5px] border-rule-strong bg-card md:hidden">
        {items.map((item) => (
          <li key={item.id} className="relative border-b border-rule last:border-b-0">
            <Link
              href={editHref(item.id)}
              scroll={false}
              aria-label={t('exercises.editAria', { name: locale === 'fa' ? (item.nameFa ?? item.nameEn) : item.nameEn })}
              className="flex min-h-16 items-center gap-3 px-3 py-2.5 after:absolute after:inset-0 after:content-['']"
            >
              <span className="min-w-0 flex-1">
                <ExerciseName item={item} locale={locale} missing={t('exercises.noPersian')} />
                <span className="mt-0.5 block truncate text-sm text-ink-2">
                  {joinMeta([taxonomyLabel(body, item.bodyPart), taxonomyLabel(gear, item.equipment)], locale)}
                </span>
                {item.isCustom || item.archived ? <span className="mt-1 flex flex-wrap gap-1.5">{flags(item)}</span> : null}
              </span>
              <DirIcon name="chevron-forward" className="size-5 shrink-0 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
