const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');
const matter = require('gray-matter');
const ts = require('typescript');
const { NextResponse } = require('next/server');
const {
  getFastGPTDocsLocaleFromHomeOrigin,
  getProductionDocsUrl,
  resolveDocsSiteVariant,
  stripDocsLocalePrefix
} = require('../lib/docs-locale');

/** Split a Vary header into lowercase tokens so `Accept-Encoding` never satisfies an `Accept` check. */
const varyTokens = (response) =>
  (response.headers.get('vary') ?? '').split(',').map((token) => token.trim().toLowerCase());

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
    process: { env, cwd: () => path.resolve(__dirname, '..') },
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
  assert.equal(resolveDocsSiteVariant({ siteVariant: 'cn' }), 'cn');
  assert.equal(resolveDocsSiteVariant({ siteVariant: 'io' }), 'io');
  assert.equal(resolveDocsSiteVariant({ siteVariant: 'preview' }), 'preview');
  assert.equal(resolveDocsSiteVariant({ homeOrigin: 'https://fastgpt.cn' }), 'cn');
  assert.equal(resolveDocsSiteVariant({ homeOrigin: 'https://fastgpt.io' }), 'io');
  assert.deepEqual(stripDocsLocalePrefix('/zh-CN/guide/getting-started?tab=1#top'), {
    locale: 'zh-CN',
    pathname: '/guide/getting-started',
    path: '/guide/getting-started?tab=1#top'
  });
  assert.equal(
    getProductionDocsUrl('en', '/en/openapi/intro?source=docs'),
    'https://doc.fastgpt.io/openapi/intro?source=docs'
  );
});

