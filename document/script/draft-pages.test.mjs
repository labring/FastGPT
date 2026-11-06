import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { loader } from 'fumadocs-core/source';

const { NextResponse } = createRequire(import.meta.url)('next/server');

/** 执行真实站点模块，仅替换构建生成的 MDX 输入；路由和页面树由已安装的真实 loader 生成。 */
function loadModule(file, imports) {
  const filename = fileURLToPath(new URL(file, import.meta.url));
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  });
  const exports = {};
  vm.runInNewContext(
    outputText,
    {
      exports,
      require: (id) => {
        assert.ok(Object.hasOwn(imports, id), `Unexpected import: ${id}`);
        return imports[id];
      }
    },
    { filename }
  );
  return exports;
}

/** 两种语言均含草稿、显式发布和默认发布页面；meta 保留草稿顺序以覆盖真实导航配置。 */
function createSource(asFunction) {
  const files = ['zh-CN', 'en'].flatMap((lang) => {
    const suffix = lang === 'en' ? '.en' : '';
    return [
      { type: 'meta', path: `meta${suffix}.json`, data: { pages: ['guide'] } },
      {
        type: 'meta',
        path: `guide/meta${suffix}.json`,
        data: { pages: ['draft', 'published', 'default'] }
      },
      ...[
        ['draft', true],
        ['published', false],
        ['default', undefined]
      ].map(([name, draft]) => ({
        type: 'page',
        path: `guide/${name}${suffix}.mdx`,
        data: { title: `${name}-${lang}`, ...(draft === undefined ? {} : { draft }) }
      }))
    ];
  });
  return loadModule('../lib/source.ts', {
    '@/.source': {
      docs: { toFumadocsSource: () => ({ files: asFunction ? () => files : files }) }
    },
    'fumadocs-core/source': { loader },
    './i18n': {
      i18n: { defaultLanguage: 'zh-CN', languages: ['zh-CN', 'en'], hideLocale: 'never' }
    },
    'lucide-react': { icons: {} },
    react: {
      createElement() {
        throw Error('Fixture has no icons');
      }
    }
  }).source;
}

for (const asFunction of [true, false]) {
  test(`drafts are absent from lookup, navigation and discovery (lazy files: ${asFunction})`, () => {
    const source = createSource(asFunction);
    for (const locale of ['zh-CN', 'en']) {
      assert.equal(source.getPage(['guide', 'draft'], locale), undefined);
      assert.equal(source.getPageByHref(`/${locale}/guide/draft`), undefined);
      assert.equal(
        source.getPage(['guide', 'published'], locale).data.title,
        `published-${locale}`
      );
      assert.equal(source.getPage(['guide', 'default'], locale).data.title, `default-${locale}`);
      assert.deepEqual(
        source
          .getPages(locale)
          .map((page) => path.posix.basename(page.url))
          .sort(),
        ['default', 'published']
      );
      assert.ok(!JSON.stringify(source.pageTree[locale]).includes('draft'));
    }
    assert.equal(source.generateParams().length, 4);
    assert.ok(source.generateParams().every(({ slug }) => !slug.includes('draft')));
  });
}

test('page tree removes empty folders and sections, retaining index pages and external links', () => {
  const { normalizePageTreeSections } = loadModule('../lib/page-tree.ts', {});
  const index = { type: 'page', name: 'Index', url: '/index' };
  const link = { type: 'page', name: 'External', url: 'https://example.test', external: true };
  const tree = normalizePageTreeSections({
    name: 'Root',
    children: [
      {
        type: 'folder',
        name: 'Only draft',
        children: [{ type: 'folder', name: 'Empty', children: [] }]
      },
      { type: 'folder', name: 'Published index', index, children: [] },
      { type: 'separator', name: 'Links' },
      link,
      { type: 'separator', name: 'Empty section' }
    ]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(tree.children.map((node) => node.name))), [
    'Published index',
    'Links'
  ]);
  assert.equal(tree.children[0].index, index);
  assert.equal(tree.children[1].children[0], link);
});

test('static search export uses the filtered source', async () => {
  const { GET } = loadModule('../app/static.json/route.ts', {
    '@/lib/source': { source: createSource(true) },
    'next/server': { NextResponse }
  });
  const response = GET();
  assert.equal(response.status, 200);
  const records = await response.json();
  assert.deepEqual(records.map((record) => record._id).sort(), [
    '/zh-CN/guide/default',
    '/zh-CN/guide/published'
  ]);
});
