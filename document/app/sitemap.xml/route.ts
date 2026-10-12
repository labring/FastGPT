import { source } from '@/lib/source';
import { NextResponse } from 'next/server';
import docLastModifiedData from '@/data/doc-last-modified.json';
import { i18n } from '@/lib/i18n';
import { getOwnedDocUrl, getOwnedLocales, X_DEFAULT_LOCALE } from '@/lib/site';

export const dynamic = 'force-static';

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Each domain lists only the locales it owns: io -> en, cn -> zh-CN.
export function GET() {
  const lastModifiedData = docLastModifiedData as Record<string, string>;

  const urlEntries = getOwnedLocales()
    .flatMap((locale) => source.getPages(locale).map((page) => ({ locale, page })))
    .map(({ locale, page }) => {
      // 逻辑路径会移除 .en 后缀，必须使用物理路径读取当前语言的更新时间。
      const filePath = page.data._file.path;
      const lastModified =
        lastModifiedData[`content/${filePath}`] ??
        lastModifiedData[`document/content/${filePath}`] ??
        page.data.lastModified;

      const alternates = i18n.languages
        .filter((alt) => source.getPage(page.slugs, alt))
        .map((alt) => ({ hreflang: alt, href: getOwnedDocUrl(alt, page.slugs) }));
      const xDefault = alternates.find((a) => a.hreflang === X_DEFAULT_LOCALE);
      if (xDefault) alternates.push({ hreflang: 'x-default', href: xDefault.href });

      const links = alternates
        .map(
          (a) =>
            `\n    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${escapeXml(a.href)}" />`
        )
        .join('');

      return `  <url>
    <loc>${escapeXml(getOwnedDocUrl(locale, page.slugs))}</loc>${
      lastModified
        ? `
    <lastmod>${new Date(lastModified).toISOString()}</lastmod>`
        : ''
    }${links}
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
