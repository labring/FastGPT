import { i18n } from '@/lib/i18n';
import { buildLlmsFullText } from '@/lib/llms-markdown';

export const revalidate = false;

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}

/** Export the self-hosted deployment, configuration, and troubleshooting corpus in the requested language. */
export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!i18n.languages.includes(lang)) return new Response('Unknown language', { status: 404 });

  const body = await buildLlmsFullText(lang === 'en' ? 'en' : 'zh-CN', 'self-host');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
