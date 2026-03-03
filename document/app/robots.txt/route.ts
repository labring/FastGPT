import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export function GET() {
  const homeDomain = process.env.FASTGPT_HOME_DOMAIN ?? 'https://fastgpt.io';
  const domain = homeDomain.replace('https://', 'https://doc.');
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
