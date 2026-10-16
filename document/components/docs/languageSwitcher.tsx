'use client';

import { usePathname } from 'next/navigation';
import { getFastGPTDocsOriginForLocale } from '@/lib/docs-locale';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { SwitcherDropdown } from '@/components/docs/switcherDropdown';

const localeFlags: Record<string, string> = {
  en: '🇺🇸',
  'zh-CN': '🇨🇳'
};

type LanguageSwitcherProps = {
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
};

export function LanguageSwitcher({
  className,
  buttonClassName,
  menuClassName
}: LanguageSwitcherProps) {
  const { locale, locales = [], onChange } = useI18n();
  const pathname = usePathname();

  return (
    <SwitcherDropdown
      className={className}
      triggerClassName={buttonClassName}
      contentClassName={menuClassName}
      options={locales.map((item) => ({
        key: item.locale,
        label: item.name,
        icon: <span className="text-base leading-none">{localeFlags[item.locale] ?? '🌐'}</span>,
        active: item.locale === locale,
        onSelect: () => {
          const productionHost = ['doc.fastgpt.cn', 'doc.fastgpt.io'].includes(window.location.hostname);
          if (productionHost && (item.locale === 'en' || item.locale === 'zh-CN')) {
            const path = pathname.replace(/^\/(en|zh-CN)(?=\/|$)/, `/${item.locale}`);
            window.location.assign(`${getFastGPTDocsOriginForLocale(item.locale)}${path}${window.location.search}`);
          } else {
            onChange?.(item.locale);
          }
        }
      }))}
    />
  );
}
