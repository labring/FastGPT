import { source } from '@/lib/source';
import { NextResponse } from 'next/server';
import docLastModifiedData from '@/data/doc-last-modified.json';

export const dynamic = 'force-static';

export function GET() {
  const homeDomain = process.env.FASTGPT_HOME_DOMAIN ?? 'https://fastgpt.io';
  const domain = homeDomain.replace('https://', 'https://doc.');

  const pages = source.getPages();

  const urlEntries = pages
    .map((page) => {
      const filePath = `document/content/docs/${page.file.path}`;
      // @ts-ignore
      const lastModified = docLastModifiedData[filePath] || page.data.lastModified;

      return `  <url>
    <loc>${domain}${page.url}</loc>${lastModified ? `
    <lastmod>${lastModified}</lastmod>` : ''}
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

  return new NextResponse(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  });
}
