import { getSearchableLanguages, i18n } from '@/lib/i18n';
import { buildLlmsFullText, getLlmsTextHeaders } from '@/lib/llms-markdown';

export const revalidate = false;

export function generateStaticParams() {
  const languages =
    typeof getSearchableLanguages === 'function' ? getSearchableLanguages() : i18n.languages;
  return languages.map((lang) => ({ lang }));
}

/** Export the full active documentation corpus in the requested language with canonical URLs. */
export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!i18n.languages.includes(lang)) return new Response('Unknown language', { status: 404 });

  const body = await buildLlmsFullText(lang === 'en' ? 'en' : 'zh-CN');
  return new Response(body, {
    headers: getLlmsTextHeaders()
  });
}
