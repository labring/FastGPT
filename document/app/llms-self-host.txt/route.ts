import { getFastGPTDocsLocale } from '@/lib/fastgpt-home-url';
import { buildLlmsFullText } from '@/lib/llms-markdown';

export const dynamic = 'force-static';

/** Serve the root self-hosted operations Markdown corpus in the host's primary language. */
export async function GET() {
  return new Response(await buildLlmsFullText(getFastGPTDocsLocale(), 'self-host'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
