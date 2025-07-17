import * as fs from 'node:fs/promises';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import remarkMdx from 'remark-mdx';
import { remarkInclude } from 'fumadocs-mdx/config';
import { i18n } from '@/lib/i18n';

export const revalidate = false;

const processor = remark()
  .use(remarkMdx)
  // https://fumadocs.vercel.app/docs/mdx/include
  .use(remarkInclude)
  // gfm styles
  .use(remarkGfm)
  // .use(your remark plugins)
  .use(remarkStringify); // to string

export async function GET() {
  // all scanned content
  // Select files based on the default language
  const defaultLanguage = i18n.defaultLanguage;
  let globPattern;

  if (defaultLanguage === 'zh-CN') {
    // For Chinese, select *.mdx files
    globPattern = ['./content/docs/**/*.mdx'];
  } else {
    // For other languages (default English), select *.en.mdx files that don't have .mdx. in their path
    globPattern = ['./content/docs/**/*.en.mdx'];
  }

  const files = await fg(globPattern);

  const scan = files.map(async (file: string) => {
    const fileContent = await fs.readFile(file);
    const { content, data } = matter(fileContent.toString());

    const processed = await processor.process({
      path: file,
      value: content
    });

    return `file: ${file}
meta: ${JSON.stringify(data, null, 2)}

${processed}`;
  });

  const scanned = await Promise.all(scan);

  return new Response(scanned.join('\n\n'));
}
