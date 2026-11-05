#!/usr/bin/env node
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rename,
  realpath,
  stat,
  open,
  unlink
} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { scanCatalog } from '../../fastgpt-integration-test-case/scripts/catalog.mjs';
import format from '../../fastgpt-integration-test-case/scripts/case-format.cjs';
import state from './report-state.cjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(directory, '../../../../..');
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
const begin = '<!-- RUN_DATA_BEGIN -->\n<script id="run-data" type="application/json">';
const end = '</script>\n<!-- RUN_DATA_END -->';

/** 报告仅保存测试入口，不把 URL 内嵌凭证或查询参数带入交付物。 */
function validateBaseUrl(value) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('BASE_URL 只能包含 HTTP(S) 地址及路径，不包含凭证、查询或 fragment');
}

/** 运行状态只存于 HTML 的固定区块；转义 HTML 分隔符，防止用例文本结束 script。 */
function serialize(run) {
  return JSON.stringify(run)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** 保留用例快照原文及页面，只原子替换状态区块，避免中断写入产生半份报告。 */
async function loadReport(filename) {
  const html = await readFile(filename, 'utf8');
  const start = html.indexOf(begin);
  const finish = html.indexOf(end, start + begin.length);
  if (start < 0 || finish < 0) throw new Error('不是本工具生成的测试报告');
  const run = JSON.parse(html.slice(start + begin.length, finish));
  if (run.version !== 1) throw new Error('不支持的报告版本');
  return { html, run, start, finish };
}

/** 仅识别预期结果章节的编号矩阵；无矩阵时采用一个整体断言项，避免猜测步骤对应关系。 */
async function executionItems(testCase) {
  const require = createRequire(path.join(repo, 'projects/app/package.json'));
  const { marked } = await import(pathToFileURL(require.resolve('marked')));
  let expected = false;
  for (const token of marked.lexer(testCase.body)) {
    if (token.type === 'heading' && token.depth === 2) expected = token.text === '预期结果';
    if (!expected || token.type !== 'table') continue;
    if (!['子场景', '场景', '编号', '步骤'].includes(token.header[0]?.text.trim())) continue;
    const items = token.rows.map((row) => ({
      id: row[0].text.replace(/`/g, '').trim(),
      expected: row
        .slice(1)
        .map((cell) => cell.text)
        .join('；')
    }));
    if (
      items.some((item) => !/^[A-Za-z][\w.-]*$/.test(item.id)) ||
      new Set(items.map((item) => item.id)).size !== items.length
    )
      throw new Error(`${testCase.id} 的预期矩阵编号不唯一或不是稳定编号`);
    if (items.length) return { mode: 'matrix', items };
  }
  return { mode: 'whole', items: [{ id: 'CASE', expected: '验证本用例的全部预期结果' }] };
}

/** 从同一份已带许可声明的阅读器复用 Markdown 渲染库，生成离线可读的单 HTML。 */
async function renderReport(run) {
  const reader = await readFile(path.join(repo, '.agents/test/index.html'), 'utf8');
  const bundle = (name) => {
    const match = reader.match(new RegExp(`<script data-bundle="${name}">[\\s\\S]*?<\\/script>`));
    if (!match) throw new Error(`用例阅读器缺少 ${name} 资源`);
    return match[0];
  };
  const licenses = reader.match(/<template data-third-party-licenses>[\s\S]*?<\/template>/)?.[0];
  if (!licenses) throw new Error('用例阅读器缺少第三方许可');
  const shared = (await readFile(path.join(directory, 'report-state.cjs'), 'utf8')).replace(
    /<\/script/gi,
    '<\\/script'
  );
  const parts = {
    VENDORS: bundle('marked') + '\n' + bundle('dompurify'),
    LICENSES: licenses,
    STATE: `<script>${shared}</script>`,
    DATA: begin + serialize(run) + end
  };
  const template = await readFile(path.join(directory, '../assets/report-template.html'), 'utf8');
  return template.replace(/<!-- REPORT_(VENDORS|LICENSES|STATE|DATA) -->/g, (_, key) => parts[key]);
}

/** 使用显式选择器创建快照；可缩小到子场景，但不删除未选项及其上下文。 */
async function initialize(options) {
  const filters = Object.fromEntries(
    filterNames.filter((key) => options[key]).map((key) => [key, options[key]])
  );
  if (!options.reason?.trim()) throw new Error('init 必须提供 --reason 说明本轮测试范围');
  if (!options.ids && !options.selection && !Object.keys(filters).length)
    throw new Error('必须明确提供 --ids、--selection 或查询条件，不能默认执行全库');
  if (options.ids && options.selection) throw new Error('--ids 与 --selection 二选一');
  const catalog = await scanCatalog(path.resolve(options.root ?? path.join(repo, '.agents/test')));
  if (catalog.errors.length)
    throw new Error(`用例库存在格式问题：${JSON.stringify(catalog.errors)}`);
  const selection = options.selection
    ? JSON.parse(await readFile(options.selection, 'utf8'))
    : undefined;
  if (options.selection && (!Array.isArray(selection?.cases) || !selection.cases.length))
    throw new Error('selection.cases 必须为非空数组');
  const chosen = selection?.cases ?? options.ids?.split(',').map((id) => ({ id: id.trim() }));
  if (
    chosen?.some(
      (entry) =>
        !entry ||
        typeof entry.id !== 'string' ||
        Object.keys(entry).some((key) => !['id', 'reason', 'items', 'itemScope'].includes(key))
    )
  )
    throw new Error('选择项仅支持 id/reason/items/itemScope 字段');
  if (chosen && new Set(chosen.map((item) => item.id)).size !== chosen.length)
    throw new Error('选择列表包含重复 ID');
  const filtered = format.filterCases(catalog.cases, filters);
  if (chosen?.some((item) => !filtered.some((entry) => entry.id === item.id)))
    throw new Error('选择 ID 不存在或不满足查询条件');
  const cases = chosen
    ? chosen.map((item) => filtered.find((entry) => entry.id === item.id))
    : filtered;
  if (!cases.length) throw new Error('没有匹配用例');
  const now = new Date().toISOString();
  const snapshots = [];
  for (const testCase of cases) {
    const choice = chosen?.find((item) => item.id === testCase.id);
    const parsed = await executionItems(testCase);
    if (
      testCase.automation?.some((entry) =>
        entry.items.some((id) => !parsed.items.some((item) => item.id === id))
      )
    )
      throw new Error(`${testCase.id} 的 automation 包含不存在的子场景`);
    if (
      choice?.items &&
      (!Array.isArray(choice.items) ||
        !choice.items.length ||
        new Set(choice.items).size !== choice.items.length ||
        choice.items.some((id) => !parsed.items.some((item) => item.id === id)))
    )
      throw new Error(`${testCase.id} 包含无效或重复的子场景选择`);
    if (choice && Object.hasOwn(choice, 'items') && !choice.items)
      throw new Error('items 不能为 null');
    if (
      choice?.itemScope &&
      (typeof choice.itemScope !== 'object' ||
        Array.isArray(choice.itemScope) ||
        Object.keys(choice.itemScope).some(
          (id) => !(choice.items ?? parsed.items.map((item) => item.id)).includes(id)
        ))
    )
      throw new Error('itemScope 只能声明已选子场景的范围');
    const items = parsed.items.map((item) => {
      const selected = !choice?.items || choice.items.includes(item.id);
      const result = !selected ? 'skipped' : testCase.status === 'ready' ? 'pending' : 'blocked';
      const note = !selected
        ? '未纳入本轮范围'
        : testCase.status === 'ready'
          ? '尚未执行'
          : `源用例状态为 ${testCase.status}，需先完善定义再创建执行报告`;
      const scope = choice?.itemScope?.[item.id] ?? '完整子场景（含全部参数变体）';
      if (typeof scope !== 'string' || !scope.trim()) throw new Error('itemScope 必须为非空说明');
      const plannedExecutor =
        scope === '完整子场景（含全部参数变体）' &&
        testCase.automation?.some((entry) => entry.items.includes(item.id))
          ? 'script'
          : 'ai';
      return {
        ...item,
        selected,
        scope,
        result,
        note,
        plannedExecutor,
        executor: null,
        evidence: [],
        attempt: 0,
        history: []
      };
    });
    snapshots.push({
      ...testCase,
      sha256: createHash('sha256').update(testCase.content).digest('hex'),
      reason: choice?.reason ?? options.reason,
      mode: parsed.mode,
      items
    });
  }
  const local = (() => {
    try {
      return {
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
        dirty: Boolean(
          execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim()
        )
      };
    } catch {
      return { commit: '未知', dirty: null };
    }
  })();
  if (options['base-url']) validateBaseUrl(options['base-url']);
  const run = {
    version: 1,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    reason: options.reason,
    environment: options.environment ?? '未知，执行前补齐',
    baseUrl: options['base-url'] ?? '未知',
    targetVersion: options['target-version'] ?? '未知（不能以本地 HEAD 替代部署版本）',
    local,
    cases: snapshots
  };
  const html = await renderReport(run);
  const parent = path.join(os.tmpdir(), 'fastgpt-test-runs');
  await mkdir(parent, { recursive: true });
  const folder = await mkdtemp(path.join(parent, 'run-'));
  await mkdir(path.join(folder, 'evidence'));
  const filename = path.join(folder, 'report.html');
  await writeFile(filename, html, { encoding: 'utf8', mode: 0o600 });
  return { report: filename, evidenceDirectory: path.join(folder, 'evidence'), ...describe(run) };
}

/** 证据仅引用本轮目录中的真实文件；禁止越界路径及符号链接跳转。 */
async function checkEvidence(filename, evidence) {
  if (!Array.isArray(evidence)) throw new Error('evidence 必须为数组');
  const folder = await realpath(path.join(path.dirname(filename), 'evidence'));
  return Promise.all(
    evidence.map(async (entry) => {
      if (
        typeof entry.path !== 'string' ||
        !entry.path.startsWith('evidence/') ||
        entry.path.includes('\\') ||
        entry.path.split('/').includes('..')
      )
        throw new Error('证据路径必须位于 evidence/ 下');
      const actual = await realpath(path.resolve(path.dirname(filename), entry.path));
      if (!actual.startsWith(folder + path.sep) || !(await stat(actual)).isFile())
        throw new Error('证据不是本轮目录内的文件');
      return { path: entry.path, label: String(entry.label ?? entry.path) };
    })
  );
}

function describe(run) {
  return {
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    closedAt: run.closedAt,
    interrupted: run.interrupted,
    summary: state.summarize(run.cases.flatMap((entry) => entry.items)),
    cases: run.cases.map((entry) => ({
      id: entry.id,
      title: entry.title,
      summary: state.summarize(entry.items),
      items: entry.items
    }))
  };
}

/** CLI 更新串行加锁；失败不覆写旧报告，结束状态也保留未完成项。 */
async function mutate(filename, action) {
  const lock = await open(filename + '.lock', 'wx');
  const temporary = filename + '.writing';
  try {
    const loaded = await loadReport(filename);
    await action(loaded.run);
    const html =
      loaded.html.slice(0, loaded.start + begin.length) +
      serialize(loaded.run) +
      loaded.html.slice(loaded.finish);
    await writeFile(temporary, html, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, filename);
    return describe(loaded.run);
  } finally {
    await unlink(temporary).catch(() => {});
    await lock.close();
    await unlink(filename + '.lock');
  }
}

/** 本机只读预览；页面定期拉取状态，更新单元格，不提供浏览器写入接口。 */
function serve(filename, port) {
  const server = createServer(async (request, response) => {
    const actualPort = server.address().port;
    const send = (status, content, type = 'text/plain; charset=utf-8', extra = {}) => {
      response.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
        ...extra
      });
      response.end(content);
    };
    if (![`127.0.0.1:${actualPort}`, `localhost:${actualPort}`].includes(request.headers.host))
      return send(403, '仅允许本机 Host');
    if (
      request.headers.origin &&
      ![`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`].includes(
        request.headers.origin
      )
    )
      return send(403, '不允许跨站请求');
    if (request.method !== 'GET') return send(405, '只支持 GET');
    try {
      const url = new URL(request.url, `http://127.0.0.1:${actualPort}`);
      if (url.pathname === '/')
        return send(200, await readFile(filename), 'text/html; charset=utf-8');
      if (url.pathname === '/state.json')
        return send(
          200,
          JSON.stringify((await loadReport(filename)).run),
          'application/json; charset=utf-8'
        );
      if (url.pathname.startsWith('/evidence/')) {
        const relative = decodeURIComponent(url.pathname.slice(1));
        await checkEvidence(filename, [{ path: relative }]);
        const extension = path.extname(relative).toLowerCase();
        const type = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
          '.txt': 'text/plain; charset=utf-8',
          '.json': 'text/plain; charset=utf-8',
          '.log': 'text/plain; charset=utf-8'
        }[extension];
        return send(
          200,
          await readFile(path.join(path.dirname(filename), relative)),
          type ?? 'application/octet-stream',
          {
            'Content-Security-Policy': "default-src 'none'; sandbox",
            ...(type ? {} : { 'Content-Disposition': 'attachment' })
          }
        );
      }
      return send(404, '资源不存在');
    } catch (error) {
      return send(400, error.message);
    }
  });
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`测试报告：http://127.0.0.1:${server.address().port}/\n文件：${filename}`)
  );
}

