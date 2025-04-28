import archiver from 'archiver';
import { $ } from 'bun';
import fs from 'fs';
import path from 'path';

const outDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}
const toolsDir = path.join(__dirname, '..', 'tools');
const tools = fs.readdirSync(toolsDir);
if (tools.length === 0) {
  console.log('No tools found');
  process.exit(0);
}

const runtimeDir = path.join(__dirname, '..', 'runtime');

await Promise.all(
  tools.map(async (tool) => {
    console.log(`building: ${tool}`);
    await $`bun --cwd=tools/${tool} run build`;
  })
);

await $`bun --cwd=runtime run build`;

console.log('Build complete');

async function pack(tool: string) {
  const dist = path.join(toolsDir, tool, 'dist');
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });
  const outFile = path.join(outDir, `${tool}.pkg`);
  fs.writeFileSync(outFile, '');
  const output = fs.createWriteStream(outFile);
  archive.pipe(output);

  archive.directory(dist, false);
  archive.finalize();
}

async function move(tool: string) {
  const src = path.join(toolsDir, tool, 'dist');
  const dst = path.join(runtimeDir, 'dist', 'tools');
  if (!fs.existsSync(dst)) {
    fs.mkdirSync(dst);
  }
  fs.cpSync(src, path.join(dst, tool), { recursive: true });
}

await Promise.all(
  tools.map(async (tool) => {
    console.log(`Packing and moving: ${tool}`);
    await Promise.all([pack(tool), move(tool)]);
  })
);

console.log('Done');
