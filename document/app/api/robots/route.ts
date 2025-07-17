// app/api/robots/route.ts
import { i18n } from '@/lib/i18n';
import { NextResponse } from 'next/server';

export async function GET() {
  const host =
    i18n.defaultLanguage === 'zh-cn' ? 'https://localhost:3000' : 'https://localhost:3000/en';

  const robotsTxt = `User-agent: *
Allow: /
Allow: /en/
Disallow: /zh-cn/


Host: ${host}

Sitemap: ${host}/sitemap.xml`;

  return new NextResponse(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain'
    }
  });
}
