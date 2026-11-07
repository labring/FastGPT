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

for (const [locale, homeOrigin, timestamp] of [
  ['zh-CN', 'https://fastgpt.cn', '2026-10-12T08:00:00+08:00'],
  ['en', 'https://fastgpt.io', '2026-10-13T17:01:00+08:00']
]) {
  test(`${locale} sitemap emits its own URLs and physical-file modification dates`, async () => {
    const pages = ['zh-CN', 'en'].flatMap((language) => [
      {
        locale: language,
        url: `/${language}/guide`,
        file: { path: 'guide.mdx' },
        data: {
          _file: { path: language === 'en' ? 'guide.en.mdx' : 'guide.mdx' },
          lastModified: '2026-09-01T00:00:00Z'
        }
      },
      {
        locale: language,
        url: `/${language}/fallback`,
        data: { _file: { path: `fallback.${language}.mdx` }, lastModified: '2026-10-01T00:00:00Z' }
      },
      {
        locale: language,
        url: `/${language}/undated`,
        data: { _file: { path: `undated.${language}.mdx` } }
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
            }
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
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${homeOrigin.replace('https://', 'https://doc.')}/${locale}/guide</loc>
    <lastmod>${timestamp}</lastmod>
  </url>
  <url>
    <loc>${homeOrigin.replace('https://', 'https://doc.')}/${locale}/fallback</loc>
    <lastmod>2026-10-01T00:00:00Z</lastmod>
  </url>
  <url>
    <loc>${homeOrigin.replace('https://', 'https://doc.')}/${locale}/undated</loc>
  </url>
</urlset>`);
  });
}
