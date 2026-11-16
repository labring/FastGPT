import assert from 'node:assert/strict';
import test from 'node:test';
import { get } from 'node:http';
import { readFile } from 'node:fs/promises';
import docsLocale from '../lib/docs-locale.js';

const origin = process.env.DOCS_TEST_ORIGIN ?? 'http://localhost:3210';
const originUrl = new URL(origin);
const variant = docsLocale.resolveDocsSiteVariant();
const isPreview = variant === 'preview';
const ownerLocale = (() => {
  if (variant === 'cn') return 'zh-CN';
  if (variant === 'io') return 'en';
  return undefined;
})();
const activeLocales = ownerLocale !== undefined ? [ownerLocale] : ['zh-CN', 'en'];
const toRoute = (locale, routePath) => (isPreview ? `/${locale}${routePath}` : routePath);
const expectedRedirectOrigin = (targetLocale) =>
  !isPreview && targetLocale !== ownerLocale
    ? docsLocale.getFastGPTDocsOriginForLocale(targetLocale)
    : originUrl.origin;

/** Check whether SSR HTML contains a crawlable `<a href hreflang lang>` language switch link. */
const hasLanguageSwitchAnchor = (markup, targetLocale, expectedHref) => {
  for (const [tag] of markup.matchAll(/<a\b[^>]*>/gi)) {
    const href = tag.match(/\bhref="([^"]+)"/i)?.[1];
    const hrefLang = tag.match(/\bhreflang="([^"]+)"/i)?.[1];
    const langAttr = tag.match(/\blang="([^"]+)"/i)?.[1];
    if (href === expectedHref && hrefLang === targetLocale && langAttr === targetLocale) {
      return true;
    }
  }
  return false;
};

/** Split a Vary header into lowercase tokens so `Accept-Encoding` never satisfies an `Accept` check. */
const varyTokens = (response) =>
  (response.headers.get('vary') ?? '').split(',').map((token) => token.trim().toLowerCase());

test('tutorial downloads preserve their bytes for both language preferences', async () => {
  for (const filename of ['sales.csv', 'civil-code-lease.txt', 'content-review-workflow.json', 'content-review-workflow.en.json']) {
    const expected = await readFile(new URL(`../public/examples/${filename}`, import.meta.url), 'utf8');
    for (const locale of ['zh-CN', 'en']) {
      const response = await fetch(`${origin}/examples/${filename}`, {
        redirect: 'manual',
        headers: { cookie: `FD_LOCALE=${locale}` }
      });
      assert.equal(response.status, 200, `${locale}: ${filename}`);
      assert.equal(await response.text(), expected);
    }
  }
});

