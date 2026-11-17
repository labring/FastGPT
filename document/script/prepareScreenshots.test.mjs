import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { collectImages, compressImage } from './prepareScreenshots.mjs';
import { remarkScreenshots } from '../lib/remark-screenshots.mjs';
import { remark } from 'remark';
import remarkMdx from 'remark-mdx';
import { remarkImage } from 'fumadocs-core/mdx-plugins';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');
const { extractReferencedImages } = require('./removeInvalidImg.js');

test('image references preserve examples, badges, icons, and already optimized paths', () => {
  const file = fileURLToPath(new URL('../content/guide/example.mdx', import.meta.url));
  const content = [
    '![alt](/imgs/current/screen.png)',
    '![relative](../../public/imgs/diagram.jpg)',
    '<img src="/imgs/panel.png" width="200" alt="panel" />',
    '![done](/imgs/optimized/current/done.png.webp)',
    '![badge](/imgs/Deploy-on-Sealos.svg)',
    '![icon](/imgs/sso15.png)',
    '![QR](https://example.com/qr.png)',
    '`![inline](/imgs/example.png)`',
    '```md\n![code](/imgs/example.png)\n```'
  ].join('\n\n');
  const images = collectImages(content, file);
  assert.deepEqual(
    images.map((image) => image.original),
    ['/imgs/current/screen.png', '/imgs/diagram.jpg', '/imgs/panel.png', '/imgs/current/done.png']
  );
  let updated = content;
  for (const image of images.toReversed())
    updated = updated.slice(0, image.start) + image.optimized + updated.slice(image.end);
  assert.ok(
    updated.includes('<img src="/imgs/optimized/panel.png.webp" width="200" alt="panel" />')
  );
  assert.ok(updated.includes('```md\n![code](/imgs/example.png)\n```'));
  assert.deepEqual(
    collectImages(updated, file).map((image) => image.optimized),
    images.map((image) => image.optimized)
  );
  const retained = extractReferencedImages([{ content: updated }]);
  for (const image of images) assert.ok(retained.has(image.original.slice('/imgs/'.length)));
});

