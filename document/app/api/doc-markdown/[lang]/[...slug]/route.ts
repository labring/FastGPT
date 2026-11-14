import {
  getPublishedDocsLocales,
  isPreviewDocsSite,
  type FastGPTDocsLocale
} from '@/lib/fastgpt-home-url';
import { buildSingleDocMarkdownResult } from '@/lib/llms-markdown';

/** Render standalone clean Markdown for any published documentation topic URL ending in `.md`. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string; slug: string[] }> }
) {
  const { lang, slug } = await params;
  const publishedLocales: string[] = getPublishedDocsLocales();
  if (!publishedLocales.includes(lang)) {
    return new Response('Unknown language', { status: 404 });
  }

  const locale: FastGPTDocsLocale = lang === 'en' ? 'en' : 'zh-CN';
  const result = await buildSingleDocMarkdownResult({
    lang: locale,
    slugParts: slug
  });
  if (result === null) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers({
    'Content-Type': 'text/markdown; charset=utf-8',
    'Content-Language': locale,
    Link: `<${result.canonicalUrl}>; rel="canonical"`,
    'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    Vary: 'Accept'
  });
  if (result.lastModified !== undefined) {
    headers.set('Last-Modified', new Date(result.lastModified).toUTCString());
  }
  if (isPreviewDocsSite()) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  } else if (result.deprecated) {
    headers.set('X-Robots-Tag', 'noindex');
  }

  return new Response(result.markdown, { headers });
}
