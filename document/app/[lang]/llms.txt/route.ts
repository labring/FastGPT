import { i18n } from '@/lib/i18n';
import { buildLlmsIndexText } from '@/lib/llms-markdown';

export const revalidate = false;

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}

/** Export an llmstxt.org-compliant Markdown index of active documentation pages with canonical URLs. */
export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!i18n.languages.includes(lang)) return new Response('Unknown language', { status: 404 });

  const body = buildLlmsIndexText(lang === 'en' ? 'en' : 'zh-CN');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
