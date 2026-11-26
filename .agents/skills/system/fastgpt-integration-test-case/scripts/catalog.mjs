#!/usr/bin/env node
import { readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import format from './case-format.cjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '../../../../..');
const defaultRoot = path.join(repoRoot, '.agents/test');
const readerPath = path.join(defaultRoot, 'index.html');
const filterNames = [
  'business',
  'category',
  'type',
  'scenario',
  'tag',
  'evidence',
  'status',
  'priority',
  'q'
];

/** 每次查询重新扫描 Markdown；忽略符号链接，避免越出用例库和递归环。 */
export async function scanCatalog(root) {
  const tree = JSON.parse(await readFile(path.join(root, 'businesses.json'), 'utf8'));
  const entries = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const relativePath = path.relative(root, filename).split(path.sep).join('/');
        try {
          entries.push({ path: relativePath, content: await readFile(filename, 'utf8') });
        } catch (error) {
          entries.push({ path: relativePath, error: `文件读取失败：${error.message}` });
        }
      }
    }
  }
  await walk(root);
  return format.buildCatalog(entries, tree);
}

/** CLI 只接受已声明参数；错误参数直接报错，避免无意扩大查询范围。 */
function parseArguments(argv) {
  const [command = 'help', ...args] = argv;
  const options = {};
  const allowed = command === 'serve' ? ['root', 'port'] : ['root', ...filterNames];
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index].replace(/^--/, '');
    const value = args[index + 1];
    if (!args[index].startsWith('--') || !allowed.includes(key) || !value || value.startsWith('--'))
      throw new Error(`无效参数：${args[index]}`);
    options[key] = value;
  }
  return { command, options };
}

/** 仅提供本机只读 API 和一个 HTML；不映射任意文件路径，也不接受写请求。 */
export function serveCatalog({ root, port }) {
  const server = createServer(async (request, response) => {
    const send = (status, value, type = 'application/json; charset=utf-8') => {
      response.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
      });
      response.end(typeof value === 'string' ? value : JSON.stringify(value));
    };
    const host = request.headers.host;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)
      return send(403, { error: '仅允许本机 Host' });
    if (
      request.headers.origin &&
      ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(request.headers.origin)
    )
      return send(403, { error: '不允许跨站请求' });
    if (request.method !== 'GET') return send(405, { error: '只支持 GET' });
    try {
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      if (url.pathname === '/' || url.pathname === '/index.html')
        return send(200, await readFile(readerPath, 'utf8'), 'text/html; charset=utf-8');
      if (url.pathname !== '/api/cases') return send(404, { error: '资源不存在' });
      for (const key of url.searchParams.keys())
        if (!filterNames.includes(key)) return send(400, { error: `不支持的查询参数：${key}` });
      const catalog = await scanCatalog(root);
      const cases = format.filterCases(catalog.cases, Object.fromEntries(url.searchParams));
      return send(200, { ...catalog, cases, total: catalog.cases.length, matched: cases.length });
    } catch (error) {
      send(500, { error: error.message });
    }
  });
  server.on('error', (error) => {
    console.error(`阅读器启动失败：${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`用例阅读器：http://127.0.0.1:${port}/\n只读查询：/api/cases\n扫描目录：${root}`)
  );
  return server;
}

/** 将共用解析器嵌入唯一 HTML，保持本机服务与离线目录的解析规则一致。 */
async function syncReader() {
  const html = await readFile(readerPath, 'utf8');
  const core = await readFile(path.join(scriptDirectory, 'case-format.cjs'), 'utf8');
  const pattern = /(<script data-bundle="case-format">)[\s\S]*?(<\/script>)/;
  if (!pattern.test(html)) throw new Error('阅读器缺少 case-format 嵌入位置');
  await writeFile(
    readerPath,
    html.replace(pattern, (_, start, end) => `${start}\n${core}\n${end}`)
  );
  console.log('阅读器共用解析器已同步');
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'sync-reader') return syncReader();
  if (!['serve', 'list', 'validate'].includes(command)) {
    console.log(
      '用法：node catalog.mjs <serve|list|validate|sync-reader> [--root <目录>]\nserve: [--port 4317]\nlist/validate: --business --category --type --scenario --tag --evidence --status --priority --q'
    );
    if (command !== 'help') process.exitCode = 1;
    return;
  }
  const root = path.resolve(options.root ?? defaultRoot);
  if (!(await lstat(root)).isDirectory()) throw new Error('用例根路径必须为真实目录');
  if (command === 'serve') {
    const port = Number(options.port ?? 4317);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('端口必须在 1–65535 之间');
    await scanCatalog(root);
    return serveCatalog({ root, port });
  }
  const catalog = await scanCatalog(root);
  const cases = format.filterCases(catalog.cases, options);
  if (command === 'list')
    console.log(
      JSON.stringify(
        { ...catalog, cases, total: catalog.cases.length, matched: cases.length },
        null,
        2
      )
    );
  else {
    console.log(
      `用例 ${catalog.cases.length}，跳过历史文档 ${catalog.skipped}，格式问题 ${catalog.errors.length}`
    );
    catalog.errors.forEach((error) => console.error(`${error.path}: ${error.message}`));
  }
  if (catalog.errors.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
