/** Verify English content coverage and links with the site's MDX heading and route resolvers. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';
import { remarkHeading } from 'fumadocs-core/mdx-plugins';
import { loader } from 'fumadocs-core/source';

const documentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const processor = remark().use(remarkMdx).use(remarkGfm).use(remarkHeading);
const han = /\p{Script=Han}/u;
// Preserve the community contributors' original handles from the Chinese sources.
const contributorNames = {
  'self-host/custom-models/chatglm2-m3e.en.mdx': ['不做了睡大觉'],
  'self-host/custom-models/m3e.en.mdx': ['睡大觉']
};

/** Extract prose and links while keeping executable examples out of the language scan. */
function parsePage(raw) {
  const { data, content } = matter(raw);
  const tree = processor.runSync(processor.parse(content));
  const headings = new Set();
  const links = [];
  const prose = [data.title ?? '', data.description ?? ''];

  const visit = (node) => {
    if (node.type === 'text') prose.push(node.value);
    if (node.type === 'image') prose.push(node.alt ?? '');
    if (node.type === 'heading') headings.add(node.data.hProperties.id);
    if (node.type === 'link' || node.type === 'definition') links.push(node.url);
    if (node.attributes) {
      for (const attribute of node.attributes) {
        if (typeof attribute.value !== 'string') continue;
        if (attribute.name === 'id') headings.add(attribute.value);
        if (['alt', 'title', 'label', 'description'].includes(attribute.name)) {
          prose.push(attribute.value);
        }
        if (attribute.name === 'href') links.push(attribute.value);
        if (node.name === 'Redirect' && attribute.name === 'to') {
          links.push(
            attribute.value.startsWith('/en/') ? attribute.value : `/en${attribute.value}`
          );
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return { ...data, headings, links, prose };
}

/** Check all pairs, visible English text, and the exact link targets used by Fumadocs. */
export function checkEnglishDocs(contentDir = path.join(documentRoot, 'content')) {
  const names = fs
    .readdirSync(contentDir, { recursive: true })
    .filter((name) => /\.mdx$|(?:^|\/)meta(?:\.en)?\.json$/.test(name))
    .sort();
  const errors = [];
  const files = [];
  const report = (file, issue) => errors.push(`${file}: ${issue}`);

  for (const name of names) {
    const raw = fs.readFileSync(path.join(contentDir, name), 'utf8');
    const isPage = name.endsWith('.mdx');
    const isEnglish = /\.en\.(?:mdx|json)$/.test(name);
    const counterpart = isEnglish
      ? name.replace(/\.en\.(mdx|json)$/, '.$1')
      : name.replace(/\.(mdx|json)$/, '.en.$1');
    if (!names.includes(counterpart)) report(name, `Missing counterpart ${counterpart}`);

    const data = isPage ? (isEnglish ? parsePage(raw) : matter(raw).data) : JSON.parse(raw);
    files.push({
      type: isPage ? 'page' : 'meta',
      path: name,
      absolutePath: path.join(contentDir, name),
      data
    });
    if (!isEnglish) continue;

    let prose = isPage ? data.prose.join('\n') : JSON.stringify(data);
    for (const handle of contributorNames[name] ?? []) prose = prose.replaceAll(handle, '');
    if (han.test(prose)) report(name, 'Chinese reader-facing text requires review');
    if (isPage && !data.title?.trim()) report(name, 'English title is missing');
  }

  const source = loader({
    baseUrl: '/',
    i18n: { defaultLanguage: 'zh-CN', languages: ['zh-CN', 'en'], hideLocale: 'never' },
    source: { files }
  });
  const pages = source.getPages('en');
  const byUrl = new Map(pages.map((page) => [page.url, page]));
  let linkCount = 0;

  for (const page of pages) {
    const fileName = path.relative(contentDir, page.absolutePath);
    if (!fileName.endsWith('.en.mdx')) continue;
    const chinese = files.find((file) => file.path === fileName.replace(/\.en\.mdx$/, '.mdx'));
    if (chinese && chinese.data.releaseTime !== page.data.releaseTime) {
      report(fileName, 'Release date differs from the Chinese source');
    }

    for (const href of page.data.links) {
      if (
        /^[a-z][a-z\d+.-]*:/i.test(href) &&
        !/^https?:\/\/doc\.fastgpt\.(?:io|cn)(?:\/|$)/i.test(href)
      )
        continue;
      const url = (() => {
        if (href.startsWith('.')) {
          const resolved = source.getPageByHref(href, {
            dir: path.posix.dirname(page.path),
            language: 'en'
          });
          if (!resolved) {
            report(fileName, `Unresolved relative link ${href}`);
            return;
          }
          return new URL(
            `${resolved.page.url}${resolved.hash ? `#${resolved.hash}` : ''}`,
            'https://doc.fastgpt.io'
          );
        }
        return new URL(href, `https://doc.fastgpt.io${page.url}`);
      })();
      if (!url) continue;
      if (!['doc.fastgpt.io', 'doc.fastgpt.cn'].includes(url.hostname)) continue;
      // Deployment downloads and shared media keep their resource paths across locales.
      if (!/\.mdx?$/i.test(url.pathname) && path.posix.extname(url.pathname)) continue;
      linkCount++;
      const target = byUrl.get(url.pathname.replace(/\/$/, ''));
      if (!target || !target.absolutePath.endsWith('.en.mdx')) {
        report(fileName, `Missing English route ${href}`);
      } else if (url.hash && !target.data.headings.has(decodeURIComponent(url.hash.slice(1)))) {
        report(fileName, `Missing English heading ${href}`);
      }
    }
  }

  return {
    errors,
    pages: files.filter((file) => file.path.endsWith('.en.mdx')).length,
    navigation: files.filter((file) => file.path.endsWith('meta.en.json')).length,
    links: linkCount
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = checkEnglishDocs();
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(
      `English documentation verification passed: ${result.pages} pages, ${result.navigation} navigation files, ${result.links} links.`
    );
  }
}
