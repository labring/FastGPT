import { NextResponse } from 'next/server';
import { getFastGPTHomeOrigin, getFastGPTDocsOrigin } from '@/lib/fastgpt-home-url';

export const dynamic = 'force-static';

export function GET() {
  const homeDomain = getFastGPTHomeOrigin();
  const domain = getFastGPTDocsOrigin();
  const isCN = homeDomain.includes('.cn');

  let content: string;

  if (isCN) {
    content = `User-Agent: Googlebot
Disallow: /

User-Agent: *
Allow: /

Host: ${domain}
Sitemap: ${domain}/sitemap.xml
`;
  } else {
    content = `User-Agent: bingbot
Disallow: /

User-Agent: *
Allow: /

Sitemap: ${domain}/sitemap.xml
`;
  }

  return new NextResponse(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
