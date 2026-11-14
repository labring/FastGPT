import { getFastGPTDocsLocale } from '@/lib/fastgpt-home-url';
import { buildLlmsFullText, getLlmsTextHeaders } from '@/lib/llms-markdown';

export const dynamic = 'force-static';

/** Serve the root developers and OpenAPI Markdown corpus in the host's primary language. */
export async function GET() {
  return new Response(await buildLlmsFullText(getFastGPTDocsLocale(), 'openapi'), {
    headers: getLlmsTextHeaders()
  });
}
