import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { remark } from 'remark';
import remarkMdx from 'remark-mdx';
import { remarkImage } from 'fumadocs-core/mdx-plugins';
import { remarkDiagrams } from '../lib/remark-diagrams.mjs';
import { layoutDiagram, renderDiagram } from './renderDiagrams.mjs';

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

test('localized diagrams share topology and remain within readability budgets', async () => {
  const directory = new URL('../diagrams/', import.meta.url);
  for (const file of (await readdir(directory)).filter((file) => file.endsWith('.en.json'))) {
    const english = JSON.parse(await readFile(new URL(file, directory)));
    const chinese = JSON.parse(await readFile(new URL(file.replace('.en.', '.zh-CN.'), directory)));
    const topology = (spec) => ({
      type: spec.type,
      nodes: (spec.nodes ?? spec.participants ?? []).map(({ id, row, col, illustration }) => ({
        id,
        row,
        col,
        illustration
      })),
      edges: (spec.edges ?? spec.messages ?? []).map(([from, to]) => [from, to])
    });
    assert.deepEqual(topology(english), topology(chinese), file);
    const icons = (english.nodes ?? english.participants).map(({ illustration }) => illustration);
    assert.equal(new Set(icons).size, icons.length, `${file}: distinct roles need distinct icons`);
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

test('published SVGs reproduce their sources, embed illustrations, and preserve every labeled edge', async () => {
  const sources = new URL('../diagrams/', import.meta.url);
  const illustrations = {};
  for (const file of (await readdir(new URL('illustrations/', sources))).filter((file) =>
    file.endsWith('.webp')
  )) {
    illustrations[file.slice(0, -5)] = (
      await readFile(new URL(`illustrations/${file}`, sources))
    ).toString('base64');
  }
  const decode = (value) =>
    value.replace(
      /&(amp|lt|gt|quot|apos);/g,
      (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity]
    );
  for (const file of (await readdir(sources)).filter((file) => /\.(en|zh-CN)\.json$/.test(file))) {
    const spec = JSON.parse(await readFile(new URL(file, sources)));
    for (const theme of ['light', 'dark']) {
      const svg = await readFile(
        new URL(`../public/imgs/diagrams/${file.slice(0, -5)}.${theme}.svg`, import.meta.url),
        'utf8'
      );
      assert.equal(
        svg,
        renderDiagram(spec, { theme, illustrations }),
        `${file}: stale ${theme} output`
      );
      const nodes = [
        ...svg.matchAll(/class="node" data-node="([^"]+)" data-label="([^"]*)" data-sub="([^"]*)"/g)
      ].map(([, id, label, sub]) => ({ id, label: decode(label), sub: decode(sub) }));
      assert.deepEqual(
        nodes,
        (spec.nodes ?? spec.participants).map(({ id, label, sub = '' }) => ({ id, label, sub })),
        file
      );
      const edges = [
        ...svg.matchAll(
          /class="edge" data-from="([^"]+)" data-to="([^"]+)" data-kind="([^"]*)" data-label="([^"]*)"/g
        )
      ].map(([, from, to, kind, label]) => [from, to, decode(label), decode(kind)]);
      assert.deepEqual(edges, spec.edges ?? spec.messages, file);
      assert.equal((svg.match(/marker-end="url\(#arrow\)"/g) ?? []).length, edges.length, file);
      assert.ok(svg.includes('data:image/webp;base64,'), file);
      assert.doesNotMatch(svg, /\d+ components · \d+ connections|\d+ 个节点 · \d+ 条连线/, file);
      assert.ok(!/<script|https?:\/\/[^"\s]+\.(webp|png)/.test(svg), file);
      assert.ok(svg.includes(theme === 'dark' ? '#F0F5FF' : '#162B50'), file);
    }
  }
});

test('connectors avoid unrelated nodes and remain inside the canvas', async () => {
  const sources = new URL('../diagrams/', import.meta.url);
  for (const file of (await readdir(sources)).filter((file) => file.endsWith('.en.json'))) {
    const spec = JSON.parse(await readFile(new URL(file, sources)));
    const { nodes, edges, width, height } = layoutDiagram(spec);
    for (const edge of edges) {
      for (let i = 1; i < edge.points.length; i++) {
        const [a, b] = [edge.points[i - 1], edge.points[i]];
        assert.ok(
          [a, b].every(([x, y]) => x >= 0 && x <= width && y >= 0 && y <= height),
          file
        );
        assert.ok(a[0] === b[0] || a[1] === b[1], `${file}: non-orthogonal edge`);
        for (const node of nodes.filter(({ id }) => ![edge.from, edge.to].includes(id))) {
          const intersects =
            a[0] === b[0]
              ? a[0] > node.x &&
                a[0] < node.x + node.w &&
                Math.max(a[1], b[1]) > node.y &&
                Math.min(a[1], b[1]) < node.y + node.h
              : a[1] > node.y &&
                a[1] < node.y + node.h &&
                Math.max(a[0], b[0]) > node.x &&
                Math.min(a[0], b[0]) < node.x + node.w;
          assert.equal(intersects, false, `${file}: ${edge.from} → ${edge.to} crosses ${node.id}`);
        }
      }
    }
  }
});

test('renderer rejects broken topology and missing illustrations and escapes label markup', () => {
  const spec = {
    type: 'flowchart',
    title: 'Example <flow>',
    lang: 'en',
    nodes: [
      { id: 'a', label: '<script>alert(1)</script>', row: 0, col: 0, illustration: 'browser' },
      { id: 'b', label: 'Result', row: 1, col: 0, illustration: 'browser' }
    ],
    edges: [['a', 'b', 'a & b', 'primary']]
  };
  const options = { theme: 'light', illustrations: { browser: 'AA==' } };
  assert.throws(
    () => layoutDiagram({ ...spec, edges: [['a', 'missing', '', 'primary']] }),
    /Unknown endpoint/
  );
  assert.throws(
    () => renderDiagram(spec, { ...options, illustrations: {} }),
    /Missing illustration asset/
  );
  const svg = renderDiagram(spec, options);
  assert.ok(svg.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(svg.includes('a &amp; b'));
  assert.ok(!svg.includes('<script>'));
});
