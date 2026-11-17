import { NextResponse } from 'next/server';
import { getFastGPTDocsOrigin, isPreviewDocsSite } from '@/lib/fastgpt-home-url';

export const dynamic = 'force-static';

const AI_SEARCH_AGENTS = [
  '*',
  'OAI-SearchBot',
  'GPTBot',
  'ChatGPT-User',
  'PerplexityBot',
  'ClaudeBot',
  'Google-Extended',
  'Applebot-Extended',
  'Amazonbot'
];

/** Emit host-specific crawler directives on production and block indexing on preview builds. */
export function GET() {
  if (isPreviewDocsSite()) {
    return new NextResponse('User-agent: *\nAllow: /\n', {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    });
  }

  const domain = getFastGPTDocsOrigin();
  const rules = AI_SEARCH_AGENTS.map(
    (agent) => `User-Agent: ${agent}\nAllow: /\nDisallow: /api/`
  ).join('\n\n');
  const content = `# AI Context: ${domain}/llms.txt
# Pricing & Editions: ${domain}/pricing.md

${rules}

Sitemap: ${domain}/sitemap.xml
`;

  return new NextResponse(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
