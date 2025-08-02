import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { i18n } from '@/lib/i18n';

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions = (locale: string): BaseLayoutProps => {
  return {
    themeSwitch: {
      enabled: true,
      mode: 'light-dark'
    },
    nav: {
      title: (
        <div className="flex flex-col">
          <div className="flex flex-row items-center gap-2">
            <img src="/FastGPT-full.svg" alt="FastGPT" width={49} height={48} />
          </div>
        </div>
      )
    },
    // i18n: {
    //   languages: ['zh-CN', 'en'],
    //   defaultLanguage: 'zh-CN',
    //   hideLocale: 'always'
    // },
    searchToggle: {
      enabled: true
    }
  };
};
