import { getSearchableLanguages, i18n } from '@/lib/i18n';
import { buildLlmsFullText } from '@/lib/llms-markdown';

export const revalidate = false;

export function generateStaticParams() {
  const languages =
    typeof getSearchableLanguages === 'function' ? getSearchableLanguages() : i18n.languages;
  return languages.map((lang) => ({ lang }));
}

/** Export the product, workflow, dataset, and FAQ documentation corpus in the requested language. */
export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!i18n.languages.includes(lang)) return new Response('Unknown language', { status: 404 });

  const body = await buildLlmsFullText(lang === 'en' ? 'en' : 'zh-CN', 'guide');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