for (const [locale, homeOrigin, timestamp] of [
  ['zh-CN', 'https://fastgpt.cn', '2026-10-12T08:00:00+08:00'],
  ['en', 'https://fastgpt.io', '2026-10-13T17:01:00+08:00']
]) {
  test(`${locale} sitemap emits unprefixed URLs, dynamic alternates, and physical-file modification dates`, async () => {
    const pages = ['zh-CN', 'en'].flatMap((language) => [
      {
        locale: language,
        slugs: ['guide'],
        url: '/guide',
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
        url: '/undated',
        data: { _file: { path: `undated.${language}.mdx` } }
      },
      ...(language === locale
        ? [
            {
              locale: language,
              slugs: ['single-locale'],
              url: '/single-locale',
              data: { _file: { path: language === 'en' ? 'single-locale.en.mdx' : 'single-locale.mdx' } }
            }
          ]
        : []),
      {
        locale: language,
        slugs: ['toc'],
        url: '/toc',
        data: { _file: { path: language === 'en' ? 'toc.en.mdx' : 'toc.mdx' } }
      },
      {
        locale: language,
        slugs: ['legacy-page'],
        url: '/legacy-page',
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
    const docsOrigin = homeOrigin.replace('https://', 'https://doc.');
    const singleLocaleAlternates =
      locale === 'zh-CN'
        ? '    <xhtml:link rel="alternate" hreflang="zh-CN" href="https://doc.fastgpt.cn/single-locale" />'
        : [
            '    <xhtml:link rel="alternate" hreflang="en" href="https://doc.fastgpt.io/single-locale" />',
            '    <xhtml:link rel="alternate" hreflang="x-default" href="https://doc.fastgpt.io/single-locale" />'
          ].join('\n');
    assert.equal(await response.text(), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${docsOrigin}/guide</loc>
    <lastmod>${timestamp}</lastmod>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="https://doc.fastgpt.cn/guide" />
    <xhtml:link rel="alternate" hreflang="en" href="https://doc.fastgpt.io/guide" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://doc.fastgpt.io/guide" />
  </url>
  <url>
    <loc>${docsOrigin}/fallback</loc>
    <lastmod>2026-10-01T00:00:00Z</lastmod>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="https://doc.fastgpt.cn/fallback" />
    <xhtml:link rel="alternate" hreflang="en" href="https://doc.fastgpt.io/fallback" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://doc.fastgpt.io/fallback" />
  </url>
  <url>
    <loc>${docsOrigin}/undated</loc>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="https://doc.fastgpt.cn/undated" />
    <xhtml:link rel="alternate" hreflang="en" href="https://doc.fastgpt.io/undated" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://doc.fastgpt.io/undated" />
  </url>
  <url>
    <loc>${docsOrigin}/single-locale</loc>
${singleLocaleAlternates}
  </url>
</urlset>`);
  });
}

test('preview robots.txt and sitemap.xml block indexing', async () => {
  const routing = loadModule('../lib/fastgpt-home-url.ts', {
    imports: { './docs-locale': require('../lib/docs-locale') },
    env: { DOCS_SITE_VARIANT: 'preview', FASTGPT_HOME_DOMAIN: 'https://fastgpt.io' }
  });
  const { GET: getRobots } = loadModule('../app/robots.txt/route.ts', {
    imports: { 'next/server': { NextResponse }, '@/lib/fastgpt-home-url': routing }
  });
  const robotsRes = getRobots();
  assert.equal(robotsRes.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(await robotsRes.text(), 'User-agent: *\nDisallow: /\n');

  const { GET: getSitemap } = loadModule('../app/sitemap.xml/route.ts', {
    imports: {
      '@/lib/source': { source: { getPages: () => [] } },
      'next/server': { NextResponse },
      '@/lib/fastgpt-home-url': routing,
      '@/data/doc-last-modified.json': {}
    }
  });
  const sitemapRes = getSitemap();
  assert.equal(sitemapRes.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.ok(!(await sitemapRes.text()).includes('<loc>'));
});

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
      'Google-Extended',
      'Applebot-Extended',
      'Amazonbot'
    ]) {
      assert.ok(text.includes(`User-Agent: ${agent}\nAllow: /\nDisallow: /api/`), `Missing ${agent}`);
    }
    assert.ok(text.includes(`# AI Context: ${docsOrigin}/llms.txt`));
    assert.ok(text.includes(`# Pricing & Editions: ${docsOrigin}/pricing.md`));
    assert.ok(text.endsWith(`\nSitemap: ${docsOrigin}/sitemap.xml\n`));
  });
}

test('llms.txt emits an llmstxt.org Markdown index with canonical links and excludes deprecated/outdated pages', async () => {
  const routing = loadModule('../lib/fastgpt-home-url.ts', {
    imports: { './docs-locale': require('../lib/docs-locale') },
    env: { FASTGPT_HOME_DOMAIN: 'https://fastgpt.io' }
  });
  const mockSource = {
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
  };
  const llmsMarkdown = loadModule('../lib/llms-markdown.ts', {
    imports: {
      'node:fs/promises': require('node:fs/promises'),
      'node:path': path,
      'fast-glob': require('fast-glob'),
      'gray-matter': matter,
      remark: require('remark'),
      'remark-gfm': require('remark-gfm'),
      'remark-mdx': require('remark-mdx'),
      'remark-stringify': require('remark-stringify'),
      'fumadocs-mdx/config': { remarkInclude: () => () => {} },
      '@/lib/source': mockSource,
      '@/lib/api-reference-notice': loadModule('../lib/api-reference-notice.ts', { imports: {} }),
      '@/lib/fastgpt-home-url': routing
    }
  });
  const { GET } = loadModule('../app/[lang]/llms.txt/route.ts', {
    imports: {
      '@/lib/llms-markdown': llmsMarkdown,
      '@/lib/i18n': {
        i18n: { languages: ['zh-CN', 'en'] },
        getSearchableLanguages: () => ['en']
      }
    }
  });

  const response = await GET(new Request('https://doc.fastgpt.io/en/llms.txt'), {
    params: Promise.resolve({ lang: 'en' })
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(body.startsWith('# FastGPT Documentation\n'));
  assert.ok(body.includes('https://doc.fastgpt.io/llms-full.txt'));
  assert.ok(body.includes('https://doc.fastgpt.io/llms-guide.txt'));
  assert.ok(body.includes('https://doc.fastgpt.io/llms-openapi.txt'));
  assert.ok(body.includes('https://doc.fastgpt.io/llms-self-host.txt'));
  assert.ok(body.includes('https://doc.fastgpt.io/pricing.md'));
  assert.ok(body.includes('- [Getting Started](https://doc.fastgpt.io/guide/getting-started): Build your first FastGPT agent.'));
  assert.ok(body.includes('- [OpenAPI Intro](https://doc.fastgpt.io/openapi/intro): Authenticate and call FastGPT APIs.'));
  assert.ok(body.includes('- [Self-Host Overview](https://doc.fastgpt.io/self-host): Deploy and operate FastGPT.'));
  assert.ok(!body.includes('/openapi/legacy/app'));
  assert.ok(!body.includes('/self-host/upgrading/outdated/48'));

  const cleaned = await llmsMarkdown.renderCleanMdxBody(
    './content/sample.en.mdx',
    [
      "import { Alert } from '@/components/docs/Alert';",
      '',
      '<span id="anchor" />',
      '',
      '<Alert context="info">',
      '  Important deployment tip. See [OpenAPI](/en/openapi/intro).',
      '</Alert>',
      '',
      '<Card title="RAG Guide" href="/en/guide/dataset/rag" />',
      '',
      '<Tabs items={["Docker"]}>',
      '  <Tab value="Docker">',
      '    Run `docker compose up -d`.',
      '  </Tab>',
      '</Tabs>',
      '',
      '<MermaidDiagram chart="graph TD; A-->B;" />',
      '',
      '<CommercialContactDialog label="Contact Sales" url="https://fastgpt.io/contact" />'
    ].join('\n')
  );
  assert.ok(!cleaned.includes('import '));
  assert.ok(!cleaned.includes('<Alert'));
  assert.ok(!cleaned.includes('<Tabs'));
  assert.ok(!cleaned.includes('<span'));
  assert.ok(cleaned.includes('> Important deployment tip. See [OpenAPI](/openapi/intro).'));
  assert.ok(cleaned.includes('[RAG Guide](/guide/dataset/rag)'));
  assert.ok(cleaned.includes('#### Docker'));
  assert.ok(cleaned.includes('```mermaid\ngraph TD; A-->B;\n```'));
  assert.ok(cleaned.includes('[Contact Sales](https://fastgpt.io/contact)'));

  for (const [component, title] of [
    ['<ApiReferenceNotice />', '在线 API 文档'],
    ['<ApiReferenceNotice language="en" />', 'Online API Reference']
  ]) {
    const notice = await llmsMarkdown.renderCleanMdxBody('./content/sample.mdx', component);
    assert.ok(notice.includes(`> **${title}**`));
    assert.ok(notice.includes('https://cloud.fastgpt.cn/apidoc/systemopenapi'));
    assert.ok(notice.includes('https://cloud.fastgpt.io/apidoc/systemopenapi'));
    assert.ok(notice.includes('`<instance>/apidoc/systemopenapi`'));
    assert.ok(!notice.includes('<ApiReferenceNotice'));
  }
});

test('schema helpers expand search titles and emit rich-result compliant JSON-LD', () => {
  const {
    resolvePageSeoTitle,
    generateArticleSchema,
    generateWebSiteSchema,
    generateFaqSchema
  } = loadModule('../lib/schema.ts', { imports: {} });

  assert.equal(
    resolvePageSeoTitle({
      path: 'guide/getting-started',
      title: '使用 FastGPT',
      lang: 'zh-CN'
    }),
    'FastGPT 官方文档 - AI Agent、知识库 RAG 与可视化工作流构建指南'
  );
  assert.equal(
    resolvePageSeoTitle({
      path: 'guide/getting-started',
      title: 'Use FastGPT',
      lang: 'en'
    }),
    'FastGPT Documentation - AI Agent, RAG Knowledge Base & Workflow Guide'
  );
  assert.equal(
    resolvePageSeoTitle({
      path: 'guide/build/workflow/nodes/ai_chat.mdx',
      title: 'AI 对话',
      lang: 'zh-CN'
    }),
    'AI 对话工作流节点'
  );
  assert.equal(
    resolvePageSeoTitle({
      path: 'guide/build/workflow/nodes/ai_chat.en.mdx',
      title: 'AI Chat',
      lang: 'en'
    }),
    'AI Chat Workflow Node'
  );
  assert.equal(
    resolvePageSeoTitle({
      path: 'self-host/upgrading/4-18/4180.mdx',
      title: 'V4.18.0(含初始化脚本)',
      lang: 'zh-CN'
    }),
    'V4.18.0(含初始化脚本) 更新说明与升级指南'
  );
  assert.equal(
    resolvePageSeoTitle({
      path: 'self-host/upgrading/4-18/4180.en.mdx',
      title: 'V4.18.0 (Includes Initialization Script)',
      lang: 'en'
    }),
    'V4.18.0 (Includes Initialization Script) Release Notes & Upgrade Guide'
  );
  assert.equal(
    resolvePageSeoTitle({
      path: 'self-host/deploy/docker.mdx',
      title: 'Docker Compose 部署',
      lang: 'zh-CN'
    }),
    'Docker Compose 私有化部署指南'
  );
  assert.equal(
    resolvePageSeoTitle({
      path: 'self-host/deploy/docker.en.mdx',
      title: 'Deploy with Docker Compose',
      lang: 'en'
    }),
    'Deploy with Docker Compose (Self-Hosted)'
  );
  assert.equal(
    resolvePageSeoTitle({
      path: 'openapi/chat.mdx',
      title: '会话、流式响应与错误处理',
      lang: 'zh-CN'
    }),
    '会话、流式响应与错误处理 OpenAPI 参考'
  );
  assert.equal(
    resolvePageSeoTitle({
      path: 'openapi/chat.en.mdx',
      title: 'Conversations, streaming, and errors',
      lang: 'en'
    }),
    'Conversations, streaming, and errors — OpenAPI Reference'
  );

  const modifiedDate = new Date('2026-10-20T00:00:00.000Z');
  const schema = generateArticleSchema({
    title: 'Quick Start',
    description: 'Build your first FastGPT agent.',
    url: 'https://doc.fastgpt.cn/guide/getting-started/quick-start',
    dateModified: modifiedDate,
    lang: 'zh-CN'
  });
  assert.equal(schema['@type'], 'TechArticle');
  assert.equal(schema.publisher.logo.url, 'https://doc.fastgpt.cn/favicon/android-chrome-512x512.png');
  assert.equal(schema.image, 'https://doc.fastgpt.cn/og-image.png');
  assert.equal(schema.datePublished, '2026-10-20T00:00:00.000Z');
  assert.equal(schema.dateModified, '2026-10-20T00:00:00.000Z');

  const siteSchema = generateWebSiteSchema({
    url: 'https://doc.fastgpt.io/guide/getting-started',
    lang: 'en'
  });
  assert.equal(siteSchema['@graph'].length, 2);
  assert.equal(siteSchema['@graph'][0]['@type'], 'Organization');
  assert.equal(siteSchema['@graph'][0]['@id'], 'https://fastgpt.io/#organization');
  assert.equal(siteSchema['@graph'][1]['@type'], 'WebSite');
  assert.equal(siteSchema['@graph'][1].url, 'https://doc.fastgpt.io/guide/getting-started');

  const faqSchema = generateFaqSchema({
    headings: [
      { id: 'section-1', content: '1. Import Stage' },
      { id: 'account-group', content: 'Account and Team Questions' },
      { id: 'q1', content: 'Why did PDF parsing fail?' }
    ],
    contents: [
      { heading: 'account-group', content: 'Introductory overview paragraph for the section.' },
      { heading: 'q1', content: 'Check whether the PDF is password-protected or scanned.' },
      { heading: 'q1', content: 'Run OCR before uploading scanned PDFs.' }
    ],
    toc: [
      { url: '#section-1', depth: 2 },
      { url: '#account-group', depth: 2 },
      { url: '#q1', depth: 3 }
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
  const { unstable_doesMiddlewareMatch } = require('next/experimental/testing/server');
  const { default: middleware, config: middlewareConfig } = loadModule('../middleware.ts', {
    imports: {
      'fumadocs-core/i18n': { createI18nMiddleware: () => () => NextResponse.next() },
      '@/lib/i18n': {
        defaultHomePath: '/guide/getting-started',
        i18n: { defaultLanguage: 'zh-CN', languages: ['zh-CN', 'en'] }
      },
      '@/lib/docs-locale': require('../lib/docs-locale'),
      '@/data/doc-last-modified.json': require('../data/doc-last-modified.json'),
      'next/server': { NextResponse }
    }
  });

  const cliSkillPath = '/cli/skill.md';
  const cliSkillResponse = middleware(new NextRequest(`http://localhost:3210${cliSkillPath}`));
  assert.equal(cliSkillResponse.headers.get('x-middleware-next'), '1');
  assert.equal(unstable_doesMiddlewareMatch({ config: middlewareConfig, url: cliSkillPath }), false);
  assert.ok(fs.existsSync(path.join(__dirname, '../public', cliSkillPath)));

  const cases = [
    ['/zh-CN', '/zh-CN/guide/getting-started'],
    ['/en', '/en/guide/getting-started'],
    ['/EN/openapi/intro', '/en/openapi/intro'],
    ['/zh-CN/Docs/openapi/intro', '/zh-CN/openapi/intro'],
    ['/zh-CN/guide/admin/teammode', '/zh-CN/guide/admin/teamMode'],
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
    ['/zh-CN/use-cases/app-cases/feishu_webhook', '/zh-CN/guide/build/publish/feishu'],
    ['/zh-CN/use-cases/app-cases/english_essay_correction_bot', '/zh-CN/guide/getting-started/first-agent'],
    ['/zh-CN/use-cases/app-cases/unknown_legacy_case', '/zh-CN/guide/getting-started'],
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
    ['/zh-CN/introduction/openapi/chat', '/zh-CN/openapi/best-practices/app-integration'],
    ['/zh-CN/introduction/openapi/dataset', '/zh-CN/openapi/dataset'],
    ['/zh-CN/introduction/openapi/app', '/zh-CN/openapi/best-practices/app-integration'],
    ['/zh-CN/introduction/openapi/share', '/zh-CN/guide/build/publish/link'],
    ['/zh-CN/introduction/openapi/swagger', '/zh-CN/openapi/intro'],
    ['/zh-CN/introduction/development/openapi/swagger', '/zh-CN/openapi/intro'],
    ['/zh-CN/openapi/swagger', '/zh-CN/openapi/intro'],
    ['/zh-CN/openapi/best-practices', '/zh-CN/openapi/intro'],
    ['/zh-CN/introduction/guide/knowledge_base/externalFile', '/zh-CN/guide/dataset/third-party/third_dataset'],
    ['/zh-CN/introduction/guide/plugins/how_to_submit_system_plugin', '/zh-CN/plugin/system-tool-development'],
    ['/zh-CN/protocol', '/zh-CN/guide/version/opensource/license'],
    ['/zh-CN/protocol/open-source', '/zh-CN/guide/version/opensource/license'],
    ['/zh-CN/introduction/shopping_cart', '/zh-CN/guide/version/commercial'],
    ['/zh-CN/introduction/shopping_cart/saas', '/zh-CN/guide/version/commercial'],
    ['/zh-CN/introduction/development/quick-start', '/zh-CN/self-host/deploy/docker'],
    ['/zh-CN/introduction/development/custom-models', '/zh-CN/self-host/config/model/intro'],
    ['/zh-CN/self-host/custom-models/bge-rerank', '/zh-CN/self-host/custom-models/legacy/bge-rerank'],
    ['/zh-CN/self-host/custom-models/chatglm2-m3e', '/zh-CN/self-host/custom-models/legacy/chatglm2-m3e'],
    ['/zh-CN/self-host/custom-models/chatglm2', '/zh-CN/self-host/custom-models/legacy/chatglm2'],
    ['/zh-CN/self-host/custom-models/m3e', '/zh-CN/self-host/custom-models/legacy/m3e'],
    ['/zh-CN/self-host/custom-models/marker', '/zh-CN/self-host/custom-models/legacy/marker'],
    ['/en/docs/development/custom-models/bge-rerank', '/en/self-host/custom-models/legacy/bge-rerank'],
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
    ['/zh-CN/self-host/upgrading/4-17', '/zh-CN/self-host/upgrading/4-17/4175'],
    ['/zh-CN/self-host/upgrading/4-18', '/zh-CN/self-host/upgrading/4-18/4180'],
    ['/zh-CN/self-host/upgrading/outdated', '/zh-CN/self-host/upgrading/outdated/4111'],
    ['/docs/agreement/terms/', '/zh-CN/guide/version/cloud/terms'],
    ['/docs/agreement/privacy/', '/zh-CN/guide/version/cloud/privacy'],
    ['/docs/agreement/disclaimer/', '/zh-CN/guide/version/cloud/terms'],
    ['/docs/commercial', '/zh-CN/guide/version/commercial'],
    ['/docs/pricing/', '/zh-CN/guide/version/commercial'],
    ['/docs/course/ai_settings/', '/zh-CN/guide/build/general/ai_settings'],
    ['/docs/course/chat_input_guide', '/zh-CN/guide/build/general/chat_input_guide'],
    ['/docs/course/custom_link', '/zh-CN/guide/build/publish/link'],
    ['/docs/course/feishu', '/zh-CN/guide/build/publish/feishu'],
    ['/docs/course/official_account', '/zh-CN/guide/build/publish/official_account'],
    ['/docs/course/webSync', '/zh-CN/guide/dataset/websync'],
    ['/docs/installation', '/zh-CN/self-host/deploy/docker'],
    ['/docs/installation/one-api/', '/zh-CN/self-host/config/model/intro'],
    ['/docs/installation/reference', '/zh-CN/self-host/config/env'],
    ['/docs/installation/reference/models', '/zh-CN/self-host/config/model/intro'],
    ['/docs/installation/upgrading', '/zh-CN/self-host/upgrading/upgrade-instruction'],
    ['/docs/use-cases/ai_settings/', '/zh-CN/guide/build/general/ai_settings'],
    ['/docs/use-cases/datasetengine', '/zh-CN/guide/dataset/rag'],
    ['/docs/use-cases/feishu-bot', '/zh-CN/guide/build/publish/feishu'],
    ['/docs/use-cases/wecom-bot', '/zh-CN/guide/build/publish/wecom'],
    ['/docs/use-cases/official_account', '/zh-CN/guide/build/publish/official_account'],
    ['/docs/use-cases/onwechat/', '/zh-CN/guide/build/publish/wechat'],
    ['/docs/workflow', '/zh-CN/guide/build/workflow/intro'],
    ['/docs/workflow/intro', '/zh-CN/guide/build/workflow/intro'],
    ['/docs/workflow/modules/laf/', '/zh-CN/guide/build/workflow/nodes/sandbox-v2'],
    ['/docs/workflow/modules/text_editor/', '/zh-CN/guide/build/workflow/nodes/text_editor'],
    ['/docs/workflow/modules/tfswitch/', '/zh-CN/guide/build/workflow/nodes/tfswitch'],
    ['/docs/workflow/modules/custom_feedback/', '/zh-CN/guide/build/workflow/nodes/custom_feedback'],
    ['/docs/workflow/modules/coreferenceresolution/', '/zh-CN/guide/build/workflow/nodes/coreferenceResolution']
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

  const retiredTopics = new Set([
    '/use-cases/app-cases/dalle3',
    '/use-cases/app-cases/fixingevidence',
    '/use-cases/app-cases/translate-subtitle-using-gpt'
  ]);
  for (const retired of [
    '/zh-CN/use-cases/app-cases/dalle3',
    '/en/docs/use-cases/app-cases/fixingevidence',
    '/zh-CN/use-cases/app-cases/translate-subtitle-using-gpt.md'
  ]) {
    const res = middleware(new NextRequest(`http://localhost:3210${retired}`));
    assert.equal(res.status, 410, `${retired} should return 410 Gone`);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  }

  const anonPass = middleware(new NextRequest('http://localhost:3210/en/openapi/intro'));
  assert.equal(anonPass.status, 200);
  assert.equal(
    anonPass.headers.get('cache-control'),
    'public, max-age=0, must-revalidate'
  );
  assert.equal(anonPass.headers.get('content-language'), 'en');
  assert.equal(anonPass.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.ok(varyTokens(anonPass).includes('accept'));
  assert.equal(anonPass.headers.get('set-cookie'), null);

  const markdownNegotiated = middleware(
    new NextRequest('http://localhost:3210/en/openapi/intro', {
      headers: { accept: 'text/markdown' }
    })
  );
  assert.equal(markdownNegotiated.status, 200);
  assert.ok(varyTokens(markdownNegotiated).includes('accept'));

  const localizedPricing = middleware(new NextRequest('http://localhost:3210/en/pricing.md?src=agent'));
  assert.equal(localizedPricing.status, 301);
  assert.equal(localizedPricing.headers.get('location'), 'http://localhost:3210/pricing.md?src=agent');

  const legacyCnDomain = middleware(
    new NextRequest('https://doc.fastgpt.in/docs/course/websync', {
      headers: { host: 'doc.fastgpt.in' }
    })
  );
  assert.equal(legacyCnDomain.status, 301);
  assert.equal(
    legacyCnDomain.headers.get('location'),
    'https://doc.fastgpt.cn/guide/dataset/websync'
  );

  const legacyEnDomain = middleware(
    new NextRequest('https://doc.tryfastgpt.ai/en/openapi/intro', {
      headers: { host: 'doc.tryfastgpt.ai' }
    })
  );
  assert.equal(legacyEnDomain.status, 301);
  assert.equal(
    legacyEnDomain.headers.get('location'),
    'https://doc.fastgpt.io/openapi/intro'
  );

  for (const [variant, host, ownerLocale, crossLocale, crossHost] of [
    ['cn', 'doc.fastgpt.cn', 'zh-CN', 'en', 'doc.fastgpt.io'],
    ['io', 'doc.fastgpt.io', 'en', 'zh-CN', 'doc.fastgpt.cn']
  ]) {
    const { default: ownerMiddleware } = loadModule('../middleware.ts', {
      env: { DOCS_SITE_VARIANT: variant },
      imports: {
        'fumadocs-core/i18n': { createI18nMiddleware: () => () => NextResponse.next() },
        '@/lib/i18n': {
          defaultHomePath: '/guide/getting-started',
          i18n: { defaultLanguage: 'zh-CN', languages: ['zh-CN', 'en'] }
        },
        '@/lib/docs-locale': require('../lib/docs-locale'),
        '@/data/doc-last-modified.json': require('../data/doc-last-modified.json'),
        'next/server': { NextResponse }
      }
    });

    const ownerHit = ownerMiddleware(
      new NextRequest(`https://${host}/openapi/intro?tab=auth`, { headers: { host } })
    );
    assert.equal(ownerHit.status, 200);
    assert.equal(
      ownerHit.headers.get('x-middleware-rewrite'),
      `https://${host}/${ownerLocale}/openapi/intro?tab=auth`
    );
    assert.equal(ownerHit.headers.get('content-language'), ownerLocale);
    assert.equal(ownerHit.headers.get('x-robots-tag'), null);
    assert.equal(ownerHit.headers.get('set-cookie'), null);

    const sameHostPrefixed = ownerMiddleware(
      new NextRequest(`https://${host}/${ownerLocale}/openapi/intro?tab=auth`, {
        headers: { host }
      })
    );
    assert.equal(sameHostPrefixed.status, 301);
    assert.equal(
      sameHostPrefixed.headers.get('location'),
      `https://${host}/openapi/intro?tab=auth`
    );

    const crossHostPrefixed = ownerMiddleware(
      new NextRequest(`https://${host}/${crossLocale}/openapi/intro?tab=auth`, {
        headers: { host }
      })
    );
    assert.equal(crossHostPrefixed.status, 301);
    assert.equal(
      crossHostPrefixed.headers.get('location'),
      `https://${crossHost}/openapi/intro?tab=auth`
    );

    const rootHit = ownerMiddleware(
      new NextRequest(`https://${host}/?utm_source=home`, { headers: { host } })
    );
    assert.equal(rootHit.status, 301);
    assert.equal(
      rootHit.headers.get('location'),
      `https://${host}/guide/getting-started?utm_source=home`
    );

    const prefixedLlms = ownerMiddleware(
      new NextRequest(`https://${host}/${crossLocale}/llms-full.txt?v=1`, { headers: { host } })
    );
    assert.equal(prefixedLlms.status, 301);
    assert.equal(prefixedLlms.headers.get('location'), `https://${crossHost}/llms-full.txt?v=1`);

    const unprefixedMd = ownerMiddleware(
      new NextRequest(`https://${host}/openapi/intro.md`, { headers: { host } })
    );
    assert.equal(unprefixedMd.status, 200);
    assert.equal(
      unprefixedMd.headers.get('x-middleware-rewrite'),
      `https://${host}/api/doc-markdown/${ownerLocale}/openapi/intro`
    );

    const prefixedMd = ownerMiddleware(
      new NextRequest(`https://${host}/${ownerLocale}/openapi/intro.md?raw=1`, {
        headers: { host }
      })
    );
    assert.equal(prefixedMd.status, 301);
    assert.equal(
      prefixedMd.headers.get('location'),
      `https://${host}/openapi/intro.md?raw=1`
    );
  }

  const staleCookiePass = middleware(
    new NextRequest('http://localhost:3210/en/openapi/intro', {
      headers: { cookie: 'FD_LOCALE=zh-CN' }
    })
  );
  assert.match(staleCookiePass.headers.get('set-cookie') ?? '', /FD_LOCALE=en/);

  const historicalFiles = [
    ...new Set(
      execSync(
        'git log HEAD --pretty=format: --name-only -- "document/content/**/*.mdx" "document/content/**/*.md"',
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
    const ext = isEn ? '.en.mdx' : '.mdx';
    const currentSourceCandidates = [
      path.join(contentRoot, `${rel.slice(1)}${ext}`),
      path.join(contentRoot, rel.slice(1), `index${ext}`)
    ];
    const currentSourceFile = currentSourceCandidates.find((filePath) => fs.existsSync(filePath));
    if (
      currentSourceFile &&
      matter(fs.readFileSync(currentSourceFile, 'utf8')).data.draft === true
    ) {
      continue;
    }
    const locale = isEn ? 'en' : 'zh-CN';
    const req = new NextRequest(`http://localhost:3210/${locale}${rel}`);
    const res = middleware(req);
    if (retiredTopics.has(rel.toLowerCase())) {
      assert.equal(res.status, 410, `Retired historical route ${histFile} must return 410`);
      continue;
    }
    const finalPathname =
      res.status === 301
        ? new URL(res.headers.get('location')).pathname
        : `/${locale}${rel}`;
    const slug = finalPathname.replace(/^\/(?:zh-CN|en)\//, '');
    const targetCandidates = [
      path.join(contentRoot, `${slug}${ext}`),
      path.join(contentRoot, slug, `index${ext}`)
    ];
    const targetFile = targetCandidates.find((filePath) => fs.existsSync(filePath));
    assert.ok(targetFile, `Historical route ${histFile} -> ${finalPathname} must exist`);
    assert.notEqual(
      matter(fs.readFileSync(targetFile, 'utf8')).data.draft,
      true,
      `Historical route ${histFile} -> ${finalPathname} must resolve to a published page`
    );
  }
});
