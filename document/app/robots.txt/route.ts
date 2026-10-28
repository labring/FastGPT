import { NextResponse } from 'next/server';
import { getFastGPTDocsOrigin } from '@/lib/fastgpt-home-url';

export const dynamic = 'force-static';

/** Allow search and AI retrieval crawlers across documentation pages while restricting internal API routes. */
export function GET() {
  const domain = getFastGPTDocsOrigin();
  const content = `User-Agent: *
Allow: /
Disallow: /api/

Sitemap: ${domain}/sitemap.xml
`;

  return new NextResponse(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
