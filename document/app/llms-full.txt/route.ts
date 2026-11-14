import { getFastGPTDocsLocale } from '@/lib/fastgpt-home-url';
import { buildLlmsFullText } from '@/lib/llms-markdown';

export const dynamic = 'force-static';

/** Serve the root /llms-full.txt corpus directly in the host's primary language without redirect hops. */
export async function GET() {
  return new Response(await buildLlmsFullText(getFastGPTDocsLocale()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
