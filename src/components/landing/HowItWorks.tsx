import { getTranslations } from 'next-intl/server';
import { formatNumber } from '@/lib/format';

/**
 * Three short ruled lines. The numbers are real: it is a sequence (pick, confirm, train), which is
 * the one place docs/DESIGN.md allows numbering. Not cards.
 */
export async function HowItWorks({
  locale,
  cancelWindowHours,
  requireApproval,
}: {
  locale: string;
  cancelWindowHours: number;
  requireApproval: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'landing' });
  const steps = [
    { title: t('how.pick.title'), body: t('how.pick.body') },
    {
      title: t('how.confirm.title'),
      body: t(requireApproval ? 'how.confirm.bodyApproval' : 'how.confirm.bodyInstant', { hours: cancelWindowHours }),
    },
    { title: t('how.train.title'), body: t('how.train.body') },
  ];

  return (
    <ol data-testid="how-it-works" className="border-y-[1.5px] border-rule-strong">
      {steps.map((step, i) => (
        <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-b border-rule py-4 last:border-b-0 sm:grid-cols-[3rem_1fr]">
          <span className="num text-3xl leading-none text-ink-2" aria-hidden="true">
            {formatNumber(i + 1, locale, { grouping: false })}
          </span>
          <div>
            <h3 className="text-xl font-bold">
              <span className="sr-only">{formatNumber(i + 1, locale, { grouping: false })}. </span>
              {step.title}
            </h3>
            <p className="mt-1 text-base text-ink-2">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
