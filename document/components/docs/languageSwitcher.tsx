'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  getProductionDocsUrl,
  isPreviewDocsSite,
  stripDocsLocalePrefix,
  type FastGPTDocsLocale
} from '@/lib/fastgpt-home-url';

const LANG_PREF_KEY = 'fastgpt_docs_lang_pref';
const LANG_DISMISS_KEY = 'fastgpt_docs_lang_notice_dismissed';

const localeFlags: Record<string, string> = {
  en: '🇺🇸',
  'zh-CN': '🇨🇳'
};

const defaultLocales: Array<{ locale: FastGPTDocsLocale; name: string }> = [
  { locale: 'en', name: 'English' },
  { locale: 'zh-CN', name: '简体中文' }
];

type LanguageSwitcherProps = {
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
};

/** Render a dropdown language selector displaying the active language and crawlable alternate link. */
export function LanguageSwitcher({
  className,
  buttonClassName,
  menuClassName
}: LanguageSwitcherProps) {
  const { locale, locales = [], onChange } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [suggestedLocale, setSuggestedLocale] = useState<FastGPTDocsLocale | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const currentLocale: FastGPTDocsLocale = locale === 'en' ? 'en' : 'zh-CN';
  const stripped = stripDocsLocalePrefix(pathname);
  const isPreview = isPreviewDocsSite();
  const availableLocales = locales.length > 0 ? locales : defaultLocales;

  const buildOptionHref = (targetLocale: FastGPTDocsLocale): string => {
    if (isPreview) {
      return stripped.pathname === '/'
        ? `/${targetLocale}`
        : `/${targetLocale}${stripped.pathname}`;
    }
    return getProductionDocsUrl(targetLocale, stripped.pathname);
  };

  const persistPreferredLocale = (targetLocale: FastGPTDocsLocale) => {
    try {
      window.localStorage.setItem(LANG_PREF_KEY, targetLocale);
    } catch {
      // Ignore storage failures in restricted browsing contexts.
    }
  };

  const navigateToLocale = (targetLocale: FastGPTDocsLocale, targetHref: string) => {
    persistPreferredLocale(targetLocale);
    setSuggestedLocale(null);
    setOpen(false);

    const isProductionHostname = ['doc.fastgpt.cn', 'doc.fastgpt.io'].includes(
      window.location.hostname
    );
    if (!isPreviewDocsSite() || isProductionHostname) {
      window.location.assign(
        `${getProductionDocsUrl(targetLocale, stripped.pathname)}${window.location.search}${window.location.hash}`
      );
      return;
    }

    if (window.location.search !== '' || window.location.hash !== '') {
      window.location.assign(`${targetHref}${window.location.search}${window.location.hash}`);
      return;
    }

    onChange?.(targetLocale);
  };

  useEffect(() => {
    setOpen(false);
  }, [pathname, currentLocale]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    try {
      const savedPref = window.localStorage.getItem(LANG_PREF_KEY);
      const dismissed = window.localStorage.getItem(LANG_DISMISS_KEY);
      if (savedPref !== null || dismissed !== null) {
        setSuggestedLocale(null);
        return;
      }
    } catch {
      return;
    }

    const browserLanguages =
      navigator.languages !== undefined && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];

    const detectedLocale = (() => {
      for (const entry of browserLanguages) {
        if (/^zh\b/i.test(entry)) {
          return 'zh-CN' as const;
        }
        if (/^en\b/i.test(entry)) {
          return 'en' as const;
        }
      }
      return null;
    })();

    const isAvailable =
      detectedLocale !== null && availableLocales.some((item) => item.locale === detectedLocale);
    if (isAvailable && detectedLocale !== currentLocale) {
      setSuggestedLocale(detectedLocale);
      return;
    }

    setSuggestedLocale(null);
  }, [availableLocales, currentLocale]);

  const dismissNotice = () => {
    try {
      window.localStorage.setItem(LANG_DISMISS_KEY, '1');
    } catch {
      // Ignore storage failures in restricted browsing contexts.
    }
    setSuggestedLocale(null);
  };

  const currentItem = availableLocales.find((item) => item.locale === currentLocale);
  const currentLabel = currentItem?.name ?? (currentLocale === 'en' ? 'English' : '简体中文');
  const suggestedHref = suggestedLocale !== null ? buildOptionHref(suggestedLocale) : undefined;

  return (
    <>
      <div ref={containerRef} className={cn('relative flex shrink-0', className)}>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={currentLocale === 'en' ? 'Choose language' : '选择语言'}
          data-open={open}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-fd-border bg-fd-background px-2.5 text-xs font-medium text-fd-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-primary/30 data-[open=true]:bg-fd-accent data-[open=true]:text-fd-accent-foreground',
            buttonClassName
          )}
        >
          <span
            className="flex size-5 shrink-0 items-center justify-center text-base leading-none"
            aria-hidden="true"
          >
            {localeFlags[currentLocale] ?? '🌐'}
          </span>
          <span className="min-w-0 truncate">{currentLabel}</span>
          <ChevronDown
            className={cn(
              'ms-auto size-3.5 shrink-0 text-fd-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>
        <div
          role="listbox"
          aria-label={currentLocale === 'en' ? 'Languages' : '语言列表'}
          hidden={!open}
          className={cn(
            'absolute right-0 bottom-full z-50 mb-2 flex min-w-[11rem] flex-col gap-1 overflow-hidden rounded-xl border bg-fd-popover/95 p-1 text-sm text-fd-popover-foreground shadow-lg backdrop-blur-lg',
            !open && 'hidden',
            menuClassName
          )}
        >
          {availableLocales.map((item) => {
            const optionLocale: FastGPTDocsLocale = item.locale === 'en' ? 'en' : 'zh-CN';
            const active = optionLocale === currentLocale;
            const optionClassName = cn(
              'flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-fd-popover-foreground transition-colors hover:bg-fd-accent',
              active && 'font-semibold text-[#3370FF] dark:text-blue-400'
            );
            const optionContent = (
              <>
                <span
                  className="flex size-5 shrink-0 items-center justify-center text-base leading-none"
                  aria-hidden="true"
                >
                  {localeFlags[optionLocale] ?? '🌐'}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <Check
                  className={cn(
                    'size-3.5 shrink-0 text-[#3370FF] dark:text-blue-400',
                    !active && 'invisible'
                  )}
                  aria-hidden="true"
                />
              </>
            );

            if (active) {
              return (
                <button
                  key={optionLocale}
                  type="button"
                  role="option"
                  aria-selected={true}
                  onClick={() => setOpen(false)}
                  className={optionClassName}
                >
                  {optionContent}
                </button>
              );
            }

            const optionHref = buildOptionHref(optionLocale);
            return (
              <a
                key={optionLocale}
                href={optionHref}
                hrefLang={optionLocale}
                lang={optionLocale}
                data-language-switch={optionLocale}
                role="option"
                aria-selected={false}
                onClick={(event) => {
                  if (
                    event.button === 0 &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !event.altKey
                  ) {
                    event.preventDefault();
                    navigateToLocale(optionLocale, optionHref);
                  } else {
                    persistPreferredLocale(optionLocale);
                    setSuggestedLocale(null);
                    setOpen(false);
                  }
                }}
                className={optionClassName}
              >
                {optionContent}
              </a>
            );
          })}
        </div>
      </div>
      {suggestedLocale !== null &&
        suggestedHref !== undefined &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="region"
            aria-label={suggestedLocale === 'zh-CN' ? '语言切换提示' : 'Language suggestion'}
            className="fixed right-4 bottom-4 z-50 flex items-center gap-2.5 rounded-xl border border-fd-border bg-fd-background/95 px-3.5 py-2 text-xs text-fd-foreground shadow-lg backdrop-blur-sm"
          >
            <span>
              {suggestedLocale === 'zh-CN'
                ? '检测到中文浏览器环境'
                : 'English documentation available'}
            </span>
            <a
              href={suggestedHref}
              hrefLang={suggestedLocale}
              lang={suggestedLocale}
              onClick={(event) => {
                persistPreferredLocale(suggestedLocale);
                if (
                  event.button === 0 &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey
                ) {
                  event.preventDefault();
                  navigateToLocale(suggestedLocale, suggestedHref);
                } else {
                  setSuggestedLocale(null);
                }
              }}
              className="font-medium text-[#3370FF] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-primary/40 dark:text-blue-400"
            >
              {suggestedLocale === 'zh-CN' ? '切换至中文文档' : 'Switch to English'}
            </a>
            <button
              type="button"
              aria-label={
                suggestedLocale === 'zh-CN' ? '关闭语言切换提示' : 'Dismiss language suggestion'
              }
              onClick={dismissNotice}
              className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-primary/40"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
