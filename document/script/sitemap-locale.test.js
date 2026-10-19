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
    URL
  }, { filename });
  return exports;
}

test('docs locale follows the configured build host', () => {
  assert.equal(getFastGPTDocsLocaleFromHomeOrigin('https://fastgpt.cn'), 'zh-CN');
  assert.equal(getFastGPTDocsLocaleFromHomeOrigin('https://fastgpt.io'), 'en');
  assert.equal(getFastGPTDocsLocaleFromHomeOrigin('https://preview.example.com'), 'en');
});

for (const [variant, locale, homeOrigin, timestamp] of [
  ['cn', 'zh-CN', 'https://fastgpt.cn', '2026-10-12T08:00:00+08:00'],
  ['io', 'en', 'https://fastgpt.io', '2026-10-13T17:01:00+08:00']
]) {
  test(`${locale} sitemap emits its own URLs and physical-file modification dates`, async () => {
    const pages = ['zh-CN', 'en'].flatMap((language) => [
      {
        locale: language,
        url: `/${language}/guide`,
        slugs: ['guide'],
        file: { path: 'guide.mdx' },
        data: {
          _file: { path: language === 'en' ? 'guide.en.mdx' : 'guide.mdx' },
          lastModified: '2026-09-01T00:00:00Z'
        }
      },
      {
        locale: language,
        slugs: ['legacy'],
        data: { _file: { path: `legacy.${language}.mdx` } }
      },
      {
        locale: language,
        url: `/${language}/fallback`,
        slugs: ['fallback'],
        data: { _file: { path: `fallback.${language}.mdx` }, lastModified: '2026-10-01T00:00:00Z' }
      }
    ]);
    // 只有当前语言存在该页，验证没有翻译或更新时间时不会输出错误的 alternate/lastmod。
    pages.push({
      locale,
      slugs: ['undated'],
      data: { _file: { path: `undated.${locale}.mdx` } }
    });
    const routing = loadModule('../lib/fastgpt-home-url.ts', {
      imports: { './docs-locale': require('../lib/docs-locale') },
      env: { FASTGPT_HOME_DOMAIN: homeOrigin }
    });
    const site = loadModule('../lib/site.ts', {
      imports: { './fastgpt-home-url': routing },
      env: { NEXT_PUBLIC_DOC_SITE_VARIANT: variant }
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
              pages.find((page) => page.locale === selectedLocale && page.slugs[0] === slugs[0])
          }
        },
        'next/server': { NextResponse },
        '@/lib/i18n': { i18n: { languages: ['zh-CN', 'en'] } },
        '@/lib/site': site,
        '@/data/doc-last-modified.json': {
          'content/guide.mdx': '2026-10-12T08:00:00+08:00',
          'content/guide.en.mdx': '2026-10-13T17:01:00+08:00',
          [`document/content/legacy.${locale}.mdx`]: '2026-10-02T00:00:00Z'
        }
      }
    });
    const response = GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'application/xml; charset=utf-8');
    const xml = await response.text();
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]);
    const origin = homeOrigin.replace('https://', 'https://doc.');
    assert.deepEqual(
      entries.map((entry) => /<loc>(.*?)<\/loc>/.exec(entry)[1]),
      ['guide', 'legacy', 'fallback', 'undated'].map((slug) => `${origin}/${slug}`)
    );
    assert.ok(entries[0].includes(`<lastmod>${new Date(timestamp).toISOString()}</lastmod>`));
    assert.ok(entries[1].includes('<lastmod>2026-10-02T00:00:00.000Z</lastmod>'));
    assert.ok(entries[2].includes('<lastmod>2026-10-01T00:00:00.000Z</lastmod>'));
    assert.ok(!entries[3].includes('<lastmod>'));

    assert.ok(xml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'));
    for (const [language, alternateOrigin] of [
      ['zh-CN', 'https://doc.fastgpt.cn'],
      ['en', 'https://doc.fastgpt.io'],
      ['x-default', 'https://doc.fastgpt.io']
    ]) {
      assert.ok(entries[0].includes(`hreflang="${language}" href="${alternateOrigin}/guide"`));
    }
    const otherLocale = locale === 'en' ? 'zh-CN' : 'en';
    assert.ok(!entries[3].includes(`hreflang="${otherLocale}"`));
    assert.equal(entries[3].includes('hreflang="x-default"'), locale === 'en');
  });
}
