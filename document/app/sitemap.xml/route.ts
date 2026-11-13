import { source } from '@/lib/source';
import { NextResponse } from 'next/server';
import docLastModifiedData from '@/data/doc-last-modified.json';
import {
  getFastGPTDocsLocale,
  getFastGPTDocsOrigin,
  getFastGPTDocsOriginForLocale,
  isPreviewDocsSite,
  stripDocsLocalePrefix
} from '@/lib/fastgpt-home-url';

export const dynamic = 'force-static';

const isLocaleFileMatch = (filePath: string, targetLocale: 'zh-CN' | 'en') =>
  filePath.endsWith('.en.mdx') === (targetLocale === 'en');

/** Generate an unprefixed XML sitemap with reciprocal language and x-default alternates. */
export function GET() {
  if (isPreviewDocsSite()) {
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n</urlset>`;
    return new NextResponse(emptyXml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    });
  }

  const domain = getFastGPTDocsOrigin();
  const locale = getFastGPTDocsLocale();
  const zhOrigin = getFastGPTDocsOriginForLocale('zh-CN');
  const enOrigin = getFastGPTDocsOriginForLocale('en');

  const pages = source
    .getPages(locale)
    .filter(
      (page) =>
        isLocaleFileMatch(page.data._file.path, locale) &&
        !page.data.deprecated &&
        !/^toc(?:\.en)?\.mdx$/.test(page.data._file.path)
    );

  const urlEntries = pages
    .map((page) => {
      const filePath = `content/${page.data._file.path}`;
      const rawLastModified =
        (docLastModifiedData as Record<string, string>)[filePath] ?? page.data.lastModified;
      const lastModified =
        typeof rawLastModified === 'string'
          ? rawLastModified
          : rawLastModified
            ? new Date(rawLastModified).toISOString()
            : undefined;
      const routePath = stripDocsLocalePrefix(page.url).pathname;
      const hasPublishedLocale = (targetLocale: 'zh-CN' | 'en') => {
        if (targetLocale === locale) return true;
        const altPage = source.getPage(page.slugs, targetLocale);
        return Boolean(
          altPage !== undefined &&
            !altPage.data.deprecated &&
            isLocaleFileMatch(altPage.data._file.path, targetLocale)
        );
      };
      const alternateLinks: string[] = [];
      if (hasPublishedLocale('zh-CN')) {
        alternateLinks.push(
          `    <xhtml:link rel="alternate" hreflang="zh-CN" href="${zhOrigin}${routePath}" />`
        );
      }
      if (hasPublishedLocale('en')) {
        const enUrl = `${enOrigin}${routePath}`;
        alternateLinks.push(`    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}" />`);
        alternateLinks.push(
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${enUrl}" />`
        );
      }

      return `  <url>
    <loc>${domain}${routePath}</loc>${lastModified ? `
    <lastmod>${lastModified}</lastmod>` : ''}
${alternateLinks.join('\n')}
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlEntries}
</urlset>`;

  return new NextResponse(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  });
}
