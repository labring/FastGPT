import { getFastGPTDocsLocale } from '@/lib/fastgpt-home-url';
import { getOpenApiSpecHeaders, readOpenApiSpec } from '@/lib/openapi-spec';

export const dynamic = 'force-static';

/** Serve the root /openapi.json System OpenAPI 3.1 contract in the host's primary language. */
export async function GET() {
  const locale = getFastGPTDocsLocale();
  const body = await readOpenApiSpec(locale);
  return new Response(body, {
    headers: getOpenApiSpecHeaders(locale)
  });
}
