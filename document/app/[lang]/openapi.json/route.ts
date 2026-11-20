import { getSearchableLanguages, i18n } from '@/lib/i18n';
import { getOpenApiSpecHeaders, readOpenApiSpec } from '@/lib/openapi-spec';

export const revalidate = false;

export function generateStaticParams() {
  const languages =
    typeof getSearchableLanguages === 'function' ? getSearchableLanguages() : i18n.languages;
  return languages.map((lang) => ({ lang }));
}

/** Export the locale-specific System OpenAPI 3.1 JSON contract for preview and localized builds. */
export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!i18n.languages.includes(lang)) return new Response('Unknown language', { status: 404 });

  const locale = lang === 'en' ? 'en' : 'zh-CN';
  const body = await readOpenApiSpec(locale);
  return new Response(body, {
    headers: getOpenApiSpecHeaders(locale)
  });
}