test('compression preserves source pixels, dimensions, and transparency without adding a background', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'prepare-screenshots-'));
  try {
    for (const [width, height, alpha] of [
      [200, 100, 1],
      [100, 200, 1],
      [100, 100, 0]
    ]) {
      const input = await sharp({
        create: { width, height, channels: 4, background: { r: 255, g: 0, b: 0, alpha } }
      })
        .png()
        .toBuffer();
      const original = Buffer.from(input);
      const output = path.join(dir, `${width}-${height}-${alpha}.webp`);
      await compressImage({ input, output });
      assert.deepEqual(input, original);
      const metadata = await sharp(output).metadata();
      assert.equal(metadata.width, width);
      assert.equal(metadata.height, height);
      const pixel = await sharp(await readFile(output))
        .extract({ left: 20, top: 20, width: 1, height: 1 })
        .raw()
        .toBuffer();
      if (alpha) {
        assert.ok(Math.abs(pixel[0] - 255) <= 3 && pixel[1] <= 3 && pixel[2] <= 3);
      } else {
        assert.equal(pixel[3], 0);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('regenerated images stay within 200,000 bytes even for detailed content', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'prepare-screenshots-size-'));
  try {
    const pixels = Buffer.alloc(900 * 600 * 3);
    let seed = 42;
    for (let i = 0; i < pixels.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[i] = seed >>> 24;
    }
    const input = await sharp(pixels, { raw: { width: 900, height: 600, channels: 3 } })
      .png()
      .toBuffer();
    const output = path.join(dir, 'detailed.webp');
    await compressImage({ input, output });
    const image = await readFile(output);
    assert.ok(image.length <= 200000, `Image is ${image.length} bytes`);
    const metadata = await sharp(image).metadata();
    assert.ok(metadata.width <= 900 && metadata.height <= 600);
    assert.ok(Math.abs(metadata.width / metadata.height - 900 / 600) < 0.01);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('MDX static imports retain original zoom URLs when present and fall back to optimized assets when absent', async () => {
  const publicDir = await mkdtemp(path.join(tmpdir(), 'screenshot-local-'));
  try {
    for (const rel of [
      'imgs/current/example.png',
      'imgs/optimized/current/example.png.webp',
      'imgs/current/explicit.png',
      'imgs/optimized/current/explicit.png.webp',
      'imgs/optimized/legacy-only.png.webp',
      'imgs/sso15.png'
    ]) {
      const full = path.join(publicDir, rel);
      await mkdir(path.dirname(full), { recursive: true });
      const img = sharp({ create: { width: 200, height: 100, channels: 3, background: '#fff' } });
      if (rel.endsWith('.webp')) await img.webp().toFile(full);
      else await img.png().toFile(full);
    }
    const content = [
      '![screen](/imgs/optimized/current/example.png.webp)',
      '<img src="/imgs/optimized/current/explicit.png.webp" width="200" height="100" />',
      '![legacy](/imgs/optimized/legacy-only.png.webp)',
      '![icon](/imgs/sso15.png)',
      '![badge](https://example.com/badge.svg)'
    ].join('\n\n');
    const processor = remark()
      .use(remarkMdx)
      .use(remarkImage, { external: false, publicDir })
      .use(remarkScreenshots, { publicDir });
    const tree = await processor.run(processor.parse(content));
    const originals = [];
    function visit(node) {
      const original = node.attributes?.find((attribute) => attribute.name === 'data-original-src');
      if (original) originals.push(original.value);
      node.children?.forEach(visit);
    }
    visit(tree);
    assert.deepEqual(originals, [
      '/imgs/current/example.png',
      '/imgs/current/explicit.png',
      '/imgs/optimized/legacy-only.png.webp'
    ]);
  } finally {
    await rm(publicDir, { recursive: true, force: true });
  }
});

test('CDN rewrites retain screenshot framing, dimensions, and original zoom URLs', async () => {
  const publicDir = await mkdtemp(path.join(tmpdir(), 'screenshot-cdn-'));
  try {
    const asset = path.join(publicDir, 'imgs/optimized/current/example.png.webp');
    const origAsset = path.join(publicDir, 'imgs/current/example.png');
    const legacyAsset = path.join(publicDir, 'imgs/optimized/legacy.png.webp');
    await mkdir(path.dirname(asset), { recursive: true });
    await mkdir(path.dirname(origAsset), { recursive: true });
    await sharp({ create: { width: 200, height: 100, channels: 3, background: '#fff' } })
      .webp()
      .toFile(asset);
    await sharp({ create: { width: 200, height: 100, channels: 3, background: '#fff' } })
      .png()
      .toFile(origAsset);
    await sharp({ create: { width: 160, height: 90, channels: 3, background: '#fff' } })
      .webp()
      .toFile(legacyAsset);
    const content = [
      '![screen](https://cdn.jsdelivr.net/gh/labring/fastgpt-img@main/optimized/current/example.png.webp)',
      '![legacy](https://cdn.jsdelivr.net/gh/labring/fastgpt-img@main/optimized/legacy.png.webp)'
    ].join('\n\n');
    const processor = remark()
      .use(remarkMdx)
      .use(remarkImage, { external: false })
      .use(remarkScreenshots, { publicDir });
    const tree = await processor.run(processor.parse(content));
    assert.deepEqual(tree.children[0].children[0].data.hProperties, {
      'data-original-src':
        'https://cdn.jsdelivr.net/gh/labring/fastgpt-img@main/current/example.png',
      width: 200,
      height: 100
    });
    assert.deepEqual(tree.children[1].children[0].data.hProperties, {
      'data-original-src':
        'https://cdn.jsdelivr.net/gh/labring/fastgpt-img@main/optimized/legacy.png.webp',
      width: 160,
      height: 90
    });
  } finally {
    await rm(publicDir, { recursive: true, force: true });
  }
});

test('all derived screenshot zoom targets across content/ resolve to existing public files', async () => {
  const docRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const contentDir = path.join(docRoot, 'content');
  const publicDir = path.join(docRoot, 'public');

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...(await walk(full)));
      else if (entry.name.endsWith('.mdx')) files.push(full);
    }
    return files;
  }

  const optimizedRefs = new Set();
  for (const file of await walk(contentDir)) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(/\/imgs\/optimized\/[^)"'\s]+\.webp/g)) {
      optimizedRefs.add(match[0]);
    }
  }
  assert.ok(optimizedRefs.size > 0);

  const snippet = [...optimizedRefs].map((url) => `![img](${url})`).join('\n\n');
  const processor = remark()
    .use(remarkMdx)
    .use(remarkImage, { external: false, publicDir })
    .use(remarkScreenshots, { publicDir });
  const tree = await processor.run(processor.parse(snippet));

  const targets = [];
  function visit(node) {
    const attr = node.attributes?.find((item) => item.name === 'data-original-src');
    if (attr) targets.push(attr.value);
    node.children?.forEach(visit);
  }
  visit(tree);

  assert.equal(targets.length, optimizedRefs.size);
  for (const target of targets) {
    assert.ok(existsSync(path.join(publicDir, target)), `Missing derived zoom target: ${target}`);
  }
});

test('screenshot resources bypass locale redirects while documentation pages keep routing', async () => {
  const { unstable_doesMiddlewareMatch } = require('next/experimental/testing/server');
  const source = await readFile(new URL('../middleware.ts', import.meta.url), 'utf8');
  const matcher = JSON.parse(`"${source.match(/matcher:\s*\[\s*'([^']+)'/)[1]}"`);
  const config = { matcher: [matcher] };
  for (const url of [
    '/screenshot-background.webp',
    '/imgs/optimized/current/example.png.webp',
    '/imgs/current/example.jpg',
    '/imgs/current/example.jpeg',
    '/imgs/current/example.png',
    '/logo.svg'
  ]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url }), false, url);
  }
  assert.equal(
    unstable_doesMiddlewareMatch({ config, url: '/guide/build/agentv2/settings' }),
    true
  );
});
