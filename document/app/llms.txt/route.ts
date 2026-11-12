import { getFastGPTDocsLocale } from '@/lib/fastgpt-home-url';
import { buildLlmsIndexText } from '@/lib/llms-markdown';

export const dynamic = 'force-static';

/** Serve the root /llms.txt index directly in the host's primary language without redirect hops. */
export function GET() {
  return new Response(buildLlmsIndexText(getFastGPTDocsLocale()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
