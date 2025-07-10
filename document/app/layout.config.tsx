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
    i18n,
    githubUrl: 'https://github.com/labring/FastGPT',
    nav: {
      title: (
        <>
          <img src="/logo.svg" alt="FastGPT" width={49} height={48} style={{ display: 'inline' }} />
          FastGPT
        </>
      )
    }
  };
};
