'use client';

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
        onSelect: () => onChange?.(item.locale)
      }))}
    />
  );
}
