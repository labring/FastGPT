import * as fs from 'node:fs/promises';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import remarkMdx from 'remark-mdx';
import { remarkInclude } from 'fumadocs-mdx/config';
import { getFastGPTDocsOriginForLocale } from '@/lib/fastgpt-home-url';
import { i18n } from '@/lib/i18n';

export const revalidate = false;

const includeMdxFiles = remarkInclude as unknown as typeof remarkMdx;

const processor = remark()
  .use(remarkMdx)
  .use(includeMdxFiles)
  .use(remarkGfm)
  .use(remarkStringify);

/** Export the full active documentation corpus in the requested language with canonical URLs. */
export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!i18n.languages.includes(lang)) return new Response('Unknown language', { status: 404 });

  const domain = getFastGPTDocsOriginForLocale(lang === 'en' ? 'en' : 'zh-CN');
  // Convert physical content file paths into public locale-prefixed canonical URLs.
  const fileToCanonicalUrl = (file: string): string => {
    const rel = file
      .replace(/^\.\/content/, '')
      .replace(/(?:\.en)?\.mdx$/, '')
      .replace(/\/index$/, '');
    return `${domain}/${lang}${rel}`;
  };

  // 1. Collect active locale MDX files while skipping utility and outdated upgrade pages.
  const files = (await fg('./content/**/*.mdx'))
    .filter(
      (file) =>
        file.endsWith('.en.mdx') === (lang === 'en') &&
        !/\/toc(?:\.en)?\.mdx$/.test(file) &&
        !file.startsWith('./content/self-host/upgrading/outdated/')
    )
    .sort();

  // 2. Render each non-deprecated page into Markdown with canonical URL and title metadata.
  const scanned = (
    await Promise.all(
      files.map(async (file: string) => {
        const fileContent = await fs.readFile(file);
        const { content, data } = matter(fileContent.toString());
        if (data.deprecated) return null;

        const processed = await processor.process({
          path: file,
          value: content
        });

        return `file: ${file}
url: ${fileToCanonicalUrl(file)}
title: ${String(data.title ?? '')}
meta: ${JSON.stringify(data, null, 2)}

${processed}`;
      })
    )
  ).filter((entry): entry is string => entry !== null);

  return new Response(scanned.join('\n\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
