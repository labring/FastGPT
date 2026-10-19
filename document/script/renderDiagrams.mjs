import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = process.argv[2];
assert.ok(cli, 'Usage: node script/renderDiagrams.mjs /path/to/seecode.mjs');
const documentRoot = fileURLToPath(new URL('../', import.meta.url));
const sources = path.join(documentRoot, 'diagrams');
const destination = path.join(documentRoot, 'public/imgs/diagrams');
await mkdir(destination, { recursive: true });

// Use SeeCode for all rendering so JSON remains the only editable diagram source.
for (const file of (await readdir(sources))
  .filter((file) => /\.(zh-CN|en)\.json$/.test(file))
  .sort()) {
  const run = (...args) => {
    const result = JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' }));
    assert.ok(result.ok, JSON.stringify(result));
    assert.ok(!result.warnings?.length, JSON.stringify(result));
    assert.ok(!result.problems?.some(({ code }) => /^[EW]_/.test(code)), JSON.stringify(result));
    return result;
  };
  const rendered = run('render', path.join(sources, file));
  for (const theme of ['light', 'dark']) {
    const exported = run(
      'export',
      rendered.out,
      '--formats',
      'svg',
      '--theme',
      theme,
      '--crop',
      'diagram'
    );
    const asset = exported.files[0].path;
    assert.ok((await stat(asset)).size <= 200000, `${file}: ${theme} exceeds 200,000 bytes`);
    await rename(asset, path.join(destination, file.replace(/\.json$/, `.${theme}.svg`)));
  }
  console.log(`Rendered ${file}`);
}
