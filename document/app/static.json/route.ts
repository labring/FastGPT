import { NextResponse } from 'next/server';
import { type DocumentRecord } from 'fumadocs-core/search/algolia';
import { getSearchableLanguages, i18n } from '@/lib/i18n';
import { source } from '@/lib/source';

export const revalidate = false;

/** Export canonical search records while excluding the directory index page. */
export function GET() {
  const results: DocumentRecord[] = [];
  const languages =
    typeof getSearchableLanguages === 'function' ? getSearchableLanguages() : i18n.languages;

  for (const locale of languages) {
    for (const page of source.getPages(locale)) {
      if (
        page.data.deprecated ||
        /^toc(?:\.en)?\.mdx$/.test(page.data._file.path) ||
        page.url.includes('/openapi/legacy/') ||
        page.url.endsWith('/guide/chat/htmlRendering')
      ) {
        continue;
      }
      results.push({
        _id: page.url,
        structured: page.data.structuredData,
        url: page.url,
        title: page.data.title,
        description: page.data.description
      });
    }
  }

  return NextResponse.json(results);
}
