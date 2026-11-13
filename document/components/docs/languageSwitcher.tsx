'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { X } from 'lucide-react';
import { SwitcherDropdown } from '@/components/docs/switcherDropdown';
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

type LanguageSwitcherProps = {
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
};

/** Render crawlable locale switcher links and a client-only browser-language suggestion notice. */
export function LanguageSwitcher({
  className,
  buttonClassName,
  menuClassName
}: LanguageSwitcherProps) {
  const { locale, locales = [], onChange } = useI18n();
  const pathname = usePathname();
  const [suggestedLocale, setSuggestedLocale] = useState<FastGPTDocsLocale | null>(null);

  const currentLocale: FastGPTDocsLocale = locale === 'en' ? 'en' : 'zh-CN';
  const stripped = stripDocsLocalePrefix(pathname);
  const isPreview = isPreviewDocsSite();

  const buildOptionHref = (targetLocale: FastGPTDocsLocale): string => {
    if (isPreview) {
      return stripped.pathname === '/' ? `/${targetLocale}` : `/${targetLocale}${stripped.pathname}`;
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
      detectedLocale !== null && locales.some((item) => item.locale === detectedLocale);
    if (isAvailable && detectedLocale !== currentLocale) {
      setSuggestedLocale(detectedLocale);
      return;
    }

    setSuggestedLocale(null);
  }, [currentLocale, locales]);

  const dismissNotice = () => {
    try {
      window.localStorage.setItem(LANG_DISMISS_KEY, '1');
    } catch {
      // Ignore storage failures in restricted browsing contexts.
    }
    setSuggestedLocale(null);
  };

  const suggestedHref =
    suggestedLocale !== null ? buildOptionHref(suggestedLocale) : undefined;

  return (
    <>
      <SwitcherDropdown
        className={className}
        triggerClassName={buttonClassName}
        contentClassName={menuClassName}
        options={locales.map((item) => {
          const targetLocale: FastGPTDocsLocale = item.locale === 'en' ? 'en' : 'zh-CN';
          const href = buildOptionHref(targetLocale);

          return {
            key: item.locale,
            label: item.name,
            icon: (
              <span className="text-base leading-none">{localeFlags[item.locale] ?? '🌐'}</span>
            ),
            href,
            hrefLang: targetLocale,
            lang: targetLocale,
            external: false,
            active: item.locale === locale,
            onSelect: () => navigateToLocale(targetLocale, href)
          };
        })}
      />
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
