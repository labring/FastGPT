import { NextResponse } from 'next/server';
import { getFastGPTDocsOrigin } from '@/lib/fastgpt-home-url';
import { getDocSiteVariant } from '@/lib/site';

export const dynamic = 'force-static';

// Allow all crawlers on both domains; duplicate content is handled by
// canonical + hreflang (locale ownership), not by blocking crawlers.
export function GET() {
  const domain = getFastGPTDocsOrigin();
  const isCN = getDocSiteVariant() === 'cn';

  const content = `User-Agent: *
Allow: /
${isCN ? `\nHost: ${domain}` : ''}
Sitemap: ${domain}/sitemap.xml
`;

  return new NextResponse(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
