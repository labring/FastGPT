import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { i18n } from '@/lib/i18n';
import Image from 'next/image';

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
        <div className="flex flex-row items-center gap-2">
          <Image src="/logo.svg" alt="FastGPT" width={30} height={30} />
          <span className="font-semibold text-lg">FastGPT</span>
        </div>
      )
    },
    i18n: true,
    searchToggle: {
      enabled: true
    }
  };
};
