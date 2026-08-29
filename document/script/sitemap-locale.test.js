const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { getFastGPTDocsLocaleFromHomeOrigin } = require('../lib/docs-locale');

test('docs locale follows the configured build host', () => {
  assert.equal(getFastGPTDocsLocaleFromHomeOrigin('https://fastgpt.cn'), 'zh-CN');
  assert.equal(getFastGPTDocsLocaleFromHomeOrigin('https://fastgpt.io'), 'en');
  assert.equal(getFastGPTDocsLocaleFromHomeOrigin('https://preview.example.com'), 'en');
});

test('sitemap route selects the build locale and local modification keys', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/sitemap.xml/route.ts'), 'utf8');
  assert.match(source, /source\.getPages\(locale\)/);
  assert.match(source, /const filePath = `content\/\$\{page\.file\.path\}`/);
  assert.doesNotMatch(source, /source\.getPages\(\)/);
  assert.doesNotMatch(source, /document\/content\/\$\{page\.file\.path\}/);
});
