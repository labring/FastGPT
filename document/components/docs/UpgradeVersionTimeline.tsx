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
        inProgress: 'In progress',
        description: 'A chronological record of FastGPT self-hosted releases.'
      }
    : {
        count: '个版本',
        inProgress: '进行中',
        description: 'FastGPT 自部署版本的发布时间记录。'
      };

  const sortedItems = [...items].sort((a, b) => {
    if (!a.releaseTime && b.releaseTime) return -1;
    if (a.releaseTime && !b.releaseTime) return 1;
    if (!a.releaseTime && !b.releaseTime) return b.title.localeCompare(a.title);
    return b.releaseTime!.localeCompare(a.releaseTime!);
  });

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

            return (
              <a
                className="group relative grid grid-cols-[5.5rem_1rem_minmax(0,1fr)] gap-3 py-4 transition-colors hover:bg-fd-accent/50 sm:grid-cols-[6rem_1rem_minmax(0,1fr)]"
                href={item.url}
                key={item.url}
              >
                <div className="flex min-w-0 flex-col items-end gap-1 pt-0.5 sm:items-start">
                  {item.releaseTime ? (
                    <time
                      className="whitespace-nowrap font-mono text-xs tabular-nums text-fd-muted-foreground"
                      dateTime={item.releaseTime}
                    >
                      {item.releaseTime}
                    </time>
                  ) : (
                    <span className="rounded-full border border-fd-primary/30 bg-fd-primary/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-fd-primary">
                      {labels.inProgress}
                    </span>
                  )}
                </div>

                <div className="relative flex justify-center">
                  <span
                    className={`z-10 mt-1.5 size-2.5 rounded-full border-2 border-fd-card ${
                      isInProgress ? 'bg-fd-primary' : 'bg-fd-muted-foreground/50'
                    }`}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-sm font-medium text-fd-card-foreground group-hover:text-fd-primary">
                    <span className="truncate">{item.title}</span>
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
