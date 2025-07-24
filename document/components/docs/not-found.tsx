'use client';
import { redirect } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const exactMap: Record<string, string> = {
  '/docs/intro': '/docs/introduction/index',
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

export default function NotFound() {
  const pathname = usePathname();

  useEffect(() => {
    if (exactMap[pathname]) {
      redirect(exactMap[pathname]);
      return;
    }

    for (const [oldPrefix, newPrefix] of Object.entries(prefixMap)) {
      if (pathname.startsWith(oldPrefix)) {
        const rest = pathname.slice(oldPrefix.length);
        redirect(newPrefix + rest);
        return;
      }
    }

    redirect('/docs/introduction');
  }, [pathname]);

  return;
}
