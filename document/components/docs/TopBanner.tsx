'use client';

import { useLayoutEffect, useRef } from 'react';
import { ArrowRight, Bell } from 'lucide-react';

type TopBannerProps = {
  lang: string;
};

/**
 * Renders the sticky Sealos Desktop launch banner for Chinese docs and syncs `--fd-banner-height`.
 */
export default function TopBanner({ lang }: TopBannerProps) {
  const ref = useRef<HTMLElement>(null);
  const visible = lang === 'zh-CN';

  useLayoutEffect(() => {
    const element = ref.current;
    if (!visible || element === null) {
      document.documentElement.style.removeProperty('--fd-banner-height');
      return;
    }

    const updateHeight = () => {
      document.documentElement.style.setProperty(
        '--fd-banner-height',
        `${Math.ceil(element.getBoundingClientRect().height)}px`
      );
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--fd-banner-height');
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <aside
      ref={ref}
      aria-label="Sealos Desktop 正式上线"
      className="sticky top-0 z-40 border-b border-fd-border/60 bg-fd-background/95 backdrop-blur-md px-3 py-1.5 md:px-6 md:py-2"
    >
      <style>{':root { --fd-banner-height: 76px; }'}</style>
      <div className="mx-auto flex w-full items-center justify-between gap-3 rounded-[14px] border border-[#DCE6F7] bg-[linear-gradient(90deg,#F4F6FF_0%,#F8FAFF_45%,#EAF3FF_100%)] px-3.5 py-2.5 md:px-5 md:py-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-[#1E3A5F]/70 dark:bg-[linear-gradient(90deg,#0F172A_0%,#111C35_45%,#0F213E_100%)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
        <div className="flex min-w-0 items-center gap-3 md:gap-3.5">
          <div className="flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#0066FF] shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border dark:border-blue-400/20 dark:bg-blue-500/15 dark:text-[#60A5FA] dark:shadow-none">
            <Bell size={18} strokeWidth={2} aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 text-left">
            <p className="text-[14px] md:text-[15px] font-semibold leading-[20px] text-[#0066FF] dark:text-[#60A5FA]">
              Sealos Desktop 正式上线
            </p>
            <p className="text-[12px] md:text-[13px] leading-[18px] text-[#64748B] dark:text-slate-300">
              Agent 一句话上线本地代码，现在下载登录，即可领取{' '}
              <span className="font-medium text-[#0066FF] dark:text-[#60A5FA]">¥10 首登礼</span>
              ，快来体验！
            </p>
          </div>
        </div>
        <a
          href="https://sealos.cn/downloads?utm_source=fastgpt_docs&utm_medium=referral&utm_campaign=sealos_desktop_launch&utm_content=top_banner"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-white px-3.5 py-2 md:px-4 md:py-2 text-[12px] md:text-[13px] font-medium text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066FF] dark:border dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:shadow-none dark:hover:bg-white/15 dark:focus-visible:outline-[#60A5FA]"
        >
          <span>查看完整详情</span>
          <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
        </a>
      </div>
    </aside>
  );
}
