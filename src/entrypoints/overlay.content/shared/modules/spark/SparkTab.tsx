import React from 'react';
import {
  ListChecks,
  CalendarClock,
  Wand2,
  Blocks,
  ChevronRight,
} from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { navigate } from '@/shared/lib/navigation';

/** Spark is behind an A/B flag; its mode switcher toggle is the tell. */
export const isSparkAvailable = () =>
  document.querySelector(
    'mode-switcher-toggle, .mode-switcher-toggle, [data-test-id="mode-switcher-toggle"]',
  ) !== null;

const SPARK_LINKS = [
  { key: 'tasks', path: '/spark/tasks', icon: ListChecks },
  { key: 'schedules', path: '/spark/schedules', icon: CalendarClock },
  { key: 'skills', path: '/spark/skills', icon: Wand2 },
  { key: 'apps', path: '/spark/apps', icon: Blocks },
] as const;

export const SparkTab = () => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full w-full">
      <div className="tab-header p-3 flex items-center justify-between h-12 shrink-0">
        <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground/70">
          {t('tabs.spark')}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="flex flex-col gap-1">
          {SPARK_LINKS.map(({ key, path, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => navigate(path)}
              className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm text-foreground/90 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent-foreground" />
              <span className="flex-1 truncate">{t(`spark.${key}`)}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
