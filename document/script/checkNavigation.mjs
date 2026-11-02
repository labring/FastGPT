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
    if (name.endsWith('.mdx')) {
      const { data, content } = matter(raw);
      const bodyWithoutFences = content.replace(/```[\s\S]*?```/g, '');
      assert.ok(!/^#\s+/m.test(bodyWithoutFences), `In-body H1 heading in ${name}`);
      assert.ok(
        !/!\[(?:\s*)\]\(/.test(bodyWithoutFences),
        `Empty image alt text in ${name}`
      );
      if (!/^toc(?:\.en)?\.mdx$/.test(name)) {
        const minDescLength = name.endsWith('.en.mdx') ? 60 : 20;
        const descLength = String(data.description ?? '').trim().length;
        assert.ok(
          descLength >= minDescLength,
          `Description below ${minDescLength} characters in ${name}`
        );
        if (name.endsWith('.en.mdx')) {
          assert.ok(descLength <= 160, `Description above 160 characters in ${name}`);
        }
      }
      return { type: 'page', path: name, data };
    }
    return { type: 'meta', path: name, data: JSON.parse(raw) };
  });
const source = loader({ baseUrl: '/', i18n: { defaultLanguage: 'zh-CN', languages: ['zh-CN', 'en'], hideLocale: 'never' }, source: { files } });
const compatibilityLandings = new Set(['toc.mdx', 'guide/chat/htmlRendering.mdx']);
for (const locale of ['zh-CN', 'en']) {
  const tree = source.pageTree[locale];
  assert.equal(tree.children.length, 4, 'Four reader entrances');
  const counts = new Map();
  const owners = new Map();
  const titles = new Map();
  const descriptions = new Map();
  // Fumadocs uses the nearest root for the sidebar and adjacent-page navigation.
  const visit = (node, parentRoot) => {
    const sectionRoot = node.root ? node : parentRoot;
    if (locale === 'en') assert.ok(!/\p{Script=Han}/u.test(String(node.name ?? '')), `English label: ${node.name}`);
    if (node.type === 'page' && !node.external) {
      counts.set(node.url, (counts.get(node.url) ?? 0) + 1);
      owners.set(node.url, sectionRoot);
    }
    if (node.index && !node.children?.some((child) => child.type === 'page' && child.url === node.index.url)) visit(node.index, sectionRoot);
    for (const child of node.children ?? []) visit(child, sectionRoot);
  };
  visit(tree);
  for (const page of source.getPages(locale)) {
    if (compatibilityLandings.has(page.path.replace(/\.en\.mdx$/, '.mdx'))) continue;
    assert.equal(counts.get(page.url), 1, `Each substantive page appears once: ${page.url}`);
    const previousUrl = titles.get(page.data.title);
    assert.equal(previousUrl, undefined, `Duplicate ${locale} title "${page.data.title}": ${previousUrl} and ${page.url}`);
    titles.set(page.data.title, page.url);
    const desc = String(page.data.description ?? '').trim();
    const previousDescUrl = descriptions.get(desc);
    assert.equal(previousDescUrl, undefined, `Duplicate ${locale} description "${desc}": ${previousDescUrl} and ${page.url}`);
    descriptions.set(desc, page.url);
  }
  for (const topic of ['intro', 'quick-start', 'system-tool-development', 'model-presets', 'debugging-and-publishing', 'package-reference']) {
    assert.equal(owners.get(`/${locale}/plugin/${topic}`), tree.children[1], `Plugin author topic belongs to Developers: ${topic}`);
  }
  assert.equal(owners.get(`/${locale}/plugin/team-installation`), tree.children[0], 'Team installation belongs to Use FastGPT');
  assert.equal(owners.get(`/${locale}/plugin/runtime`), tree.children[2], 'Plugin operations belong to Deploy and Operate');
  assert.equal(owners.get(`/${locale}/self-host/design/dataset`), tree.children[2], 'Design documentation belongs to Deploy and Operate');
  assert.equal(tree.children[2].children.at(-1)?.url, `/${locale}/self-host/design/dataset`, 'Design documentation sits at the bottom of Deploy and Operate');
  assert.equal(owners.get(`/${locale}/self-host/upgrading/version-timeline`), tree.children[3], 'Version timeline belongs to Versions & Upgrades');
  assert.equal(owners.get(`/${locale}/self-host/upgrading/upgrade-instruction`), tree.children[3], 'Upgrade instructions belong to Versions & Upgrades');
  assert.equal(owners.get(`/${locale}/guide/build/tools/system-plugins/upload_system_tool`), tree.children[0], 'System tool configuration belongs to Use FastGPT');
  assert.ok(!counts.has(`/${locale}/plugin`), 'The compatibility landing stays out of adjacent-page navigation');
  console.log(`${locale}: ${source.getPages(locale).length} pages accounted for under four entrances.`);
}
