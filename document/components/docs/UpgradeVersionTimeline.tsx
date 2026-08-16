import { ArrowUpRight, CalendarDays } from 'lucide-react';

export type UpgradeVersionTimelineItem = {
  title: string;
  url: string;
  releaseTime?: string;
  upgradeTags: string[];
};

type UpgradeVersionTimelineProps = {
  items: UpgradeVersionTimelineItem[];
  language: string;
};

/**
 * 展示升级文档的版本时间轴。
 * 没有 releaseTime 的版本放在最前面；其余版本按发布时间倒序排列。
 * 没有 releaseTime 的版本视为进行中的版本，并使用强调色标识。
 */
export function UpgradeVersionTimeline({ items, language }: UpgradeVersionTimelineProps) {
  const isEnglish = language === 'en';
  const labels = isEnglish
    ? {
        count: 'versions',
        latest: 'Latest release',
        inProgress: 'In progress',
        description: 'A chronological record of FastGPT self-hosted releases.'
      }
    : {
        count: '个版本',
        latest: '最新发布',
        inProgress: '进行中',
        description: 'FastGPT 自部署版本的发布时间记录。'
      };

  const sortedItems = [...items].sort((a, b) => {
    if (!a.releaseTime && b.releaseTime) return -1;
    if (a.releaseTime && !b.releaseTime) return 1;
    if (!a.releaseTime && !b.releaseTime) return b.title.localeCompare(a.title);
    return b.releaseTime!.localeCompare(a.releaseTime!);
  });
  const latestReleaseUrl = sortedItems.find((item) => item.releaseTime)?.url;

  return (
    <section className="not-prose my-10 overflow-hidden rounded-2xl border border-fd-border bg-fd-card">
      <div className="border-b border-fd-border bg-fd-muted/30 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 text-base font-semibold text-fd-card-foreground">
            <CalendarDays aria-hidden="true" className="size-4 text-fd-primary" />
            <span>{items.length}</span>
            <span>{labels.count}</span>
          </div>
          <span className="rounded-full border border-fd-border px-2 py-0.5 text-xs text-fd-muted-foreground">
            {isEnglish ? 'Release history' : '版本记录'}
          </span>
        </div>
        <p className="mb-0 mt-1.5 text-sm text-fd-muted-foreground">{labels.description}</p>
      </div>

      <div className="relative mx-5 sm:mx-6">
        <div
          aria-hidden="true"
          className="absolute bottom-5 left-[6.75rem] top-5 w-px bg-fd-border sm:left-[7.25rem]"
        />
        <div className="divide-y divide-fd-border">
          {sortedItems.map((item) => {
            const isInProgress = !item.releaseTime;
            const isLatest = item.url === latestReleaseUrl;

            return (
              <a
                className={`group relative grid grid-cols-[5.5rem_1rem_minmax(0,1fr)] gap-3 py-4 transition-colors sm:grid-cols-[6rem_1rem_minmax(0,1fr)] ${
                  isLatest
                    ? 'bg-blue-500/5 hover:bg-blue-500/10 dark:bg-blue-400/5 dark:hover:bg-blue-400/10'
                    : isInProgress
                      ? 'bg-amber-500/5 hover:bg-amber-500/10'
                      : 'hover:bg-emerald-500/5'
                }`}
                href={item.url}
                key={item.url}
              >
                <div className="flex min-w-0 flex-col items-end gap-1 pt-0.5 sm:items-start">
                  {item.releaseTime ? (
                    <time
                      className={`whitespace-nowrap font-mono text-xs tabular-nums ${
                        isLatest
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                      dateTime={item.releaseTime}
                    >
                      {item.releaseTime}
                    </time>
                  ) : (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-600 dark:text-amber-300">
                      {labels.inProgress}
                    </span>
                  )}
                </div>

                <div className="relative flex justify-center">
                  <span
                    className={`z-10 mt-1.5 size-2.5 rounded-full border-2 border-fd-card ${
                      isLatest
                        ? 'bg-blue-500 ring-4 ring-blue-500/20 dark:bg-blue-400 dark:ring-blue-400/20'
                        : isInProgress
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }`}
                  />
                </div>

                <div className="min-w-0">
                  <div
                    className={`flex items-center gap-1 text-sm font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 ${
                      isLatest
                        ? 'text-blue-600 dark:text-blue-400'
                        : isInProgress
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-fd-card-foreground'
                    }`}
                  >
                    <span className="truncate">{item.title}</span>
                    {isLatest && (
                      <span className="shrink-0 rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-blue-600 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-300">
                        {labels.latest}
                      </span>
                    )}
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </div>
                  {item.upgradeTags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.upgradeTags.map((tag) => (
                        <span
                          className="rounded border border-fd-border bg-fd-muted/50 px-1.5 py-0.5 text-[10px] leading-none text-fd-muted-foreground"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
