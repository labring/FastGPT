'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useCurrentLang, useLocalizedPath } from '@/lib/localized-navigation';

const exactMap: Record<string, string> = {
  '/docs': '/docs/introduction',
  '/docs/intro': '/docs/introduction',
  '/docs/guide/dashboard/workflow/coreferenceresolution':
    '/docs/introduction/guide/dashboard/workflow/coreferenceResolution',
  '/docs/guide/admin/sso_dingtalk':
    '/docs/introduction/guide/admin/sso#/docs/introduction/guide/admin/sso#钉钉',
  '/docs/guide/knowledge_base/rag': '/docs/introduction/guide/knowledge_base/RAG',
  '/docs/commercial/intro/': '/docs/introduction/commercial',
  '/docs/upgrading/intro/': '/docs/upgrading',
  '/docs/introduction/shopping_cart/intro/': '/docs/introduction/commercial'
};

const prefixMap: Record<string, string> = {
  '/docs/development': '/docs/introduction/development',
  '/docs/FAQ': '/docs/faq',
  '/docs/guide': '/docs/introduction/guide',
  '/docs/shopping_cart': '/docs/introduction/shopping_cart',
  '/docs/agreement': '/docs/protocol',
  '/docs/introduction/development/openapi': '/docs/openapi'
};

const fallbackRedirect = '/docs/introduction';

export default function NotFound() {
  const pathname = usePathname();
  const lang = useCurrentLang();
  const getLocalizedPath = (path: string) => useLocalizedPath(path);

  useEffect(() => {
    (async () => {
      // Remove language prefix from pathname for matching
      const pathWithoutLang = pathname.replace(new RegExp(`^/${lang}`), '');

      if (exactMap[pathWithoutLang]) {
        window.location.replace(getLocalizedPath(exactMap[pathWithoutLang]));
        return;
      }

      for (const [oldPrefix, newPrefix] of Object.entries(prefixMap)) {
        if (pathWithoutLang.startsWith(oldPrefix)) {
          const rest = pathWithoutLang.slice(oldPrefix.length);
          window.location.replace(getLocalizedPath(newPrefix + rest));
          return;
        }
      }

      try {
        const basePath = pathWithoutLang.replace(/\/$/, '');
        const res = await fetch(`/api/meta?path=${basePath}`);
        console.log('res', res);

        if (!res.ok) throw new Error('meta API not found');

        const validPage = await res.json();

        if (validPage) {
          console.log('validPage', validPage);
          window.location.replace(getLocalizedPath(validPage));
          return;
        }
      } catch (e) {
        console.warn('meta.json fallback failed:', e);
      }

      window.location.replace(getLocalizedPath(fallbackRedirect));
    })();
  }, [pathname, lang, getLocalizedPath]);

  return null;
}
