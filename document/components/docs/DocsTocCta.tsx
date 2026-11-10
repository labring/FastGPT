'use client';

import { useState } from 'react';
import { CommercialContactDialog } from '@/components/docs/CommercialContactDialog';

type DocsTocCtaProps = {
  lang: string;
};

const secondaryButtonClassName =
  'inline-flex min-h-8 w-full items-center justify-center rounded-full bg-white px-4 py-1.5 text-xs font-medium text-[#0F172A] no-underline ring-1 ring-black/10 transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A] focus-visible:ring-offset-2 dark:bg-white/10 dark:text-slate-100 dark:ring-white/15 dark:hover:bg-white/15 dark:focus-visible:ring-white/40';

export function DocsTocCta({ lang }: DocsTocCtaProps) {
  const [open, setOpen] = useState(false);
  const isEn = lang === 'en';

  const title = isEn ? 'Put your business knowledge to work with AI' : '准备好开始了吗？';
  const description = isEn
    ? 'Import company documents and build accurate, reliable, traceable AI answers.'
    : '让你的企业知识真正被 AI 用起来';
  const consultLabel = isEn ? 'Contact Sales' : '商务咨询';
  const trialLabel = isEn ? 'Start for free' : '免费开始';
  const priceLabel = isEn ? 'View pricing' : '查看价格';

  const trialHref = isEn
    ? 'https://cloud.fastgpt.io/?utm_source=docs&utm_medium=referral&utm_campaign=docs_toc_cta&utm_content=trial'
    : 'https://cloud.fastgpt.cn/?utm_source=docs&utm_medium=referral&utm_campaign=docs_toc_cta&utm_content=trial';
  const priceHref = isEn
    ? 'https://fastgpt.io/price?utm_source=docs&utm_medium=referral&utm_campaign=docs_toc_cta&utm_content=pricing'
    : 'https://fastgpt.cn/zh/price?utm_source=docs&utm_medium=referral&utm_campaign=docs_toc_cta&utm_content=pricing';
  const contactUrl = `https://fastgpt.cn/${isEn ? 'en' : 'zh'}/contact/embed?source=docs&utm_source=docs&utm_medium=referral&utm_campaign=docs_toc_cta&utm_content=business_consultation`;

  return (
    <div className="mt-3 rounded-2xl bg-blue-50 p-4 text-[#0F172A] shadow-sm dark:border dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-fd-foreground">
      <p className="m-0 text-base font-medium text-balance">{title}</p>
      <p className="m-0 mt-2 text-sm text-[#334155] dark:text-fd-muted-foreground">{description}</p>
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`${consultLabel}: ${title}`}
          className="inline-flex min-h-8 w-full cursor-pointer items-center justify-center rounded-full bg-[#0F172A] px-4 py-1.5 text-xs font-medium text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F172A] focus-visible:ring-offset-2 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400 dark:focus-visible:ring-blue-400"
        >
          {consultLabel}
        </button>
        <a
          href={trialHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${trialLabel}: ${title}`}
          className={secondaryButtonClassName}
        >
          {trialLabel}
        </a>
        <a
          href={priceHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${priceLabel}: ${title}`}
          className={secondaryButtonClassName}
        >
          {priceLabel}
        </a>
      </div>
      <CommercialContactDialog
        url={contactUrl}
        title={isEn ? 'Contact FastGPT' : '联系 FastGPT'}
        description={
          isEn
            ? "We'll get in touch with you within 1–3 business days."
            : '我们将在 1～3 个工作日内与您取得联系'
        }
        closeLabel={isEn ? 'Close contact dialog' : '关闭咨询窗口'}
        open={open}
        onOpenChange={setOpen}
        showTrigger={false}
      />
    </div>
  );
}

export default DocsTocCta;