for (const locale of activeLocales) {
  test(`${locale} machine-readable export contains only the requested language`, async () => {
    const host = locale === 'en' ? 'doc.fastgpt.io' : 'doc.fastgpt.cn';
    const llmsPath = isPreview ? `/${locale}/llms.txt` : '/llms.txt';
    const fullPath = isPreview ? `/${locale}/llms-full.txt` : '/llms-full.txt';
    const response = await fetch(`${origin}${llmsPath}`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes(`https://${host}/llms-full.txt`));
    assert.ok(body.includes(`https://${host}/guide/getting-started`));
    assert.ok(!body.includes('/toc'));
    assert.ok(!body.includes('/openapi/legacy/'));
    assert.ok(!body.includes('/self-host/upgrading/outdated/'));
    assert.match(response.headers.get('content-type'), /text\/plain/);

    const fullResponse = await fetch(`${origin}${fullPath}`);
    assert.equal(fullResponse.status, 200);
    const fullBody = await fullResponse.text();
    const files = [...fullBody.matchAll(/^file: (.+)$/gm)].map((match) => match[1]);
    const urls = [...fullBody.matchAll(/^url: (.+)$/gm)].map((match) => match[1]);
    const titles = [...fullBody.matchAll(/^title: (.+)$/gm)].map((match) => match[1]);
    assert.ok(files.length >= 180, 'Active documentation topics are exported');
    assert.equal(urls.length, files.length, 'Every exported file includes its canonical URL');
    assert.equal(titles.length, files.length, 'Every exported file includes its title');
    assert.ok(files.every((file) => file.endsWith('.en.mdx') === (locale === 'en')));
    assert.ok(files.every((file) => !/\/toc(?:\.en)?\.mdx$/.test(file)));
    assert.ok(files.every((file) => !file.includes('/self-host/upgrading/outdated/')));
    assert.ok(
      urls.every(
        (url) => url.startsWith(`https://${host}/`) && !/^https:\/\/[^/]+\/(?:zh-CN|en)(?:\/|$)/.test(url)
      )
    );
    assert.ok(
      !/^import\s+.*from\s+['"](?:@\/components\/|fumadocs-)/m.test(fullBody),
      'MDX component import statements stripped from llms-full.txt'
    );
    assert.ok(!/<Alert[\s>]/.test(fullBody), 'Alert JSX converted to pure Markdown');
    assert.ok(!/<Tabs[\s>]/.test(fullBody), 'Tabs JSX converted to pure Markdown');
    assert.ok(!/<MermaidDiagram[\s>]/.test(fullBody), 'MermaidDiagram JSX converted to code block');
    assert.ok(!/<FastGPTLink[\s>]/.test(fullBody), 'FastGPTLink JSX unwrapped in llms-full.txt');
    assert.match(fullResponse.headers.get('content-type'), /text\/plain/);
  });
}

test('root machine-readable endpoints and single-page Markdown negotiation respond directly', async () => {
  const rootLlms = await fetch(`${origin}/llms.txt`, { redirect: 'manual' });
  assert.equal(rootLlms.status, 200);
  assert.match(await rootLlms.text(), /^# FastGPT/m);

  const pricing = await fetch(`${origin}/pricing.md`, { redirect: 'manual' });
  assert.equal(pricing.status, 200);
  assert.match(pricing.headers.get('content-type') ?? '', /text\/markdown/);
  assert.match(
    pricing.headers.get('link') ?? '',
    /<https:\/\/doc\.fastgpt\.(?:io|cn)\/guide\/version\/commercial>;\s*rel="canonical"/
  );
  const pricingBody = await pricing.text();
  assert.ok(pricingBody.includes('Sealos') && pricingBody.includes('0.410993'));

  const localizedPricing = await fetch(`${origin}/en/pricing.md`, { redirect: 'manual' });
  assert.equal(localizedPricing.status, 301);
  assert.equal(new URL(localizedPricing.headers.get('location'), origin).pathname, '/pricing.md');

  const bundlePaths = isPreview
    ? ['/llms-guide.txt', '/en/llms-openapi.txt', '/zh-CN/llms-self-host.txt']
    : ['/llms-guide.txt', '/llms-openapi.txt', '/llms-self-host.txt'];
  for (const bundlePath of bundlePaths) {
    const bundleRes = await fetch(`${origin}${bundlePath}`, { redirect: 'manual' });
    assert.equal(bundleRes.status, 200, bundlePath);
    assert.match(bundleRes.headers.get('content-type') ?? '', /text\/plain/);
    assert.ok((await bundleRes.text()).includes('url: https://doc.fastgpt.'));
  }

  const sampleLocale = activeLocales.includes('en') ? 'en' : 'zh-CN';
  const sampleHost = sampleLocale === 'en' ? 'doc.fastgpt.io' : 'doc.fastgpt.cn';
  const introRoute = toRoute(sampleLocale, '/openapi/intro');
  const dotMd = await fetch(`${origin}${introRoute}.md`, { redirect: 'manual' });
  assert.equal(dotMd.status, 200);
  assert.match(dotMd.headers.get('content-type') ?? '', /text\/markdown/);
  assert.equal(
    dotMd.headers.get('link'),
    `<https://${sampleHost}/openapi/intro>; rel="canonical"`
  );
  const dotMdBody = await dotMd.text();
  assert.ok(dotMdBody.includes(`Source: https://${sampleHost}/openapi/intro`));
  assert.ok(!/^import\s+.*from\s+['"](?:@\/components\/|fumadocs-)/m.test(dotMdBody));

  const negotiated = await fetch(`${origin}${introRoute}`, {
    redirect: 'manual',
    headers: { accept: 'text/markdown' }
  });
  assert.equal(negotiated.status, 200);
  assert.match(negotiated.headers.get('content-type') ?? '', /text\/markdown/);
  assert.ok(varyTokens(negotiated).includes('accept'));
  assert.ok((await negotiated.text()).includes(`Source: https://${sampleHost}/openapi/intro`));

  const htmlNegotiated = await fetch(`${origin}${introRoute}`, {
    redirect: 'manual',
    headers: { accept: 'text/html' }
  });
  assert.equal(htmlNegotiated.status, 200);
  assert.equal(htmlNegotiated.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  assert.ok(varyTokens(htmlNegotiated).includes('rsc'));
});

test('legacy archive screenshot zoom targets resolve to HTTP 200 assets', async () => {
  const sampleLocale = activeLocales.includes('en') ? 'en' : 'zh-CN';
  const pageRes = await fetch(
    `${origin}${toRoute(sampleLocale, '/self-host/custom-models/legacy/bge-rerank')}`
  );
  assert.equal(pageRes.status, 200);
  const html = await pageRes.text();
  assert.ok(!html.includes('/imgs/rerank1.png'), 'Missing original /imgs/rerank1.png must not appear as zoom target');
  const imgMatches = new Set(
    [...html.matchAll(/\/imgs\/[A-Za-z0-9_./-]+\.(?:png|jpg|jpeg|webp|svg)/g)].map((m) => m[0])
  );
  assert.ok(imgMatches.has('/imgs/optimized/rerank1.png.webp'));
  for (const imgPath of imgMatches) {
    const assetRes = await fetch(`${origin}${imgPath}`);
    assert.equal(assetRes.status, 200, imgPath);
  }
});

test('legacy paths resolve directly and preserve the query', async () => {
  const sampleLocale = activeLocales[0];
  const response = await fetch(`${origin}/${sampleLocale}/docs/FAQ?source=bookmark`, {
    redirect: 'manual'
  });
  assert.equal(response.status, 301);
  assert.equal(
    new URL(response.headers.get('location'), origin).pathname,
    toRoute(sampleLocale, '/faq/chat')
  );
  assert.equal(new URL(response.headers.get('location'), origin).search, '?source=bookmark');
});

test('production language URLs redirect to their owning host', async () => {
  const response = await new Promise((resolve, reject) => {
    get(`${origin}/en/openapi/intro?source=language`, { headers: { host: 'doc.fastgpt.cn' } }, (response) => {
      response.resume();
      resolve(response);
    }).on('error', reject);
  });
  assert.equal(response.statusCode, 301);
  assert.equal(response.headers.location, 'https://doc.fastgpt.io/openapi/intro?source=language');
});

for (const [locale, host] of [
  ['zh-CN', 'doc.fastgpt.cn'],
  ['en', 'doc.fastgpt.io']
].filter(([itemLocale]) => activeLocales.includes(itemLocale))) {
  test(`${locale} article exposes its own canonical and reciprocal language links`, async () => {
    const routePath = toRoute(locale, '/openapi/intro');
    const response = await fetch(`${origin}${routePath}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`<link rel="canonical" href="https://${host}${routePath}"`));
    const alternateLocale = locale === 'en' ? 'zh-CN' : 'en';
    const alternateTargetHost = alternateLocale === 'en' ? 'doc.fastgpt.io' : 'doc.fastgpt.cn';
    if (isPreview) {
      assert.ok(html.includes('noindex'));
      assert.ok(!/<link\b[^>]*\shreflang=/i.test(html));
      assert.ok(hasLanguageSwitchAnchor(html, alternateLocale, `/${alternateLocale}/openapi/intro`));
    } else {
      for (const [alternate, alternateHost] of [['zh-CN', 'doc.fastgpt.cn'], ['en', 'doc.fastgpt.io']]) {
        assert.ok(html.includes(`<link rel="alternate" hrefLang="${alternate}" href="https://${alternateHost}/openapi/intro"`));
      }
      assert.ok(
        hasLanguageSwitchAnchor(html, alternateLocale, `https://${alternateTargetHost}/openapi/intro`)
      );
      assert.ok(html.includes('<link rel="alternate" hrefLang="x-default" href="https://doc.fastgpt.io/openapi/intro"'));
      assert.ok(html.includes(`<link rel="alternate" type="text/markdown" href="https://${host}/openapi/intro.md"`));
      assert.ok(html.includes('"@type":"TechArticle"'));
      assert.ok(html.includes(`https://${host}/favicon/android-chrome-512x512.png`));
    }
    assert.ok(html.includes(`https://${host}/og-image.png`));
    assert.ok(html.includes('/og-image.png'));
    const filename = locale === 'en' ? 'intro.en.mdx' : 'intro.mdx';
    assert.ok(html.includes(`https://github.com/labring/FastGPT/blob/main/document/content/openapi/${filename}`));
  });

  test(`${locale} getting-started breadcrumb list deduplicates URLs and utility/deprecated pages emit noindex`, async () => {
    const homeResponse = await fetch(`${origin}${toRoute(locale, '/guide/getting-started')}`);
    assert.equal(homeResponse.status, 200);
    const homeHtml = await homeResponse.text();
    if (!isPreview) {
      const ldScripts = [...homeHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
        JSON.parse(m[1])
      );
      const breadcrumb = ldScripts.find((item) => item['@type'] === 'BreadcrumbList');
      assert.ok(breadcrumb, 'BreadcrumbList JSON-LD present');
      assert.ok(
        breadcrumb.itemListElement.length >= 2,
        'Home BreadcrumbList must contain at least 2 items'
      );
      const urls = breadcrumb.itemListElement.map((item) => item.item);
      assert.equal(new Set(urls).size, urls.length, 'BreadcrumbList URLs are unique');
      const siteGraph = ldScripts.find((item) => Array.isArray(item['@graph']));
      assert.ok(
        siteGraph && siteGraph['@graph'].some((node) => node['@type'] === 'WebSite'),
        'Home page emits WebSite JSON-LD graph'
      );
    }

    const deepResponse = await fetch(
      `${origin}${toRoute(locale, '/guide/build/workflow/nodes/ai_chat')}`
    );
    assert.equal(deepResponse.status, 200);
    const deepHtml = await deepResponse.text();
    assert.ok(
      deepHtml.includes(locale === 'en' ? 'AI Chat Workflow Node' : 'AI 对话工作流节点'),
      'Workflow node title expanded for search intent'
    );
    if (!isPreview) {
      const deepScripts = [...deepHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
        JSON.parse(m[1])
      );
      const deepBreadcrumb = deepScripts.find((item) => item['@type'] === 'BreadcrumbList');
      assert.ok(deepBreadcrumb && deepBreadcrumb.itemListElement.length >= 3, 'Deep page retains intermediate folder hierarchy');
      assert.equal(
        deepBreadcrumb.itemListElement.at(-1).name,
        locale === 'en' ? 'AI Chat' : 'AI 对话'
      );

      const faqResponse = await fetch(`${origin}${toRoute(locale, '/faq/chat')}`);
      assert.equal(faqResponse.status, 200);
      const faqHtml = await faqResponse.text();
      const faqScripts = [...faqHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
        JSON.parse(m[1])
      );
      const faqSchema = faqScripts.find((item) => item['@type'] === 'FAQPage');
      assert.ok(faqSchema && faqSchema.mainEntity.length > 0, 'FAQPage JSON-LD present on FAQ page');
    }

    for (const noindexRoute of [
      toRoute(locale, '/toc'),
      toRoute(locale, '/guide/chat/htmlRendering'),
      toRoute(locale, '/openapi/legacy/app'),
      toRoute(locale, '/guide/build/workflow/nodes/loop'),
      toRoute(locale, '/self-host/upgrading/outdated/48')
    ]) {
      const res = await fetch(`${origin}${noindexRoute}`);
      assert.equal(res.status, 200, noindexRoute);
      const body = await res.text();
      assert.ok(body.includes('noindex'), `Expected noindex on ${noindexRoute}`);
      assert.ok(
        !/<link\b[^>]*\shreflang=/i.test(body),
        `Unexpected hreflang alternate link on noindex route ${noindexRoute}`
      );
      assert.ok(!body.includes('"@type":"TechArticle"'), `Unexpected TechArticle JSON-LD on noindex route ${noindexRoute}`);
    }
  });

  test(`${locale} unknown topic returns HTTP 404`, async () => {
    const response = await fetch(
      `${origin}${toRoute(locale, '/__missing_documentation_test__')}`,
      { redirect: 'manual' }
    );
    assert.equal(response.status, 404);
    const html = await response.text();
    // Next hydrates the localized recovery boundary; its links are checked in browser acceptance.
    assert.ok(html.includes('<meta name="robots" content="noindex"'));
    assert.ok(!html.includes('<link rel="canonical"'), '404 must omit root canonical tag');
    assert.ok(!/<link\b[^>]*\shreflang=/i.test(html), '404 must omit root hreflang tags');
  });

  test(`${locale} search returns localized topics and historical version references`, async () => {
    for (const query of [locale === 'en' ? 'Agent' : '知识库', 'V4.14.5']) {
      const response = await fetch(`${origin}/api/search?${new URLSearchParams({ query, locale })}`);
      assert.equal(response.status, 200);
      const results = await response.json();
      assert.ok(results.length > 0, `Search results for ${query}`);
      assert.ok(
        results.every((result) =>
          isPreview
            ? result.url.startsWith(`/${locale}/`)
            : result.url.startsWith('/') && !/^\/(?:zh-CN|en)(?:\/|$)/.test(result.url)
        )
      );
      if (query === 'V4.14.5') {
        assert.ok(results.some((result) => result.url.includes('/self-host/upgrading/4-14/4145')));
      }
    }
    const outdatedSearch = await fetch(
      `${origin}/api/search?${new URLSearchParams({ query: 'V4.8', locale })}`
    );
    assert.equal(outdatedSearch.status, 200);
    const outdatedResults = await outdatedSearch.json();
    assert.ok(
      outdatedResults.every((result) => !result.url.includes('/self-host/upgrading/outdated/')),
      'Deprecated outdated release pages are excluded from search'
    );
  });
}

test('legacy prefix redirects match path segments and retain encoded query values', async () => {
  const query = '?source=bookmark&value=a%2Fb%20c';
  for (const [targetLocale, legacySuffix, routePath] of [
    ['en', '/docs/introduction/development/openapi/chat', '/openapi/best-practices/app-integration'],
    ['zh-CN', '/FAQ', '/faq/chat'],
    ['en', '/plugin', '/plugin/intro'],
    ['zh-CN', '/faq/app', '/guide/build/faq'],
    ['zh-CN', '/self-host/config/json', '/self-host/config/env'],
    ['zh-CN', '/self-host/upgrading/4-15/4150', '/self-host/upgrading/4-15/41500'],
    ['zh-CN', '/guide/build/workflow/nodes/sandbox', '/guide/build/workflow/nodes/sandbox-v2'],
    ['zh-CN', '/use-cases/app-cases/feishu_webhook', '/guide/build/publish/feishu']
  ]) {
    const legacy = `/${targetLocale}${legacySuffix}`;
    const response = await fetch(`${origin}${legacy}${query}`, { redirect: 'manual' });
    assert.equal(response.status, 301, legacy);
    const destination = new URL(response.headers.get('location'), origin);
    assert.equal(destination.origin, expectedRedirectOrigin(targetLocale), `${legacy} redirect origin`);
    assert.equal(destination.pathname, toRoute(targetLocale, routePath), `${legacy} redirect pathname`);
    assert.deepEqual([...destination.searchParams], [...new URLSearchParams(query)]);

    if (destination.origin === originUrl.origin) {
      const targetResponse = await fetch(`${origin}${destination.pathname}`, { redirect: 'manual' });
      assert.equal(targetResponse.status, 200, `Redirect target must return 200: ${destination.pathname}`);
    }

    if (!isPreview) {
      const ownerLegacyResponse = await fetch(`${origin}${legacySuffix}${query}`, {
        redirect: 'manual'
      });
      assert.equal(ownerLegacyResponse.status, 301, legacySuffix);
      const ownerDestination = new URL(ownerLegacyResponse.headers.get('location'), origin);
      assert.equal(ownerDestination.origin, originUrl.origin, `${legacySuffix} owner redirect origin`);
      assert.equal(ownerDestination.pathname, routePath, `${legacySuffix} owner redirect pathname`);
      assert.deepEqual([...ownerDestination.searchParams], [...new URLSearchParams(query)]);
      const ownerTargetResponse = await fetch(`${origin}${ownerDestination.pathname}`, {
        redirect: 'manual'
      });
      assert.equal(
        ownerTargetResponse.status,
        200,
        `Owner redirect target must return 200: ${ownerDestination.pathname}`
      );
    }
  }
  const goneResponse = await fetch(`${origin}/zh-CN/use-cases/app-cases/dalle3`, {
    redirect: 'manual'
  });
  assert.equal(goneResponse.status, 410);
  assert.equal(goneResponse.headers.get('x-robots-tag'), 'noindex');

  for (const [path, unmatchedLocale, expectedTail] of [
    ['/en/FAQish', 'en', '/FAQish'],
    ['/english/openapi/intro', undefined, '/english/openapi/intro']
  ]) {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
    const location = response.headers.get('location');
    if (location) {
      const destination = new URL(location, origin);
      if (unmatchedLocale !== undefined) {
        assert.equal(destination.origin, expectedRedirectOrigin(unmatchedLocale));
        assert.equal(destination.pathname, toRoute(unmatchedLocale, expectedTail));
      } else {
        assert.ok(
          destination.pathname.endsWith(expectedTail),
          `Preserve the complete unmatched path: ${path}`
        );
      }
      if (destination.origin === originUrl.origin) {
        const followUp = await fetch(`${origin}${destination.pathname}`, { redirect: 'manual' });
        assert.equal(followUp.status, 404, `Unmatched redirect target must 404: ${destination.pathname}`);
      }
    } else {
      assert.equal(response.status, 404);
    }
  }
});

test('social preview image and static search export satisfy discovery contracts', async () => {
  const ogResponse = await fetch(`${origin}/og-image.png`);
  assert.equal(ogResponse.status, 200);
  assert.match(ogResponse.headers.get('content-type') ?? '', /image\/png/);

  const staticResponse = await fetch(`${origin}/static.json`);
  assert.equal(staticResponse.status, 200);
  const records = await staticResponse.json();
  assert.ok(Array.isArray(records) && records.length > 0);
  assert.ok(
    records.every(
      (record) =>
        !/\/toc$/.test(record.url) &&
        !record.url.includes('/openapi/legacy/') &&
        !record.url.endsWith('/guide/chat/htmlRendering') &&
        !record.url.includes('/self-host/upgrading/outdated/')
    )
  );
});
