const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
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
    Headers,
    Response
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
      },
      {
        locale: language,
        slugs: ['legacy-page'],
        url: `/${language}/legacy-page`,
        data: {
          deprecated: true,
          _file: { path: language === 'en' ? 'legacy-page.en.mdx' : 'legacy-page.mdx' },
          lastModified: '2026-10-01T00:00:00Z'
        }
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
    const text = await response.text();
    for (const agent of [
      '*',
      'OAI-SearchBot',
      'GPTBot',
      'ChatGPT-User',
      'PerplexityBot',
      'ClaudeBot',
      'Google-Extended'
    ]) {
      assert.ok(text.includes(`User-Agent: ${agent}\nAllow: /\nDisallow: /api/`), `Missing ${agent}`);
    }
    assert.ok(text.endsWith(`\nSitemap: ${docsOrigin}/sitemap.xml\n`));
  });
}

test('llms.txt emits an llmstxt.org Markdown index with canonical links and excludes deprecated/outdated pages', async () => {
  const routing = loadModule('../lib/fastgpt-home-url.ts', {
    imports: { './docs-locale': require('../lib/docs-locale') },
    env: { FASTGPT_HOME_DOMAIN: 'https://fastgpt.io' }
  });
  const { GET } = loadModule('../app/[lang]/llms.txt/route.ts', {
    imports: {
      '@/lib/source': {
        source: {
          getPages: () => [
            {
              url: '/en/guide/getting-started',
              data: {
                title: 'Getting Started',
                description: 'Build your first FastGPT agent.',
                _file: { path: 'guide/getting-started/index.en.mdx' }
              }
            },
            {
              url: '/en/openapi/intro',
              data: {
                title: 'OpenAPI Intro',
                description: 'Authenticate and call FastGPT APIs.',
                _file: { path: 'openapi/intro.en.mdx' }
              }
            },
            {
              url: '/en/self-host',
              data: {
                title: 'Self-Host Overview',
                description: 'Deploy and operate FastGPT.',
                _file: { path: 'self-host/index.en.mdx' }
              }
            },
            {
              url: '/en/openapi/legacy/app',
              data: {
                title: 'Legacy App API',
                deprecated: true,
                _file: { path: 'openapi/legacy/app.en.mdx' }
              }
            },
            {
              url: '/en/self-host/upgrading/outdated/48',
              data: {
                title: 'V4.8',
                _file: { path: 'self-host/upgrading/outdated/48.en.mdx' }
              }
            }
          ]
        }
      },
      '@/lib/fastgpt-home-url': routing,
      '@/lib/i18n': { i18n: { languages: ['zh-CN', 'en'] } }
    }
  });

  const response = await GET(new Request('https://doc.fastgpt.io/en/llms.txt'), {
    params: Promise.resolve({ lang: 'en' })
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(body.startsWith('# FastGPT Documentation\n'));
  assert.ok(body.includes('https://doc.fastgpt.io/en/llms-full.txt'));
  assert.ok(body.includes('- [Getting Started](https://doc.fastgpt.io/en/guide/getting-started): Build your first FastGPT agent.'));
  assert.ok(body.includes('- [OpenAPI Intro](https://doc.fastgpt.io/en/openapi/intro): Authenticate and call FastGPT APIs.'));
  assert.ok(body.includes('- [Self-Host Overview](https://doc.fastgpt.io/en/self-host): Deploy and operate FastGPT.'));
  assert.ok(!body.includes('/en/openapi/legacy/app'));
  assert.ok(!body.includes('/en/self-host/upgrading/outdated/48'));
});

test('generateArticleSchema and generateFaqSchema emit rich-result compliant JSON-LD', () => {
  const { generateArticleSchema, generateFaqSchema } = loadModule('../lib/schema.ts', { imports: {} });
  const schema = generateArticleSchema({
    title: 'Quick Start',
    description: 'Build your first FastGPT agent.',
    url: 'https://doc.fastgpt.cn/zh-CN/guide/getting-started/quick-start',
    lang: 'zh-CN'
  });
  assert.equal(schema['@type'], 'TechArticle');
  assert.equal(schema.publisher.logo.url, 'https://doc.fastgpt.cn/favicon/android-chrome-512x512.png');
  assert.equal(schema.image, 'https://doc.fastgpt.cn/og-image.png');

  const faqSchema = generateFaqSchema({
    headings: [
      { id: 'section-1', content: '1. Import Stage' },
      { id: 'q1', content: 'Why did PDF parsing fail?' }
    ],
    contents: [
      { heading: 'q1', content: 'Check whether the PDF is password-protected or scanned.' },
      { heading: 'q1', content: 'Run OCR before uploading scanned PDFs.' }
    ]
  });
  assert.equal(faqSchema['@type'], 'FAQPage');
  assert.equal(faqSchema.mainEntity.length, 1);
  assert.equal(faqSchema.mainEntity[0]['@type'], 'Question');
  assert.equal(faqSchema.mainEntity[0].name, 'Why did PDF parsing fail?');
  assert.equal(
    faqSchema.mainEntity[0].acceptedAnswer.text,
    'Check whether the PDF is password-protected or scanned.\n\nRun OCR before uploading scanned PDFs.'
  );
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
    ['/zh-CN/faq/external_channel_integration', '/zh-CN/guide/build/publish/versions'],
    ['/zh-CN/use-cases/external-integration', '/zh-CN/guide/build/publish/versions'],
    ['/zh-CN/faq/other', '/zh-CN/guide/version/cloud/faq'],
    ['/zh-CN/faq/points_consumption', '/zh-CN/guide/version/cloud/faq'],
    ['/zh-CN/faq/attention', '/zh-CN/self-host/troubleshooting/attention'],
    ['/zh-CN/shopping_cart/intro', '/zh-CN/guide/version/commercial'],
    ['/zh-CN/docs/introduction/FAQ/chat', '/zh-CN/faq/chat'],
    ['/zh-CN/docs/introduction/FAQ/app', '/zh-CN/guide/build/faq'],
    ['/zh-CN/docs/introduction/FAQ/docker', '/zh-CN/self-host/troubleshooting/faq'],
    ['/zh-CN/self-host/config/json', '/zh-CN/self-host/config/env'],
    ['/zh-CN/self-host/config/sandbox/common', '/zh-CN/self-host/config/sandbox/opensandbox'],
    ['/zh-CN/docs/introduction/development/configuration', '/zh-CN/self-host/config/env'],
    ['/zh-CN/docs/introduction/development/signoz', '/zh-CN/self-host/config/signoz'],
    ['/zh-CN/docs/introduction/development/modelConfig/intro', '/zh-CN/self-host/config/model/intro'],
    ['/zh-CN/docs/introduction/development/modelConfig/one-api', '/zh-CN/self-host/config/model/intro'],
    ['/zh-CN/self-host/config/model/ai-proxy', '/zh-CN/self-host/config/model/intro'],
    ['/zh-CN/self-host/config/model/ppio', '/zh-CN/self-host/config/model/intro'],
    ['/zh-CN/development/docker', '/zh-CN/self-host/deploy/docker'],
    ['/zh-CN/docs/introduction/development/proxy/nginx', '/zh-CN/self-host/deploy/docker'],
    ['/zh-CN/self-host/upgrading/4-15/4150', '/zh-CN/self-host/upgrading/4-15/41500'],
    ['/zh-CN/self-host/upgrading/4-16/4163', '/zh-CN/self-host/upgrading/4-17/4170'],
    ['/zh-CN/docs/introduction/development/upgrading/48', '/zh-CN/self-host/upgrading/outdated/48'],
    ['/zh-CN/docs/introduction/development/upgrading/4110', '/zh-CN/self-host/upgrading/outdated/4110'],
    ['/zh-CN/upgrading/4-8/48', '/zh-CN/self-host/upgrading/outdated/48'],
    ['/zh-CN/upgrading/4-10/4100', '/zh-CN/self-host/upgrading/outdated/4100'],
    ['/zh-CN/guide/build/agentv2/startup', '/zh-CN/guide/build/agentv2/vm'],
    ['/zh-CN/guide/build/workflow/nodes/sandbox', '/zh-CN/guide/build/workflow/nodes/sandbox-v2'],
    ['/zh-CN/docs/introduction/guide/dashboard/workflow/sandbox', '/zh-CN/guide/build/workflow/nodes/sandbox-v2'],
    ['/zh-CN/guide/dashboard/workflow/ai_chat', '/zh-CN/guide/build/workflow/nodes/ai_chat'],
    ['/zh-CN/guide/build/workflow/nodes/laf', '/zh-CN/guide/build/workflow/nodes/sandbox-v2'],
    ['/zh-CN/guide/build/tools/system-plugins/bing_search_plugin', '/zh-CN/plugin/team-installation'],
    ['/zh-CN/use-cases/app-cases/dalle3', '/zh-CN/guide/getting-started'],
    ['/zh-CN/docs/introduction/guide/team_permissions/customDomain', '/zh-CN/guide/workspace/customDomain'],
    ['/zh-CN/docs/introduction/guide/course/collection_tags', '/zh-CN/guide/dataset/collection_tags'],
    ['/zh-CN/docs/introduction/guide/course/welcomeText', '/zh-CN/guide/build/general/welcomeText'],
    ['/zh-CN/docs/introduction/guide/course/voiceInput', '/zh-CN/guide/build/general/voiceInput'],
    ['/zh-cn/docs/openapi/intro', '/zh-CN/openapi/intro'],
    ['/zh-CN/openapi/intro/', '/zh-CN/openapi/intro'],
    ['/zh-CN/guide/getting-started/index', '/zh-CN/guide/getting-started'],
    ['/zh-CN/guide/knowledge_base', '/zh-CN/guide/dataset/rag'],
    ['/zh-CN/guide/plugins', '/zh-CN/plugin/team-installation'],
    ['/zh-CN/guide/DialogBoxes', '/zh-CN/guide/chat/html'],
    ['/zh-CN/guide/team_permissions', '/zh-CN/guide/workspace/team/team_roles_permissions'],
    ['/zh-CN/development/modelConfig', '/zh-CN/self-host/config/model/intro'],
    ['/zh-CN/use-cases/external-integration/iframe_integration', '/zh-CN/guide/build/publish/link'],
    ['/zh-CN/use-cases/external-integration/onwechat', '/zh-CN/guide/build/publish/wechat'],
    ['/zh-CN/introduction/openapi/intro', '/zh-CN/openapi/intro'],
    ['/zh-CN/introduction/openapi/chat', '/zh-CN/openapi/chat'],
    ['/zh-CN/introduction/openapi/dataset', '/zh-CN/openapi/dataset'],
    ['/zh-CN/introduction/openapi/app', '/zh-CN/openapi/app'],
    ['/zh-CN/introduction/openapi/share', '/zh-CN/guide/build/publish/link'],
    ['/zh-CN/introduction/openapi/swagger', '/zh-CN/openapi/intro'],
    ['/zh-CN/introduction/development/openapi/swagger', '/zh-CN/openapi/intro'],
    ['/zh-CN/openapi/swagger', '/zh-CN/openapi/intro'],
    ['/zh-CN/introduction/guide/knowledge_base/externalFile', '/zh-CN/guide/dataset/third-party/third_dataset'],
    ['/zh-CN/introduction/guide/plugins/how_to_submit_system_plugin', '/zh-CN/plugin/system-tool-development'],
    ['/zh-CN/protocol', '/zh-CN/guide/version/opensource/license'],
    ['/zh-CN/protocol/open-source', '/zh-CN/guide/version/opensource/license'],
    ['/zh-CN/introduction/shopping_cart', '/zh-CN/guide/version/commercial'],
    ['/zh-CN/introduction/shopping_cart/saas', '/zh-CN/guide/version/commercial'],
    ['/zh-CN/introduction/development/quick-start', '/zh-CN/self-host/deploy/docker'],
    ['/zh-CN/introduction/development/custom-models', '/zh-CN/self-host/config/model/intro'],
    ['/zh-CN/introduction/development/community', '/zh-CN/guide/getting-started'],
    ['/zh-CN/introduction/development/upgrading', '/zh-CN/self-host/upgrading/upgrade-instruction'],
    ['/zh-CN/introduction/development/design', '/zh-CN/self-host/design/dataset'],
    ['/zh-CN/introduction/development/migration', '/zh-CN/self-host/migration/docker_db'],
    ['/zh-CN/guide/build', '/zh-CN/guide/build/chat-agent'],
    ['/zh-CN/guide/build/agentv2', '/zh-CN/guide/build/agentv2/settings'],
    ['/zh-CN/guide/build/general', '/zh-CN/guide/build/general/ai_settings'],
    ['/zh-CN/guide/build/publish', '/zh-CN/guide/build/publish/versions'],
    ['/zh-CN/guide/build/skill', '/zh-CN/guide/build/skill/intro'],
    ['/zh-CN/guide/build/tools', '/zh-CN/guide/build/tools/overview'],
    ['/zh-CN/guide/build/tools/system-plugins', '/zh-CN/guide/build/tools/system-plugins/upload_system_tool'],
    ['/zh-CN/guide/build/workflow', '/zh-CN/guide/build/workflow/intro'],
    ['/zh-CN/guide/build/workflow/nodes', '/zh-CN/guide/build/workflow/nodes/ai_chat'],
    ['/zh-CN/guide/chat', '/zh-CN/guide/chat/html'],
    ['/zh-CN/guide/dataset', '/zh-CN/guide/dataset/lifecycle'],
    ['/zh-CN/guide/dataset/third-party', '/zh-CN/guide/dataset/third-party/api_dataset'],
    ['/zh-CN/guide/getting-started/examples', '/zh-CN/guide/getting-started/examples/email-assistant'],
    ['/zh-CN/guide/version', '/zh-CN/guide/version/cloud/intro'],
    ['/zh-CN/guide/version/cloud', '/zh-CN/guide/version/cloud/intro'],
    ['/zh-CN/guide/version/opensource', '/zh-CN/guide/version/opensource/intro'],
    ['/zh-CN/guide/workspace', '/zh-CN/guide/workspace/team/team_roles_permissions'],
    ['/zh-CN/guide/workspace/team', '/zh-CN/guide/workspace/team/team_roles_permissions'],
    ['/zh-CN/self-host/config', '/zh-CN/self-host/config/model/intro'],
    ['/zh-CN/self-host/config/sandbox', '/zh-CN/self-host/config/sandbox/opensandbox'],
    ['/zh-CN/self-host/deploy', '/zh-CN/self-host/deploy/docker'],
    ['/zh-CN/self-host/troubleshooting', '/zh-CN/self-host/troubleshooting/attention'],
    ['/zh-CN/self-host/upgrading/4-12', '/zh-CN/self-host/upgrading/4-12/4124'],
    ['/zh-CN/self-host/upgrading/4-13', '/zh-CN/self-host/upgrading/4-13/4132'],
    ['/zh-CN/self-host/upgrading/4-14', '/zh-CN/self-host/upgrading/4-14/41431'],
    ['/zh-CN/self-host/upgrading/4-15', '/zh-CN/self-host/upgrading/4-15/4158'],
    ['/zh-CN/self-host/upgrading/4-16', '/zh-CN/self-host/upgrading/4-16/4162'],
    ['/zh-CN/self-host/upgrading/4-17', '/zh-CN/self-host/upgrading/4-17/4173'],
    ['/zh-CN/self-host/upgrading/outdated', '/zh-CN/self-host/upgrading/outdated/4111']
  ];

  const contentRoot = path.join(__dirname, '../content');
  for (const [input, expected] of cases) {
    const request = new NextRequest(`http://localhost:3210${input}?ref=legacy`);
    const response = middleware(request);
    assert.equal(response.status, 301, `${input} status`);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.pathname, expected, `${input} pathname`);
    assert.equal(location.search, '?ref=legacy', `${input} query`);

    const [, locale, ...slugParts] = expected.split('/');
    const relativeSlug = slugParts.join('/');
    const ext = locale === 'en' ? '.en.mdx' : '.mdx';
    const targetExists =
      fs.existsSync(path.join(contentRoot, `${relativeSlug}${ext}`)) ||
      fs.existsSync(path.join(contentRoot, relativeSlug, `index${ext}`));
    assert.ok(targetExists, `Redirect target must exist in content/: ${expected}`);
  }

  const historicalFiles = [
    ...new Set(
      execSync(
        'git log --all --pretty=format: --name-only -- "document/content/**/*.mdx" "document/content/**/*.md"',
        { cwd: path.join(__dirname, '../..') }
      )
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean)
    )
  ];
  assert.ok(historicalFiles.length >= 1600);
  for (const histFile of historicalFiles) {
    let rel = histFile.replace(/^document\/content(?:\/docs)?/, '');
    const isEn = rel.endsWith('.en.mdx') || rel.endsWith('.en.md');
    rel = rel.replace(/(?:\.en)?\.(?:mdx|md)$/, '');
    if (rel.endsWith('/index')) rel = rel.slice(0, -6) || '/';
    if (rel === '/toc' || rel.startsWith('/api')) continue;
    const locale = isEn ? 'en' : 'zh-CN';
    const req = new NextRequest(`http://localhost:3210/${locale}${rel}`);
    const res = middleware(req);
    const finalPathname =
      res.status === 301
        ? new URL(res.headers.get('location')).pathname
        : `/${locale}${rel}`;
    const slug = finalPathname.replace(/^\/(?:zh-CN|en)\//, '');
    const ext = isEn ? '.en.mdx' : '.mdx';
    const exists =
      fs.existsSync(path.join(contentRoot, `${slug}${ext}`)) ||
      fs.existsSync(path.join(contentRoot, slug, `index${ext}`));
    assert.ok(exists, `Historical route ${histFile} -> ${finalPathname} must exist`);
  }
});
