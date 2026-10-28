import { source } from '@/lib/source';
import { NextResponse } from 'next/server';
import docLastModifiedData from '@/data/doc-last-modified.json';
import {
  getFastGPTDocsLocale,
  getFastGPTDocsOrigin,
  getFastGPTDocsOriginForLocale
} from '@/lib/fastgpt-home-url';

export const dynamic = 'force-static';

/** Generate a localized XML sitemap with reciprocal language and x-default alternates. */
export function GET() {
  const domain = getFastGPTDocsOrigin();
  const locale = getFastGPTDocsLocale();
  const zhOrigin = getFastGPTDocsOriginForLocale('zh-CN');
  const enOrigin = getFastGPTDocsOriginForLocale('en');

  const pages = source
    .getPages(locale)
    .filter((page) => !/^toc(?:\.en)?\.mdx$/.test(page.data._file.path));

  const urlEntries = pages
    .map((page) => {
      const filePath = `content/${page.data._file.path}`;
      const lastModified = (docLastModifiedData as Record<string, string>)[filePath] ?? page.data.lastModified;
      const routePath = page.url.replace(/^\/(?:zh-CN|en)/, '');
      const zhUrl = `${zhOrigin}/zh-CN${routePath}`;
      const enUrl = `${enOrigin}/en${routePath}`;

      return `  <url>
    <loc>${domain}${page.url}</loc>${lastModified ? `
    <lastmod>${lastModified}</lastmod>` : ''}
    <xhtml:link rel="alternate" hreflang="zh-CN" href="${zhUrl}" />
    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${enUrl}" />
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
