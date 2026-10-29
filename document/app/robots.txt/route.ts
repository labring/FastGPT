import { NextResponse } from 'next/server';
import { getFastGPTDocsOrigin } from '@/lib/fastgpt-home-url';

export const dynamic = 'force-static';

const AI_SEARCH_AGENTS = [
  '*',
  'OAI-SearchBot',
  'GPTBot',
  'ChatGPT-User',
  'PerplexityBot',
  'ClaudeBot',
  'Google-Extended'
];

/** Allow search and AI retrieval crawlers across documentation pages while restricting internal API routes. */
export function GET() {
  const domain = getFastGPTDocsOrigin();
  const rules = AI_SEARCH_AGENTS.map(
    (agent) => `User-Agent: ${agent}\nAllow: /\nDisallow: /api/`
  ).join('\n\n');
  const content = `${rules}

Sitemap: ${domain}/sitemap.xml
`;

  return new NextResponse(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