async function main() {
  const [command = 'help', ...args] = process.argv.slice(2);
  const allowed = {
    init: [
      'root',
      'ids',
      'selection',
      'reason',
      'environment',
      'base-url',
      'target-version',
      ...filterNames
    ],
    context: ['report', 'environment', 'base-url', 'target-version'],
    show: ['report'],
    update: ['report', 'record'],
    finish: ['report', 'note', 'interrupted'],
    serve: ['report', 'port']
  };
  if (command === 'help') {
    console.log(
      'report.mjs init --ids <ID,...> --reason <范围> [--selection <JSON> 代替 --ids] [用例查询条件]\nreport.mjs context --report <HTML> [--environment <环境>] [--base-url <入口>] [--target-version <版本>]\nreport.mjs show --report <HTML>\nreport.mjs update --report <HTML> --record <JSON>\nreport.mjs finish --report <HTML> --note <清理结果> [--interrupted <原因>]\nreport.mjs serve --report <HTML> [--port 4318]'
    );
    return;
  }
  if (!allowed[command]) throw new Error('未知命令');
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index].slice(2);
    if (
      !args[index].startsWith('--') ||
      !allowed[command].includes(key) ||
      !args[index + 1] ||
      args[index + 1].startsWith('--') ||
      Object.hasOwn(options, key)
    )
      throw new Error(`无效或重复参数：${args[index]}`);
    options[key] = args[index + 1];
  }
  if (command === 'init') return console.log(JSON.stringify(await initialize(options), null, 2));
  if (!options.report) throw new Error('必须提供 --report');
  const filename = path.resolve(options.report);
  if (command === 'show')
    return console.log(JSON.stringify(describe((await loadReport(filename)).run), null, 2));
  if (command === 'serve') {
    const port = Number(options.port ?? 4318);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('端口范围为 0–65535');
    await loadReport(filename);
    return serve(filename, port);
  }
  const result = await mutate(filename, async (run) => {
    const now = new Date().toISOString();
    if (run.closedAt) throw new Error('报告已结束');
    if (command === 'context') {
      if (!options.environment && !options['base-url'] && !options['target-version'])
        throw new Error('至少补充一个环境字段');
      if (options['base-url']) validateBaseUrl(options['base-url']);
      for (const [key, field] of [
        ['environment', 'environment'],
        ['base-url', 'baseUrl'],
        ['target-version', 'targetVersion']
      ])
        if (options[key]) run[field] = options[key];
      run.updatedAt = now;
      run.revision += 1;
      return;
    }
    if (command === 'update') {
      if (!options.record) throw new Error('必须提供 --record');
      const record = JSON.parse(await readFile(options.record, 'utf8'));
      record.evidence = await checkEvidence(filename, record.evidence ?? []);
      return state.updateItem(run, record, now);
    }
    if (!options.note?.trim()) throw new Error('结束时必须 --note 说明清理情况和遗留资源');
    if (
      run.cases.some((entry) =>
        entry.items.some((item) => item.selected && ['pending', 'running'].includes(item.result))
      ) &&
      !options.interrupted
    )
      throw new Error('仍有待执行/执行中项；继续执行或用 --interrupted 如实结束');
    run.closedAt = now;
    run.updatedAt = now;
    run.revision += 1;
    run.closureNote = options.note;
    run.interrupted = options.interrupted ?? null;
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
