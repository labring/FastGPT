const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { NextResponse } = require('next/server');
const { getFastGPTDocsLocaleFromHomeOrigin } = require('../lib/docs-locale');

/** Execute the actual TypeScript modules with isolated build settings and fixture data. */
function loadModule(file, { imports, env = {} }) {
  const filename = path.join(__dirname, file);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (id) => {
      assert.ok(Object.hasOwn(imports, id), `Unexpected import: ${id}`);
      return imports[id];
    },
    process: { env },
    URL,
    Headers
  }, { filename });
  return exports;
}

test('docs locale follows the configured build host', () => {
  assert.equal(getFastGPTDocsLocaleFromHomeOrigin('https://fastgpt.cn'), 'zh-CN');
  assert.equal(getFastGPTDocsLocaleFromHomeOrigin('https://fastgpt.io'), 'en');
  assert.equal(getFastGPTDocsLocaleFromHomeOrigin('https://preview.example.com'), 'en');
});

for (const [locale, homeOrigin, timestamp] of [
  ['zh-CN', 'https://fastgpt.cn', '2026-10-12T08:00:00+08:00'],
  ['en', 'https://fastgpt.io', '2026-10-13T17:01:00+08:00']
]) {
  test(`${locale} sitemap emits its own URLs and physical-file modification dates`, async () => {
    const pages = ['zh-CN', 'en'].flatMap((language) => [
      {
        locale: language,
        slugs: ['guide'],
        url: `/${language}/guide`,
        file: { path: 'guide.mdx' },
        data: {
          _file: { path: language === 'en' ? 'guide.en.mdx' : 'guide.mdx' },
          lastModified: '2026-09-01T00:00:00Z'
        }
      },
      {
        locale: language,
        slugs: ['fallback'],
        url: `/${language}/fallback`,
        data: { _file: { path: `fallback.${language}.mdx` }, lastModified: '2026-10-01T00:00:00Z' }
      },
      {
        locale: language,
        slugs: ['undated'],
        url: `/${language}/undated`,
        data: { _file: { path: `undated.${language}.mdx` } }
      },
      {
        locale: language,
        slugs: ['toc'],
        url: `/${language}/toc`,
        data: { _file: { path: language === 'en' ? 'toc.en.mdx' : 'toc.mdx' } }
      }
    ]);
    const routing = loadModule('../lib/fastgpt-home-url.ts', {
      imports: { './docs-locale': require('../lib/docs-locale') },
      env: { FASTGPT_HOME_DOMAIN: homeOrigin }
    });
    const { GET } = loadModule('../app/sitemap.xml/route.ts', {
      imports: {
        '@/lib/source': {
          source: {
            getPages: (selectedLocale) => {
              assert.equal(selectedLocale, locale);
              return pages.filter((page) => page.locale === selectedLocale);
            },
            getPage: (slugs, selectedLocale) =>
              pages.find((page) => page.locale === selectedLocale && page.slugs.join('/') === slugs.join('/'))
          }
        },
        'next/server': { NextResponse },
        '@/lib/fastgpt-home-url': routing,
        '@/data/doc-last-modified.json': {
          'content/guide.mdx': '2026-10-12T08:00:00+08:00',
          'content/guide.en.mdx': '2026-10-13T17:01:00+08:00'
        }
      }
    });
    const response = GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'application/xml; charset=utf-8');
    assert.equal(await response.text(), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${homeOrigin.replace('https://', 'https://doc.')}/${locale}/guide</loc>
    <lastmod>${timestamp}</lastmod>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="https://doc.fastgpt.cn/zh-CN/guide" />
    <xhtml:link rel="alternate" hreflang="en" href="https://doc.fastgpt.io/en/guide" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://doc.fastgpt.io/en/guide" />
  </url>
  <url>
    <loc>${homeOrigin.replace('https://', 'https://doc.')}/${locale}/fallback</loc>
    <lastmod>2026-10-01T00:00:00Z</lastmod>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="https://doc.fastgpt.cn/zh-CN/fallback" />
    <xhtml:link rel="alternate" hreflang="en" href="https://doc.fastgpt.io/en/fallback" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://doc.fastgpt.io/en/fallback" />
  </url>
  <url>
    <loc>${homeOrigin.replace('https://', 'https://doc.')}/${locale}/undated</loc>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="https://doc.fastgpt.cn/zh-CN/undated" />
    <xhtml:link rel="alternate" hreflang="en" href="https://doc.fastgpt.io/en/undated" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://doc.fastgpt.io/en/undated" />
  </url>
</urlset>`);
  });
}

for (const [homeOrigin, docsOrigin] of [
  ['https://fastgpt.cn', 'https://doc.fastgpt.cn'],
  ['https://fastgpt.io', 'https://doc.fastgpt.io']
]) {
  test(`robots.txt on ${docsOrigin} permits search crawlers and restricts /api/`, async () => {
    const routing = loadModule('../lib/fastgpt-home-url.ts', {
      imports: { './docs-locale': require('../lib/docs-locale') },
      env: { FASTGPT_HOME_DOMAIN: homeOrigin }
    });
    const { GET } = loadModule('../app/robots.txt/route.ts', {
      imports: {
        'next/server': { NextResponse },
        '@/lib/fastgpt-home-url': routing
      }
    });
    const response = GET();
    assert.equal(response.status, 200);
    assert.equal(await response.text(), `User-Agent: *
Allow: /
Disallow: /api/

Sitemap: ${docsOrigin}/sitemap.xml
`);
  });
}

test('generateArticleSchema emits TechArticle with host-aligned favicon logo', () => {
  const { generateArticleSchema } = loadModule('../lib/schema.ts', { imports: {} });
  const schema = generateArticleSchema({
    title: 'Quick Start',
    description: 'Build your first FastGPT agent.',
    url: 'https://doc.fastgpt.cn/zh-CN/guide/getting-started/quick-start',
    lang: 'zh-CN'
  });
  assert.equal(schema['@type'], 'TechArticle');
  assert.equal(schema.publisher.logo.url, 'https://doc.fastgpt.cn/favicon/favicon.svg');
});

test('middleware resolves section landings, language roots, and historical paths to single-hop 301 targets', () => {
  const { NextRequest } = require('next/server');
  const middleware = loadModule('../middleware.ts', {
    imports: {
      'fumadocs-core/i18n': { createI18nMiddleware: () => () => NextResponse.next() },
      '@/lib/i18n': {
        defaultHomePath: '/guide/getting-started',
        i18n: { defaultLanguage: 'zh-CN', languages: ['zh-CN', 'en'] }
      },
      '@/lib/docs-locale': require('../lib/docs-locale'),
      'next/server': { NextResponse }
    }
  }).default;

  const cases = [
    ['/zh-CN', '/zh-CN/guide/getting-started'],
    ['/en', '/en/guide/getting-started'],
    ['/en/plugin', '/en/plugin/intro'],
    ['/zh-CN/faq/app', '/zh-CN/guide/build/faq'],
    ['/zh-CN/faq/dataset', '/zh-CN/guide/dataset/faq'],
    ['/zh-CN/faq/external_channel_integration', '/zh-CN/guide/build/publish'],
    ['/zh-CN/faq/other', '/zh-CN/guide/version/cloud/faq'],
    ['/zh-CN/faq/points_consumption', '/zh-CN/guide/version/cloud/faq'],
    ['/zh-CN/docs/introduction/FAQ/chat', '/zh-CN/faq/chat'],
    ['/zh-CN/docs/introduction/FAQ/app', '/zh-CN/guide/build/faq'],
    ['/zh-CN/docs/introduction/FAQ/docker', '/zh-CN/self-host/troubleshooting/faq'],
    ['/zh-CN/self-host/config/json', '/zh-CN/self-host/config/env'],
    ['/zh-CN/docs/introduction/development/configuration', '/zh-CN/self-host/config/env'],
    ['/zh-CN/docs/introduction/development/modelConfig/intro', '/zh-CN/self-host/config/model/intro'],
    ['/zh-CN/docs/introduction/development/modelConfig/one-api', '/zh-CN/self-host/config/model/intro'],
    ['/zh-CN/self-host/config/model/ai-proxy', '/zh-CN/self-host/config/model/intro'],
    ['/zh-CN/self-host/config/model/ppio', '/zh-CN/self-host/config/model/intro'],
    ['/zh-CN/docs/introduction/development/proxy/nginx', '/zh-CN/self-host/deploy/docker'],
    ['/zh-CN/self-host/upgrading/4-15/4150', '/zh-CN/self-host/upgrading/4-15/41500'],
    ['/zh-CN/docs/introduction/development/upgrading/48', '/zh-CN/self-host/upgrading/outdated/48'],
    ['/zh-CN/docs/introduction/development/upgrading/4110', '/zh-CN/self-host/upgrading/outdated/4110'],
    ['/zh-CN/guide/build/workflow/nodes/sandbox', '/zh-CN/guide/build/workflow/nodes/sandbox-v2'],
    ['/zh-CN/docs/introduction/guide/dashboard/workflow/sandbox', '/zh-CN/guide/build/workflow/nodes/sandbox-v2'],
    ['/zh-CN/guide/build/workflow/nodes/laf', '/zh-CN/guide/build/workflow/nodes/sandbox-v2'],
    ['/zh-CN/guide/build/tools/system-plugins/bing_search_plugin', '/zh-CN/plugin/team-installation'],
    ['/zh-CN/use-cases/app-cases/dalle3', '/zh-CN/guide/getting-started/examples'],
    ['/zh-CN/docs/introduction/guide/team_permissions/customDomain', '/zh-CN/guide/workspace/customDomain'],
    ['/zh-CN/docs/introduction/guide/course/collection_tags', '/zh-CN/guide/dataset/collection_tags'],
    ['/zh-CN/docs/introduction/guide/course/welcomeText', '/zh-CN/guide/build/general/welcomeText'],
    ['/zh-CN/docs/introduction/guide/course/voiceInput', '/zh-CN/guide/build/general/voiceInput']
  ];

  for (const [input, expected] of cases) {
    const request = new NextRequest(`http://localhost:3210${input}?ref=legacy`);
    const response = middleware(request);
    assert.equal(response.status, 301, `${input} status`);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.pathname, expected, `${input} pathname`);
    assert.equal(location.search, '?ref=legacy', `${input} query`);
  }
});
