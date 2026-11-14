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
function loadModule(file, { imports, nodeEnv = 'production' }) {
  const filename = fileURLToPath(new URL(file, import.meta.url));
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  });
  const exports = {};
  vm.runInNewContext(
    outputText,
    {
      exports,
      process: { env: { NODE_ENV: nodeEnv } },
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
function createSource(
  asFunction,
  {
    draftStates = { 'zh-CN': true, en: true },
    missingEnglishDraft = false,
    nodeEnv = 'production'
  } = {}
) {
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
      ]
        .filter(([name]) => !(missingEnglishDraft && lang === 'en' && name === 'draft'))
        .map(([name, draft]) => ({
          type: 'page',
          path: `guide/${name}${suffix}.mdx`,
          data: {
            title: `${name}-${lang}`,
            _file: { path: `guide/${name}${suffix}.mdx` },
            ...(name === 'draft'
              ? { draft: draftStates[lang] }
              : draft === undefined
                ? {}
                : { draft })
          }
        }))
    ];
  });
  return loadModule('../lib/source.ts', {
    imports: {
      '@/.source': {
        docs: { toFumadocsSource: () => ({ files: asFunction ? () => files : files }) }
      },
      'fumadocs-core/source': { loader },
      './i18n': {
        i18n: { defaultLanguage: 'zh-CN', languages: ['zh-CN', 'en'], hideLocale: 'never' }
      },
      './page-tree': loadModule('../lib/page-tree.ts', { imports: {} }),
      'lucide-react': { icons: {} },
      react: {
        createElement() {
          throw Error('Fixture has no icons');
        }
      }
    },
    nodeEnv
  }).source;
}

for (const asFunction of [true, false]) {
  test(`development exposes drafts across lookup, navigation and discovery with draft markers (lazy: ${asFunction})`, async () => {
    const source = createSource(asFunction, { nodeEnv: 'development' });
    for (const language of ['zh-CN', 'en']) {
      const url = `/${language}/guide/draft`;
      assert.equal(source.getPage(['guide', 'draft'], language).data.draft, true);
      assert.equal(source.getPageByHref(url, { language }).page.data.draft, true);
      assert.equal(
        source.getNodePage(
          { type: 'page', name: 'Draft', url, $ref: { file: 'guide/draft.mdx' } },
          language
        ).data.draft,
        true
      );
      assert.ok(source.getPages(language).some((page) => page.url === url));
      assert.ok(
        source
          .getLanguages()
          .find((entry) => entry.language === language)
          .pages.some((page) => page.url === url)
      );
      assert.ok(
        source
          .generateParams()
          .some((params) => params.lang === language && params.slug.join('/') === 'guide/draft')
      );
      // 真实 loader 会把页面归入目录分组，标签必须一直保留到最终导航节点。
      const findPage = (nodes) => {
        for (const node of nodes) {
          if (node.type === 'page' && node.url === url) return node;
          if (node.type !== 'folder') continue;
          if (node.index?.url === url) return node.index;
          const match = findPage(node.children);
          if (match) return match;
        }
      };
      assert.equal(findPage(source.getPageTree(language).children).draft, true);
    }
    const { GET } = loadModule('../app/static.json/route.ts', {
      imports: {
        '@/lib/i18n': { i18n: { languages: ['zh-CN', 'en'] } },
        '@/lib/source': { source },
        'next/server': { NextResponse }
      }
    });
    const records = await GET().json();
    assert.equal(records.filter((record) => record._id.endsWith('/guide/draft')).length, 2);
  });
}

for (const asFunction of [true, false]) {
  for (const zhDraft of [true, false]) {
    test(`locale publication is independent (lazy: ${asFunction}, zh draft: ${zhDraft})`, () => {
      const draftStates = { 'zh-CN': zhDraft, en: !zhDraft };
      const source = createSource(asFunction, { draftStates });
      for (const language of ['zh-CN', 'en']) {
        const expectedPublished = !draftStates[language];
        const url = `/${language}/guide/draft`;
        assert.equal(Boolean(source.getPage(['guide', 'draft'], language)), expectedPublished);
        assert.equal(
          Boolean(
            source.getNodePage(
              { type: 'page', name: 'Draft', url, $ref: { file: 'guide/draft.mdx' } },
              language
            )
          ),
          expectedPublished
        );
        assert.equal(Boolean(source.getPageByHref(url, { language })), expectedPublished);
        assert.equal(
          Boolean(source.getPageByHref('./draft.mdx', { dir: 'guide', language })),
          expectedPublished
        );
        assert.equal(
          source.getPages(language).some((page) => page.url === url),
          expectedPublished
        );
        assert.equal(
          source
            .getLanguages()
            .find((entry) => entry.language === language)
            .pages.some((page) => page.url === url),
          expectedPublished
        );
        assert.equal(JSON.stringify(source.getPageTree(language)).includes(url), expectedPublished);
        for (const [slugKey, langKey] of [
          ['slug', 'lang'],
          ['path', 'locale']
        ]) {
          assert.equal(
            source
              .generateParams(slugKey, langKey)
              .some(
                (params) =>
                  params[langKey] === language && params[slugKey].join('/') === 'guide/draft'
              ),
            expectedPublished
          );
        }
      }
      const language = zhDraft ? 'en' : 'zh-CN';
      assert.equal(source.getPage(['guide', 'draft'], language).data.title, `draft-${language}`);
    });
  }
}

test('missing translations fall back only to published default pages', () => {
  for (const zhDraft of [false, true]) {
    const source = createSource(true, {
      draftStates: { 'zh-CN': zhDraft },
      missingEnglishDraft: true
    });
    const page = source.getPage(['guide', 'draft'], 'en');
    assert.equal(Boolean(page), !zhDraft);
    if (page) assert.equal(page.data.title, 'draft-zh-CN');
  }
});

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
      assert.ok(!JSON.stringify(source.pageTree[locale]).includes('/guide/draft'));
    }
    assert.equal(source.generateParams().length, 4);
    assert.ok(source.generateParams().every(({ slug }) => !slug.includes('draft')));
  });
}

test('page tree removes empty folders and sections, retaining index pages and external links', () => {
  const { normalizePageTreeSections } = loadModule('../lib/page-tree.ts', { imports: {} });
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
    imports: {
      '@/lib/i18n': {
        i18n: { defaultLanguage: 'zh-CN', languages: ['zh-CN', 'en'], hideLocale: 'never' }
      },
      '@/lib/source': { source: createSource(true) },
      'next/server': { NextResponse }
    }
  });
  const response = GET();
  assert.equal(response.status, 200);
  const records = await response.json();
  assert.deepEqual(records.map((record) => record._id).sort(), [
    '/en/guide/default',
    '/en/guide/published',
    '/zh-CN/guide/default',
    '/zh-CN/guide/published'
  ]);
});
