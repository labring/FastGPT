import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkEnglishDocs } from './checkEnglishDocs.mjs';

function fixture(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-english-docs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

const chinese = '---\ntitle: 指南\n---\n\n## 配置\n';
const english = '---\ntitle: Guide\n---\n\n## Setup\n';

test('requires English pages and navigation even when Chinese fallback exists', (t) => {
  const dir = fixture(t, { 'guide.mdx': chinese, 'meta.json': '{"pages":["guide"]}' });
  const { errors } = checkEnglishDocs(dir);
  assert.ok(errors.some((error) => error.includes('guide.en.mdx')));
  assert.ok(errors.some((error) => error.includes('meta.en.json')));
});

test('checks actual heading slugs, explicit IDs, and English index routes', (t) => {
  const dir = fixture(t, {
    'guide/index.mdx': chinese,
    'guide/index.en.mdx': `${english}\n## Stable Heading [#stable]\n\n[Setup](/en/guide#setup) [Stable](/en/guide#stable)\n`,
    'meta.json': '{"pages":["guide"]}',
    'meta.en.json': '{"pages":["guide"]}'
  });
  assert.deepEqual(checkEnglishDocs(dir).errors, []);
  fs.appendFileSync(
    path.join(dir, 'guide/index.en.mdx'),
    '\n[Old](/en/guide#配置) [Chinese](/zh-CN/guide) [Index](/en/guide/index)\n'
  );
  const { errors } = checkEnglishDocs(dir);
  assert.ok(errors.some((error) => error.includes('Missing English heading')));
  assert.ok(errors.some((error) => error.includes('Missing English route')));
  assert.ok(errors.some((error) => error.includes('/en/guide/index')));
});

test('rejects relative file links the article renderer leaves unresolved', (t) => {
  const dir = fixture(t, {
    'guide.mdx': chinese,
    'guide.en.mdx': `${english}\n[Target](./target.mdx#setup)\n`,
    'target.mdx': chinese,
    'target.en.mdx': english
  });
  assert.deepEqual(checkEnglishDocs(dir).errors, []);
  fs.appendFileSync(
    path.join(dir, 'guide.en.mdx'),
    '\n[Physical filename](./target.en.mdx#setup) [Extensionless](./target#setup) [Missing](./missing.mdx)\n'
  );
  const { errors } = checkEnglishDocs(dir);
  for (const href of ['./target.en.mdx#setup', './target#setup', './missing.mdx']) {
    assert.ok(errors.some((error) => error.includes(`Unresolved relative link ${href}`)));
  }
});

test('checks translated prose and dates while preserving executable sample strings', (t) => {
  const dir = fixture(t, {
    'guide.mdx': chinese,
    'guide.en.mdx': `${english}\n\`\`\`json\n{"sample":"中文"}\n\`\`\`\n\n[Example endpoint](http://address:port)\n`
  });
  assert.deepEqual(checkEnglishDocs(dir).errors, []);
  fs.appendFileSync(path.join(dir, 'guide.en.mdx'), '\n遗漏的中文说明\n');
  assert.ok(
    checkEnglishDocs(dir).errors.some((error) => error.includes('Chinese reader-facing text'))
  );
  fs.writeFileSync(
    path.join(dir, 'guide.en.mdx'),
    english.replace('title: Guide', 'title: Guide\nreleaseTime: 2026-03-06')
  );
  assert.ok(checkEnglishDocs(dir).errors.some((error) => error.includes('Release date differs')));
});
