import assert from 'node:assert/strict';
import test from 'node:test';
import { get } from 'node:http';
import { readFile } from 'node:fs/promises';

const origin = process.env.DOCS_TEST_ORIGIN ?? 'http://localhost:3210';

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

for (const locale of ['zh-CN', 'en']) {
  test(`${locale} machine-readable export contains only the requested language`, async () => {
    const host = locale === 'en' ? 'doc.fastgpt.io' : 'doc.fastgpt.cn';
    const response = await fetch(`${origin}/${locale}/llms.txt`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes(`https://${host}/${locale}/llms-full.txt`));
    assert.ok(body.includes(`https://${host}/${locale}/guide/getting-started`));
    assert.ok(!body.includes(`/${locale}/toc`));
    assert.ok(!body.includes(`/${locale}/openapi/legacy/`));
    assert.ok(!body.includes(`/${locale}/self-host/upgrading/outdated/`));
    assert.match(response.headers.get('content-type'), /text\/plain/);

    const fullResponse = await fetch(`${origin}/${locale}/llms-full.txt`);
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
    assert.ok(urls.every((url) => url.startsWith(`https://${host}/${locale}/`)));
    assert.match(fullResponse.headers.get('content-type'), /text\/plain/);
  });
}

test('legacy paths resolve directly and preserve the query', async () => {
  const response = await fetch(`${origin}/en/docs/FAQ?source=bookmark`, { redirect: 'manual' });
  assert.equal(response.status, 301);
  assert.equal(new URL(response.headers.get('location'), origin).pathname, '/en/faq/chat');
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
  assert.equal(response.headers.location, 'https://doc.fastgpt.io/en/openapi/intro?source=language');
});

for (const [locale, host] of [['zh-CN', 'doc.fastgpt.cn'], ['en', 'doc.fastgpt.io']]) {
  test(`${locale} article exposes its own canonical and reciprocal language links`, async () => {
    const response = await fetch(`${origin}/${locale}/openapi/intro`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`<link rel="canonical" href="https://${host}/${locale}/openapi/intro"`));
    for (const [alternate, alternateHost] of [['zh-CN', 'doc.fastgpt.cn'], ['en', 'doc.fastgpt.io']]) {
      assert.ok(html.includes(`<link rel="alternate" hrefLang="${alternate}" href="https://${alternateHost}/${alternate}/openapi/intro"`));
    }
    assert.ok(html.includes('<link rel="alternate" hrefLang="x-default" href="https://doc.fastgpt.io/en/openapi/intro"'));
    assert.ok(html.includes('"@type":"TechArticle"'));
    assert.ok(html.includes(`https://${host}/favicon/android-chrome-512x512.png`));
    assert.ok(html.includes(`https://${host}/og-image.png`));
    assert.ok(html.includes('/og-image.png'));
    const filename = locale === 'en' ? 'intro.en.mdx' : 'intro.mdx';
    assert.ok(html.includes(`https://github.com/labring/FastGPT/blob/main/document/content/openapi/${filename}`));
  });

  test(`${locale} getting-started breadcrumb list deduplicates URLs and utility/deprecated pages emit noindex`, async () => {
    const homeResponse = await fetch(`${origin}/${locale}/guide/getting-started`);
    assert.equal(homeResponse.status, 200);
    const homeHtml = await homeResponse.text();
    const ldScripts = [...homeHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
      JSON.parse(m[1])
    );
    const breadcrumb = ldScripts.find((item) => item['@type'] === 'BreadcrumbList');
    assert.ok(breadcrumb, 'BreadcrumbList JSON-LD present');
    const urls = breadcrumb.itemListElement.map((item) => item.item);
    assert.equal(new Set(urls).size, urls.length, 'BreadcrumbList URLs are unique');

    const deepResponse = await fetch(`${origin}/${locale}/guide/build/workflow/nodes/ai_chat`);
    assert.equal(deepResponse.status, 200);
    const deepHtml = await deepResponse.text();
    const deepScripts = [...deepHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
      JSON.parse(m[1])
    );
    const deepBreadcrumb = deepScripts.find((item) => item['@type'] === 'BreadcrumbList');
    assert.ok(deepBreadcrumb && deepBreadcrumb.itemListElement.length >= 3, 'Deep page retains intermediate folder hierarchy');
    assert.equal(
      deepBreadcrumb.itemListElement.at(-1).name,
      locale === 'en' ? 'AI Chat' : 'AI 对话'
    );

    const faqResponse = await fetch(`${origin}/${locale}/faq/chat`);
    assert.equal(faqResponse.status, 200);
    const faqHtml = await faqResponse.text();
    const faqScripts = [...faqHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
      JSON.parse(m[1])
    );
    const faqSchema = faqScripts.find((item) => item['@type'] === 'FAQPage');
    assert.ok(faqSchema && faqSchema.mainEntity.length > 0, 'FAQPage JSON-LD present on FAQ page');

    for (const noindexRoute of [
      `/${locale}/toc`,
      `/${locale}/guide/chat/htmlRendering`,
      `/${locale}/openapi/legacy/app`,
      `/${locale}/guide/build/workflow/nodes/loop`
    ]) {
      const res = await fetch(`${origin}${noindexRoute}`);
      assert.equal(res.status, 200, noindexRoute);
      const body = await res.text();
      assert.ok(body.includes('noindex'), `Expected noindex on ${noindexRoute}`);
    }
  });

  test(`${locale} unknown topic returns HTTP 404`, async () => {
    const response = await fetch(`${origin}/${locale}/__missing_documentation_test__`, { redirect: 'manual' });
    assert.equal(response.status, 404);
    const html = await response.text();
    // Next hydrates the localized recovery boundary; its links are checked in browser acceptance.
    assert.ok(html.includes('<meta name="robots" content="noindex"'));
  });

  test(`${locale} search returns localized topics and historical version references`, async () => {
    for (const query of [locale === 'en' ? 'Agent' : '知识库', 'V4.14.5']) {
      const response = await fetch(`${origin}/api/search?${new URLSearchParams({ query, locale })}`);
      assert.equal(response.status, 200);
      const results = await response.json();
      assert.ok(results.length > 0, `Search results for ${query}`);
      assert.ok(results.every((result) => result.url.startsWith(`/${locale}/`)));
      if (query === 'V4.14.5') {
        assert.ok(results.some((result) => result.url.includes('/self-host/upgrading/4-14/4145')));
      }
    }
  });
}

