import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(repositoryRoot, 'packages/service/package.json'));
const sharp = require('sharp');
const inputDirectory = process.argv[2];
const sourceManifest = process.argv[3];
if (!inputDirectory || !sourceManifest)
  throw new Error(
    'Usage: node scripts/captcha/pack-backgrounds.mjs <webp-directory> <sources-json>'
  );
const sources = JSON.parse(await readFile(sourceManifest, 'utf8'));
if (sources.images?.length !== 100) throw new Error('Expected source records for all 100 images');
if (sources.license !== 'MIT' || !sources.licenseText?.includes('Microsoft Corporation')) {
  throw new Error('Expected Microsoft Fluent Emoji MIT license notice');
}
const sourcesByFile = new Map(sources.images.map((image) => [image.filename, image]));
if (sourcesByFile.size !== 100) throw new Error('Duplicate source filenames');

const files = (await readdir(inputDirectory)).filter((name) => name.endsWith('.webp')).sort();
if (files.length !== 100)
  throw new Error(`Expected exactly 100 captcha backgrounds, received ${files.length}`);
const hashes = new Set();
const images = [];
const sizes = [];
for (const filename of files) {
  const buffer = await readFile(path.join(inputDirectory, filename));
  const metadata = await sharp(buffer).metadata();
  if (metadata.width !== 224 || metadata.height !== 224 || metadata.format !== 'webp') {
    throw new Error(`${filename}: expected 224x224 WebP`);
  }
  if (buffer.byteLength >= 40_000)
    throw new Error(`${filename}: must be smaller than 40,000 bytes`);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const source = sourcesByFile.get(filename);
  if (!source || source.sha256 !== hash || source.license !== 'MIT') {
    throw new Error(`${filename}: missing or inconsistent MIT source record`);
  }
  if (hashes.has(hash)) throw new Error(`${filename}: duplicate image`);
  hashes.add(hash);
  images.push(`  // ${filename}\n  'data:image/webp;base64,${buffer.toString('base64')}'`);
  sizes.push(buffer.byteLength);
}

// 内联到服务端模块，保持开发环境与 app/Pro standalone 产物一致，不依赖额外文件路径或公网。
const output = path.join(
  repositoryRoot,
  'packages/service/support/user/account/captcha/constants.ts'
);
await writeFile(
  output,
  `/*! @license\n${sources.licenseText
    .split('\n')
    .map((line) => ` * ${line.trimEnd()}`.trimEnd())
    .join(
      '\n'
    )}\n */\n/**\n * 100 张圆形旋转验证插画底图，均为 224×224 WebP，单张小于 40,000 字节。\n * 图形来自 Microsoft Fluent Emoji；来源、MIT 许可及加工记录见同目录 sources.json。\n * 由 scripts/captcha/pack-backgrounds.mjs 生成，请勿手动修改图片数据。\n * 仅在服务端使用；内联保证 app 与 Pro standalone 部署无需额外静态文件或网络。\n */\nexport const PUZZLE_CAPTCHA_BACKGROUNDS: readonly string[] = [\n${images.join(',\n')}\n];\n`
);
await writeFile(
  path.join(path.dirname(output), 'sources.json'),
  JSON.stringify(sources, null, 2) + '\n'
);
await writeFile(
  path.join(path.dirname(output), 'LICENSE-MICROSOFT-FLUENT-EMOJI.txt'),
  sources.licenseText + '\n'
);
console.log(
  JSON.stringify(
    {
      count: files.length,
      width: 224,
      height: 224,
      maxBytes: Math.max(...sizes),
      minBytes: Math.min(...sizes),
      totalBytes: sizes.reduce((sum, value) => sum + value, 0)
    },
    null,
    2
  )
);
