#!/usr/bin/env node
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  realpath,
  stat,
  open,
  unlink
} from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(directory, '../../../../..');
const reportTool = path.join(directory, 'report.mjs');
const fullScope = '完整子场景（含全部参数变体）';

/** 从原报告读取不可变用例快照，不因测试期间 Markdown 改动扩大执行范围。 */
async function readRun(filename) {
  const html = await readFile(filename, 'utf8');
  const match = html.match(/<script id="run-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('不是有效测试报告');
  const run = JSON.parse(match[1]);
  if (run.version !== 1 || run.closedAt) throw new Error('仅能执行未结束的版本 1 报告');
  return run;
}

/** 按子场景映射分组；未覆盖、缩小变体范围或需复核的项交给 AI，不重复执行已通过项。 */
export function planExecution(run, options = {}) {
  if (options.case && !run.cases.some((entry) => entry.id === options.case))
    throw new Error('指定用例不在本轮报告中');
  const requested = options.items ? options.items.split(',') : undefined;
  if (
    requested &&
    (!options.case || requested.some((id) => !id) || new Set(requested).size !== requested.length)
  )
    throw new Error('--items 需要 --case，且编号不能为空或重复');
  const jobs = [];
  const aiTasks = [];
  const found = new Set();
  for (const testCase of run.cases) {
    if (options.case && options.case !== testCase.id) continue;
    for (const item of testCase.items) {
      if (!item.selected || (requested && !requested.includes(item.id))) continue;
      found.add(item.id);
      const task = { caseId: testCase.id, itemId: item.id, evidence: item.evidence ?? [] };
      if (testCase.status !== 'ready') {
        aiTasks.push({ ...task, action: 'review', reason: '用例定义尚不可执行' });
        continue;
      }
      if (item.result === 'running') throw new Error(task.caseId + '/' + item.id + ' 已在执行');
      if (!requested && item.result !== 'pending') {
        if (['failed', 'blocked'].includes(item.result))
          aiTasks.push({ ...task, action: 'review', reason: item.note.slice(0, 1000) });
        continue;
      }
      const automation = testCase.automation?.find((entry) => entry.items.includes(item.id));
      if (!automation || item.scope !== fullScope) {
        aiTasks.push({
          ...task,
          action: 'execute',
          reason: !automation ? '没有脚本覆盖' : '本轮缩小了变体范围，脚本未声明该范围'
        });
        continue;
      }
      let job = jobs.find(
        (entry) =>
          entry.caseId === testCase.id &&
          entry.runner === automation.runner &&
          entry.script === automation.script
      );
      if (!job) {
        job = {
          caseId: testCase.id,
          runner: automation.runner,
          script: automation.script,
          items: []
        };
        jobs.push(job);
      }
      job.items.push(item.id);
    }
  }
  if (requested && requested.some((id) => !found.has(id)))
    throw new Error('指定子场景不存在或未纳入本轮范围');
  return { jobs, aiTasks };
}

/** 只接受仓库测试目录中的真实入口文件，拒绝路径跳出和符号链接。 */
async function resolveScript(job) {
  const suffix = job.runner === 'node' ? /\.mjs$/ : /\.browser\.spec\.ts$/;
  if (
    !['node', 'playwright'].includes(job.runner) ||
    !suffix.test(job.script) ||
    !job.script.startsWith('.agents/test/') ||
    job.script.split('/').some((part) => ['..', '.', ''].includes(part))
  )
    throw new Error('无效自动化脚本入口');
  const filename = path.resolve(repo, job.script);
  if ((await realpath(filename)) !== filename || !(await stat(filename)).isFile())
    throw new Error('脚本入口必须为仓库测试目录中的非符号链接文件');
  return filename;
}

/** 将 Playwright 每个参数变体的原始状态归入稳定场景 ID，不把 expected failure 或重试通过当作通过。 */
export function parseBrowserResults(data, caseId) {
  const records = [];
  function walk(suite) {
    for (const spec of suite.specs ?? []) {
      const match = /^\[([^/\]]+)\/([\w.-]+)\]/.exec(spec.title);
      if (!match || match[1] !== caseId) continue;
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        const result =
          results.length === 1 && results[0].status === 'passed'
            ? 'passed'
            : !results.length || results.every((entry) => entry.status === 'skipped')
              ? 'blocked'
              : 'failed';
        records.push({
          caseId,
          itemId: match[2],
          result,
          variant: spec.title,
          note:
            results
              .flatMap((entry) => entry.errors ?? [])
              .map((error) => (error.message ?? '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ''))
              .join('\n') || result,
          evidence: results
            .flatMap((entry) => entry.attachments ?? [])
            .filter((entry) => entry.path)
            .map((entry) => ({ path: entry.path }))
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  }
  for (const suite of data.suites ?? []) walk(suite);
  return records;
}

/** 按行复用报告状态机，所有脚本输出都先写入独立尝试目录再成为报告证据。 */
async function update(filename, record, attemptDirectory) {
  const input = path.join(attemptDirectory, 'update-' + record.itemId + '.json');
  await writeFile(input, JSON.stringify({ ...record, executor: 'script' }));
  execFileSync(process.execPath, [reportTool, 'update', '--report', filename, '--record', input], {
    cwd: repo,
    stdio: ['ignore', 'ignore', 'pipe']
  });
}

/** 串行启动独立进程，超时终止整个进程组；输出留在证据目录，不通过 shell 拼接命令。 */
async function runProcess({ command, args, env, attemptDirectory, timeout }) {
  const output = createWriteStream(path.join(attemptDirectory, 'process.log'), { flags: 'wx' });
  const child = spawn(command, args, {
    cwd: repo,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  let timedOut = false;
  let interrupted = false;
  let killTimer;
  const stop = (signal) => {
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    stop('SIGTERM');
    killTimer = setTimeout(() => stop('SIGKILL'), 3000);
  }, timeout);
  const interrupt = () => {
    interrupted = true;
    stop('SIGTERM');
    killTimer ??= setTimeout(() => stop('SIGKILL'), 3000);
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal, timedOut, interrupted }));
    });
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    await new Promise((resolve) => output.end(resolve));
  }
}

/** 执行一组已授权场景；失败只保留事实并安排 AI 复核，不修改脚本或自动放宽断言。 */
async function executeJob({ filename, run, job, timeout }) {
  const evidenceDirectory = path.join(path.dirname(filename), 'evidence');
  await mkdir(evidenceDirectory, { recursive: true });
  const attemptDirectory = await realpath(
    await mkdtemp(path.join(evidenceDirectory, 'script-' + job.caseId + '-'))
  );
  const reportDirectory = await realpath(path.dirname(filename));
  const relative = (file) => path.relative(reportDirectory, file).split(path.sep).join('/');
  for (const itemId of job.items)
    await update(
      filename,
      { caseId: job.caseId, itemId, result: 'running', note: '脚本执行：' + job.script },
      attemptDirectory
    );
  let records = [];
  let processResult;
  let problem;
  let scriptSha256;
  try {
    const script = await resolveScript(job);
    scriptSha256 = createHash('sha256')
      .update(await readFile(script))
      .digest('hex');
    const resultFile = path.join(attemptDirectory, 'results.json');
    const env = {
      ...process.env,
      FASTGPT_TEST_RUN_DIR: attemptDirectory,
      FASTGPT_TEST_RESULTS_FILE: resultFile,
      FASTGPT_TEST_CASE_ID: job.caseId,
      FASTGPT_TEST_ITEMS: JSON.stringify(job.items),
      FASTGPT_TEST_BASE_URL: run.baseUrl,
      PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(attemptDirectory, 'playwright.json')
    };
    const grep =
      '\\[' +
      job.caseId +
      '/(?:' +
      job.items.map((id) => id.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')).join('|') +
      ')\\]';
    processResult = await runProcess({
      command:
        job.runner === 'node'
          ? process.execPath
          : process.platform === 'win32'
            ? 'pnpm.cmd'
            : 'pnpm',
      args:
        job.runner === 'node'
          ? [script]
          : [
              'exec',
              'playwright',
              'test',
              job.script,
              '--config',
              '.agents/test/playwright.config.ts',
              '--grep',
              grep,
              '--retries',
              '0',
              '--workers',
              '1'
            ],
      env,
      attemptDirectory,
      timeout
    });
    let output;
    if (job.runner === 'node') output = JSON.parse(await readFile(resultFile, 'utf8'));
    else {
      const data = JSON.parse(
        await readFile(path.join(attemptDirectory, 'playwright.json'), 'utf8')
      );
      output = parseBrowserResults(data, job.caseId);
      if (data.errors?.length)
        problem = '浏览器执行器错误：' + data.errors.map((error) => error.message).join('\n');
    }
    if (
      !Array.isArray(output) ||
      output.some(
        (entry) =>
          !entry ||
          entry.caseId !== job.caseId ||
          !job.items.includes(entry.itemId) ||
          !['passed', 'failed', 'blocked'].includes(entry.result) ||
          typeof entry.note !== 'string' ||
          !entry.note.trim()
      )
    )
      throw new Error('脚本输出包含无效或范围外的结果');
    records = output;
    if (processResult.code !== 0 && !records.some((entry) => entry.result === 'failed'))
      problem ??= '脚本异常退出，不能仅凭部分成功记录判通过';
  } catch (error) {
    problem = '脚本未完成有效执行：' + error.message;
  }
  if (processResult?.timedOut)
    problem = '脚本进程超时，需复核实际执行和清理情况；' + (problem ?? '');
  if (processResult?.interrupted)
    problem = '脚本执行被中断，需复核实际执行和清理情况；' + (problem ?? '');
  for (const itemId of job.items) {
    const matching = records.filter((entry) => entry.itemId === itemId);
    let result = matching.some((entry) => entry.result === 'failed')
      ? 'failed'
      : matching.length && matching.every((entry) => entry.result === 'passed')
        ? 'passed'
        : 'blocked';
    let note = matching
      .map((entry) => (entry.variant ? entry.variant + '：' : '') + entry.note)
      .join('\n');
    if (problem || !matching.length) {
      result = result === 'failed' ? 'failed' : 'blocked';
      note = [problem, !matching.length ? '没有产生该子场景的执行结果' : '', note]
        .filter(Boolean)
        .join('\n');
    }
    const evidence = [];
    try {
      for (const entry of matching)
        for (const file of entry.evidence ?? []) {
          const actual = await realpath(path.resolve(attemptDirectory, file.path));
          if (!actual.startsWith(attemptDirectory + path.sep) || !(await stat(actual)).isFile())
            throw new Error('脚本证据必须位于本次尝试目录中');
          const entry = { path: relative(actual), label: file.label ?? path.basename(actual) };
          if (!evidence.some((file) => file.path === entry.path)) evidence.push(entry);
        }
      if (job.runner === 'node' && ['passed', 'failed'].includes(result) && !evidence.length)
        throw new Error('Node 脚本通过/失败必须提供实际响应或数据快照证据');
    } catch (error) {
      result = 'blocked';
      note += '\n' + error.message;
    }
    const observation = path.join(attemptDirectory, itemId + '-observation.json');
    await writeFile(
      observation,
      JSON.stringify(
        {
          job,
          itemId,
          scriptSha256,
          baseUrl: run.baseUrl,
          targetVersion: run.targetVersion,
          processResult,
          problem,
          records: matching
        },
        null,
        2
      )
    );
    evidence.unshift({ path: relative(observation), label: '本次脚本结果与变体' });
    if (job.runner === 'playwright') {
      const raw = path.join(attemptDirectory, 'playwright.json');
      if (await stat(raw).catch(() => undefined))
        evidence.push({ path: relative(raw), label: 'Playwright 原始报告' });
    }
    if (await stat(path.join(attemptDirectory, 'process.log')).catch(() => undefined))
      evidence.push({
        path: relative(path.join(attemptDirectory, 'process.log')),
        label: '脚本进程输出'
      });
    await update(
      filename,
      {
        caseId: job.caseId,
        itemId,
        result,
        note: ('脚本' + (result === 'passed' ? '通过：' : '未通过，待 AI 复核：') + note).slice(
          0,
          5000
        ),
        evidence
      },
      attemptDirectory
    );
  }
  return processResult?.interrupted ?? false;
}

/** 默认只运行当前报告中的待执行脚本；--case/--items 用于 AI 复核后的显式复测。 */
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, '');
    if (
      !args[i].startsWith('--') ||
      !['report', 'plan', 'case', 'items', 'timeout-ms'].includes(key) ||
      Object.hasOwn(options, key)
    )
      throw new Error('无效或重复参数：' + args[i]);
    if (key === 'plan') options.plan = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('参数缺少值：' + args[i]);
      options[key] = args[++i];
    }
  }
  if (!options.report) throw new Error('需要 --report 指定已筛选的临时报告');
  const timeout = Number(options['timeout-ms'] ?? 300_000);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 3_600_000)
    throw new Error('timeout-ms 必须为 1000–3600000 的整数');
  const filename = path.resolve(options.report);
  let run = await readRun(filename);
  const plan = planExecution(run, options);
  if (options.plan) return console.log(JSON.stringify(plan, null, 2));
  if (plan.jobs.length) {
    const url = new URL(run.baseUrl);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('先补齐报告中的真实 BASE_URL，不接受 URL 内嵌凭证或查询参数');
  }
  const lock = await open(filename + '.execute.lock', 'wx');
  try {
    let executedJobs = 0;
    for (const job of plan.jobs) {
      executedJobs += 1;
      if (await executeJob({ filename, run, job, timeout })) break;
    }
    run = await readRun(filename);
    const remaining = planExecution(run, options.case ? { case: options.case } : {});
    const aiTasks = remaining.aiTasks.filter(
      (task) => !options.items || options.items.split(',').includes(task.itemId)
    );
    console.log(
      JSON.stringify(
        {
          executedJobs,
          pendingJobs: remaining.jobs,
          aiTasks,
          note: 'AI 执行未覆盖项并复核失败，完成后再结束报告；本命令不会自动判定失败原因。'
        },
        null,
        2
      )
    );
    if (aiTasks.some((task) => task.action === 'review')) process.exitCode = 1;
  } finally {
    await lock.close();
    await unlink(filename + '.execute.lock');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
