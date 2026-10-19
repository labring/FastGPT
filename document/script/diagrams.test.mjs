import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { remark } from 'remark';
import remarkMdx from 'remark-mdx';
import { remarkImage } from 'fumadocs-core/mdx-plugins';
import { remarkDiagrams } from '../lib/remark-diagrams.mjs';

const require = createRequire(import.meta.url);
const { extractReferencedImages } = require('./removeInvalidImg.js');

test('local static imports and CDN diagrams retain their dark variant', async () => {
  for (const prefix of ['/imgs/', 'https://cdn.jsdelivr.net/gh/labring/fastgpt-img@main/']) {
    const processor = remark()
      .use(remarkMdx)
      .use(remarkImage, { external: false })
      .use(remarkDiagrams);
    const tree = await processor.run(
      processor.parse(
        [
          `![Architecture](${prefix}diagrams/deployment-core.en.light.svg)`,
          `![Logo](${prefix}logo.svg)`,
          '![External](https://example.com/diagrams/test.light.svg)'
        ].join('\n\n')
      )
    );
    const variants = [];
    function visit(node) {
      const dark =
        node.data?.hProperties?.['data-dark-src'] ??
        node.attributes?.find((attribute) => attribute.name === 'data-dark-src')?.value;
      if (dark) variants.push(dark);
      node.children?.forEach(visit);
    }
    visit(tree);
    assert.deepEqual(variants, [`${prefix}diagrams/deployment-core.en.dark.svg`]);
  }
});

test('cleanup preserves theme companions and historical raster sources', async () => {
  const retained = extractReferencedImages([
    { content: '![Flow](/imgs/diagrams/rag-pipeline.en.light.svg)' }
  ]);
  assert.ok(retained.has('diagrams/rag-pipeline.en.dark.svg'));
  const originals = JSON.parse(
    await readFile(new URL('../diagrams/originals.json', import.meta.url))
  );
  for (const original of originals) {
    assert.ok(retained.has(original));
    assert.ok(retained.has(`optimized/${original}.webp`));
    await stat(new URL(`../public/imgs/${original}`, import.meta.url));
  }
});

test('every published diagram has localized sources, HTML, and theme assets under 200 KB', async () => {
  const directory = new URL('../content/', import.meta.url);
  const references = new Set();
  for (const file of await readdir(directory, { recursive: true })) {
    if (!file.endsWith('.mdx')) continue;
    const content = await readFile(new URL(file, directory), 'utf8');
    for (const match of content.matchAll(/\/imgs\/diagrams\/([\w-]+)\.(zh-CN|en)\.light\.svg/g)) {
      assert.equal(match[2], file.endsWith('.en.mdx') ? 'en' : 'zh-CN', file);
      references.add(`${match[1]}.${match[2]}`);
    }
  }
  const sources = (await readdir(new URL('../diagrams/', import.meta.url)))
    .filter((file) => /\.(en|zh-CN)\.json$/.test(file))
    .map((file) => file.slice(0, -5));
  assert.deepEqual([...references].sort(), sources.sort());
  for (const source of sources) {
    await stat(new URL(`../diagrams/${source}.html`, import.meta.url));
    for (const theme of ['light', 'dark']) {
      const asset = await stat(
        new URL(`../public/imgs/diagrams/${source}.${theme}.svg`, import.meta.url)
      );
      assert.ok(asset.size > 0 && asset.size <= 200000, `${source}.${theme}: ${asset.size} bytes`);
    }
  }
});

test('localized diagrams share topology and remain within SeeCode readability budgets', async () => {
  const directory = new URL('../diagrams/', import.meta.url);
  for (const file of (await readdir(directory)).filter((file) => file.endsWith('.en.json'))) {
    const english = JSON.parse(await readFile(new URL(file, directory)));
    const chinese = JSON.parse(await readFile(new URL(file.replace('.en.', '.zh-CN.'), directory)));
    const topology = (spec) => ({
      type: spec.type,
      nodes: (spec.nodes ?? spec.participants ?? []).map(({ id, row, col }) => ({ id, row, col })),
      edges: (spec.edges ?? spec.messages ?? []).map(([from, to]) => [from, to])
    });
    assert.deepEqual(topology(english), topology(chinese), file);
    for (const spec of [english, chinese]) {
      assert.ok((spec.nodes?.length ?? 0) <= 9, file);
      assert.ok((spec.edges?.length ?? 0) <= 12, file);
      assert.ok((spec.participants?.length ?? 0) <= 6, file);
      assert.ok((spec.messages?.length ?? 0) <= 16, file);
      assert.equal(spec.watermark, false, file);
      assert.ok(spec.evidence.length > 0, file);
    }
  }
});
