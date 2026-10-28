import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { remark } from 'remark';
import remarkMdx from 'remark-mdx';

const require = createRequire(import.meta.url);
// Reuse the Sharp version already installed with Next.js.
const sharp = createRequire(require.resolve('next'))('sharp');
const documentRoot = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(documentRoot, 'public');
const parser = remark().use(remarkMdx);
// shortcut: exclusions cover current assets, review new icons and QR codes before rerunning.
const excluded = new Set(['/imgs/sso15.png', '/imgs/sso16.png', '/imgs/sso17.png']);

/** Collect rendered local images and precise URL offsets, leaving code examples and badges intact. */
export function collectImages(content, file) {
  const images = [];

  function visit(node) {
    const attribute =
      node.name === 'img' ? node.attributes?.find((item) => item.name === 'src') : null;
    const url = node.type === 'image' ? node.url : attribute?.value;
    if (typeof url === 'string' && !/^(https?:|data:)/i.test(url)) {
      const absolute = url.startsWith('/')
        ? path.join(publicRoot, url)
        : path.resolve(path.dirname(file), url);
      const relative = path.relative(publicRoot, absolute);
      const source = '/' + relative;
      if (
        source.startsWith('/imgs/') &&
        /\.(png|jpe?g|webp)$/i.test(source) &&
        !excluded.has(source)
      ) {
        const position = (attribute ?? node).position;
        const raw = content.slice(position.start.offset, position.end.offset);
        const searchFrom = attribute ? raw.indexOf('=') + 1 : raw.indexOf('](') + 2;
        const offset = raw.indexOf(url, searchFrom);
        assert.ok(offset >= 0, `Cannot locate image URL in ${file}: ${url}`);
        const original = source.startsWith('/imgs/optimized/')
          ? source.replace('/imgs/optimized/', '/imgs/').replace(/\.webp$/, '')
          : source;
        const optimized = original.replace('/imgs/', '/imgs/optimized/') + '.webp';
        images.push({
          original,
          optimized,
          start: position.start.offset + offset,
          end: position.start.offset + offset + url.length
        });
      }
    }
    node.children?.forEach(visit);
  }

  visit(parser.parse(content));
  return images;
}

/** Compress from the original pixels, preserving source files and transparency. */
export async function compressImage({ input, output }) {
  const original = await sharp(input).rotate().png().toBuffer();
  const { width } = await sharp(original).metadata();
  await mkdir(path.dirname(output), { recursive: true });

  // Retry from the same master; resize only after quality 60 still exceeds the cap.
  let targetWidth = width;
  while (true) {
    for (const quality of [80, 75, 70, 65, 60]) {
      const compressed = await sharp(original)
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer();
      if (compressed.length <= 200000) {
        await writeFile(output, compressed);
        return;
      }
    }
    assert.ok(targetWidth > 1, 'Unable to meet the image size limit');
    targetWidth = Math.max(1, Math.floor(targetWidth * 0.85));
  }
}

/** Generate every unique asset before updating references, so failures leave docs pointing to originals. */
async function main() {
  const contentRoot = path.join(documentRoot, 'content');
  const files = (await readdir(contentRoot, { recursive: true }))
    .filter((file) => /\.mdx?$/.test(file))
    .sort();
  const docs = [];
  const assets = new Map();
  for (const name of files) {
    const file = path.join(contentRoot, name);
    const content = await readFile(file, 'utf8');
    const images = collectImages(content, file);
    images.forEach(({ original, optimized }) => assets.set(original, optimized));
    docs.push({ file, content, images });
  }

  let generated = 0;
  for (const [original, optimized] of assets) {
    await compressImage({
      input: path.join(publicRoot, original),
      output: path.join(publicRoot, optimized)
    });
    generated++;
    if (generated % 25 === 0) console.log(`Generated ${generated}/${assets.size} images`);
  }

  let updated = 0;
  let references = 0;
  for (const { file, content, images } of docs) {
    let next = content;
    for (const image of images.toReversed()) {
      next = next.slice(0, image.start) + image.optimized + next.slice(image.end);
    }
    if (next !== content) {
      assert.equal(
        await readFile(file, 'utf8'),
        content,
        `Document changed during generation: ${file}`
      );
      await writeFile(file, next);
      updated++;
    }
    references += images.length;
  }
  console.log(
    `Generated ${assets.size} images; updated ${updated} documents (${references} references).`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
