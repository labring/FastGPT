'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

/** Keep missing-topic recovery within the requested language. */
export default function NotFound() {
  const { lang } = useParams<{ lang: string }>();
  const english = lang === 'en';

  return (
    <main className="mx-auto max-w-2xl p-10 text-center">
      <h1 className="mb-4 text-2xl font-semibold">{english ? '404 — Page not found' : '404 — 页面未找到'}</h1>
      <Link className="underline" href={`/${english ? 'en' : 'zh-CN'}/guide/getting-started`}>
        {english ? 'Open the documentation home' : '返回文档首页'}
      </Link>
    </main>
  );
}