test('legacy prefix redirects match path segments and retain encoded query values', async () => {
  for (const [legacy, target] of [
    ['/en/docs/introduction/development/openapi/chat', '/en/openapi/chat'],
    ['/zh-CN/FAQ', '/zh-CN/faq/chat'],
    ['/en/plugin', '/en/plugin/intro'],
    ['/zh-CN/faq/app', '/zh-CN/guide/build/faq'],
    ['/zh-CN/self-host/config/json', '/zh-CN/self-host/config/env'],
    ['/zh-CN/self-host/upgrading/4-15/4150', '/zh-CN/self-host/upgrading/4-15/41500'],
    ['/zh-CN/guide/build/workflow/nodes/sandbox', '/zh-CN/guide/build/workflow/nodes/sandbox-v2'],
    ['/zh-CN/use-cases/app-cases/dalle3', '/zh-CN/guide/getting-started']
  ]) {
    const query = '?source=bookmark&value=a%2Fb%20c';
    const response = await fetch(`${origin}${legacy}${query}`, { redirect: 'manual' });
    assert.equal(response.status, 301);
    const destination = new URL(response.headers.get('location'), origin);
    assert.equal(destination.pathname, target);
    assert.deepEqual([...destination.searchParams], [...new URLSearchParams(query)]);
    const targetResponse = await fetch(`${origin}${destination.pathname}`, { redirect: 'manual' });
    assert.equal(targetResponse.status, 200, `Redirect target must return 200: ${destination.pathname}`);
  }
  for (const path of ['/en/FAQish', '/english/openapi/intro']) {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
    const location = response.headers.get('location');
    if (location) {
      const destination = new URL(location, origin);
      assert.ok(destination.pathname.endsWith(path), `Preserve the complete unmatched path: ${path}`);
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
        !record.url.endsWith('/guide/chat/htmlRendering')
    )
  );
});
