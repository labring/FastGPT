import { NextResponse } from 'next/server';
import { type DocumentRecord } from 'fumadocs-core/search/algolia';
import { getFastGPTDocsLocale } from '@/lib/fastgpt-home-url';
import { source } from '@/lib/source';

export const revalidate = false;

/** Export canonical search records while excluding the directory index page. */
export function GET() {
  const results: DocumentRecord[] = [];

  for (const page of source.getPages(getFastGPTDocsLocale())) {
    if (page.data.deprecated || /^toc(?:\.en)?\.mdx$/.test(page.data._file.path)) continue;
    results.push({
      _id: page.url,
      structured: page.data.structuredData,
      url: page.url,
      title: page.data.title,
      description: page.data.description
    });
  }

  return NextResponse.json(results);
}
