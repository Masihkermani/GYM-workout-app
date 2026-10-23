'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { cn } from '@/lib/cn';
import { dirOf } from '@/i18n/routing';

export interface TabItem {
  id: string;
  label: ReactNode;
  panel: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Controlled selected tab id. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Accessible name for the tab list. */
  label: string;
  className?: string;
}

/** Ledger-style tabs (ARIA tabs pattern). Arrow keys follow the visual direction, so they mirror in RTL. */
export function Tabs({ tabs, value, defaultValue, onValueChange, label, className }: TabsProps) {
  const base = useId();
  const locale = useLocale();
  const rtl = dirOf(locale) === 'rtl';
  const [inner, setInner] = useState(defaultValue ?? tabs.find((t) => !t.disabled)?.id ?? tabs[0]?.id);
  const selected = value ?? inner;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: string) => {
    if (value === undefined) setInner(id);
    onValueChange?.(id);
  };

  const enabled = tabs.filter((t) => !t.disabled);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = enabled.findIndex((t) => t.id === selected);
    if (index === -1) return;
    const nextKey = rtl ? 'ArrowLeft' : 'ArrowRight';
    const prevKey = rtl ? 'ArrowRight' : 'ArrowLeft';
    let target: number | null = null;
    if (e.key === nextKey) target = (index + 1) % enabled.length;
    else if (e.key === prevKey) target = (index - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = enabled.length - 1;
    if (target == null) return;
    e.preventDefault();
    const next = enabled[target];
    select(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex overflow-x-auto border-b-[1.5px] border-rule-strong"
      >
        {tabs.map((tab) => {
          const active = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => select(tab.id)}
              className={cn(
                '-mb-[1.5px] min-h-11 shrink-0 border-b-[3px] px-4 text-base font-semibold tx disabled:opacity-45',
                active ? 'border-ink text-ink' : 'border-transparent text-ink-2 hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={tab.id !== selected}
          tabIndex={0}
          className="pt-4"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
