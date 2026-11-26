import { getFastGPTDocsLocale } from '@/lib/fastgpt-home-url';
import { buildLlmsIndexText, getLlmsTextHeaders } from '@/lib/llms-markdown';

export const dynamic = 'force-static';

/** Serve the root /llms.txt index directly in the host's primary language without redirect hops. */
export function GET() {
  return new Response(buildLlmsIndexText(getFastGPTDocsLocale()), {
    headers: getLlmsTextHeaders()
  });
}
