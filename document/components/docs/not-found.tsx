'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const exactMap: Record<string, string> = {
  '/docs/intro': '/docs/introduction',
  '/docs/guide/dashboard/workflow/coreferenceresolution':
    '/docs/introduction/guide/dashboard/workflow/coreferenceResolution',
  '/docs/guide/admin/sso_dingtalk':
    '/docs/introduction/guide/admin/sso#/docs/introduction/guide/admin/sso#钉钉',
  '/docs/guide/knowledge_base/rag': '/docs/introduction/guide/knowledge_base/RAG',
  '/docs/commercial/intro/': '/docs/introduction'
};

const prefixMap: Record<string, string> = {
  '/docs/development': '/docs/introduction/development',
  '/docs/FAQ': '/docs/introduction/FAQ',
  '/docs/guide': '/docs/introduction/guide',
  '/docs/shopping_cart': '/docs/introduction/shopping_cart',
  '/docs/agreement': '/docs/protocol'
};

const fallbackRedirect = '/docs/introduction';

export default function NotFound() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const tryRedirect = async () => {
      if (exactMap[pathname]) {
        router.replace(exactMap[pathname]);
        return;
      }

      for (const [oldPrefix, newPrefix] of Object.entries(prefixMap)) {
        if (pathname.startsWith(oldPrefix)) {
          const rest = pathname.slice(oldPrefix.length);
          router.replace(newPrefix + rest);
          return;
        }
      }

      try {
        const basePath = pathname.replace(/\/$/, '');
        const res = await fetch(`/api/meta?path=${basePath}`);
        console.log('res', res);

        if (!res.ok) throw new Error('meta API not found');

        const validPage = await res.json();

        if (validPage) {
          console.log('validPage', validPage);
          router.replace(validPage);
          return;
        }
      } catch (e) {
        console.warn('meta.json fallback failed:', e);
      }

      router.replace(fallbackRedirect);
    };

    tryRedirect();
  }, [pathname, router]);

  return null;
}
