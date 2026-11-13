import { i18n } from '@/lib/i18n';
import { buildSingleDocMarkdown, getSingleDocCanonicalUrl } from '@/lib/llms-markdown';

/** Render standalone clean Markdown for any published documentation topic URL ending in `.md`. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string; slug: string[] }> }
) {
  const { lang, slug } = await params;
  if (!i18n.languages.includes(lang)) {
    return new Response('Unknown language', { status: 404 });
  }

  const locale = lang === 'en' ? 'en' : 'zh-CN';
  const markdown = await buildSingleDocMarkdown({
    lang: locale,
    slugParts: slug
  });
  if (markdown === null) {
    return new Response('Not found', { status: 404 });
  }

  const canonicalUrl = getSingleDocCanonicalUrl(locale, slug);
  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Link: `<${canonicalUrl}>; rel="canonical"`,
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
      Vary: 'Accept'
    }
  });
}
