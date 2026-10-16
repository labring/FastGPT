import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { loader } from 'fumadocs-core/source';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content');
const files = fs.readdirSync(root, { recursive: true })
  .filter((name) => /\.mdx$|(?:^|\/)meta(?:\.en)?\.json$/.test(name))
  .map((name) => {
    const raw = fs.readFileSync(path.join(root, name), 'utf8');
    return { type: name.endsWith('.mdx') ? 'page' : 'meta', path: name,
      data: name.endsWith('.mdx') ? matter(raw).data : JSON.parse(raw) };
  });
const source = loader({ baseUrl: '/', i18n: { defaultLanguage: 'zh-CN', languages: ['zh-CN', 'en'], hideLocale: 'never' }, source: { files } });
const compatibilityLandings = new Set(['guide/index.mdx', 'openapi/index.mdx', 'plugin/index.mdx', 'faq/index.mdx', 'toc.mdx']);
for (const locale of ['zh-CN', 'en']) {
  const tree = source.pageTree[locale];
  assert.equal(tree.children.length, 3, 'Three reader entrances');
  const counts = new Map();
  const visit = (node) => {
    if (locale === 'en') assert.ok(!/\p{Script=Han}/u.test(String(node.name ?? '')), `English label: ${node.name}`);
    if (node.type === 'page' && !node.external) counts.set(node.url, (counts.get(node.url) ?? 0) + 1);
    if (node.index && !node.children?.some((child) => child.type === 'page' && child.url === node.index.url)) visit(node.index);
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  for (const page of source.getPages(locale)) {
    if (compatibilityLandings.has(page.path.replace(/\.en\.mdx$/, '.mdx'))) continue;
    assert.equal(counts.get(page.url), 1, `Each substantive page appears once: ${page.url}`);
  }
  console.log(`${locale}: ${source.getPages(locale).length} pages accounted for under three entrances.`);
}
