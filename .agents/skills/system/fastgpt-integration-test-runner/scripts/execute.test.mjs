import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { planExecution, parseBrowserResults } from './execute.mjs';
import state from './report-state.cjs';
import format from '../../fastgpt-integration-test-case/scripts/case-format.cjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(directory, '../../../../..');
const reportTool = path.join(directory, 'report.mjs');
const executeTool = path.join(directory, 'execute.mjs');
const exec = promisify(execFile);
const item = (id, changes = {}) => ({
  id,
  selected: true,
  result: 'pending',
  scope: '完整子场景（含全部参数变体）',
  attempt: 0,
  history: [],
  ...changes
});

test('脚本映射只接受仓库内入口和唯一场景覆盖', async () => {
  const file = 'app/workflow/editor/FG-APP-WORKFLOW-007-ordinary-connection-rules.md';
  const content = await readFile(path.join(repo, '.agents/test', file), 'utf8');
  const businesses = format.flattenBusinesses(
    JSON.parse(await readFile(path.join(repo, '.agents/test/businesses.json'), 'utf8'))
  );
  assert.ok(format.parseCase(content, file, businesses).case);
  assert.match(
    format.parseCase(content.replace('script: .agents/test/', 'script: ../'), file, businesses)
      .error,
    /automation/
  );
  assert.match(
    format.parseCase(
      content.replace('items: [C1, C2, C3, C4]', 'items: [C1, C1]'),
      file,
      businesses
    ).error,
    /重复覆盖/
  );
});

test('按子场景分派脚本和 AI，不扩展自定义变体范围或隐式复跑终态', () => {
  const run = {
    cases: [
      {
        id: 'FG-TEST-ONE',
        status: 'ready',
        automation: [{ runner: 'node', script: '.agents/test/api.mjs', items: ['C1', 'C2'] }],
        items: [
          item('C1'),
          item('C2', { scope: '仅第一个变体' }),
          item('C3'),
          item('C4', { result: 'failed', note: '原失败' }),
          item('C5', { result: 'passed' })
        ]
      }
    ]
  };
  const plan = planExecution(run);
  assert.deepEqual(plan.jobs[0].items, ['C1']);
  assert.deepEqual(
    plan.aiTasks.map((entry) => [entry.itemId, entry.action]),
    [
      ['C2', 'execute'],
      ['C3', 'execute'],
      ['C4', 'review']
    ]
  );
  assert.throws(() => planExecution(run, { items: 'C1' }), /需要 --case/);
  assert.throws(() => planExecution(run, { case: 'FG-TEST-ONE', items: 'C9' }), /不存在/);
});

test('浏览器按原始变体结果判断，预期失败、跳过和重试不能伪装为通过', () => {
  const statuses = [['passed'], ['failed'], ['failed', 'passed'], ['skipped'], []];
  const data = {
    suites: [
      {
        suites: [
          {
            specs: statuses.map((values, i) => ({
              title: '[FG-TEST-BROWSER/C' + (i + 1) + '] 变体',
              tests: [
                {
                  expectedStatus: 'failed',
                  results: values.map((status) => ({ status, errors: [] }))
                }
              ]
            }))
          }
        ]
      }
    ]
  };
  assert.deepEqual(
    parseBrowserResults(data, 'FG-TEST-BROWSER').map((entry) => entry.result),
    ['passed', 'failed', 'failed', 'blocked', 'blocked']
  );
});

test('执行方随实际尝试记录，AI 复核保留脚本来源，AI 复测单独保留历史', () => {
  const row = item('C1', { plannedExecutor: 'script' });
  const run = { revision: 1, cases: [{ id: 'FG-TEST-ONE', status: 'ready', items: [row] }] };
  const update = (record) =>
    state.updateItem(
      run,
      { caseId: 'FG-TEST-ONE', itemId: 'C1', note: '实际观察', ...record },
      new Date().toISOString()
    );
  update({ result: 'running', executor: 'script' });
  update({ result: 'failed', executor: 'script', evidence: [{ path: 'evidence/script.json' }] });
  update({ result: 'failed', reviewer: 'ai', evidence: [{ path: 'evidence/review.json' }] });
  assert.equal(row.executor, 'script');
  assert.equal(row.reviewer, 'ai');
  assert.throws(
    () => update({ result: 'failed', reviewer: 'ai', executor: 'ai', evidence: [{}] }),
    /变更执行方/
  );
  update({ result: 'running', executor: 'ai' });
  update({ result: 'passed', executor: 'ai', evidence: [{ path: 'evidence/ai.json' }] });
  assert.equal(row.attempt, 2);
  assert.equal(row.executor, 'ai');
  assert.equal(row.history[1].executor, 'script');
  assert.equal(row.history[2].reviewer, 'ai');
  assert.equal(state.executorLabel(row), 'AI');
});

/** 在临时用例库与唯一临时脚本目录验证真实 CLI，所有产物由 finally 清理。 */
async function harness(runner) {
  const folder = await mkdtemp(path.join(tmpdir(), 'fastgpt-executor-test-'));
  const scripts = await mkdtemp(path.join(repo, '.agents/test/_executor-check-'));
  const root = path.join(folder, 'catalog');
  const caseFolder = path.join(root, 'app/workflow/editor');
  await mkdir(caseFolder, { recursive: true });
  await writeFile(
    path.join(root, 'businesses.json'),
    JSON.stringify({
      app: {
        name: '应用',
        children: { workflow: { name: '工作流', children: { editor: '编排' } } }
      }
    })
  );
  const caseId = runner === 'node' ? 'FG-TEST-NODE' : 'FG-TEST-BROWSER';
  const script = path.join(scripts, runner === 'node' ? 'case.mjs' : 'case.browser.spec.ts');
  const relative = path.relative(repo, script).split(path.sep).join('/');
  const content = `---
case_version: 1
id: ${caseId}
title: 执行框架自验证
business: app/workflow/editor
category: basic
types: [ui]
scenario: success
priority: P1
status: ready
tags: []
evidence: [ui]
sources: []
routes: []
related: []
baseline: framework-self-check
automation:
  - runner: ${runner}
    script: ${relative}
    items: [C1, C2]
---
# 框架自验证，不代表产品业务执行
## 用例简介
验证工具协议。
## 前置准备
临时可控数据。
## 测试步骤
按编号执行。
## 预期结果
| 子场景 | 特有预期 |
| --- | --- |
| C1 | 确定性成功 |
| C2 | 验证失败接手 |
| C3 | 无脚本交给 AI |
`;
  await writeFile(path.join(caseFolder, caseId + '-case.md'), content);
  let report;
  const command = async (tool, args, expectedCode = 0) => {
    try {
      const result = await exec(process.execPath, [tool, ...args], {
        cwd: repo,
        maxBuffer: 2 * 1024 * 1024
      });
      assert.equal(expectedCode, 0, '应当非零退出');
      return JSON.parse(result.stdout);
    } catch (error) {
      if (typeof error.code !== 'number') throw error;
      assert.equal(error.code, expectedCode, error.stderr);
      return JSON.parse(error.stdout);
    }
  };
  return {
    caseId,
    script,
    async init(baseUrl) {
      const initialized = await command(reportTool, [
        'init',
        '--root',
        root,
        '--ids',
        caseId,
        '--reason',
        '仅框架自验证',
        '--base-url',
        baseUrl
      ]);
      report = initialized.report;
      return report;
    },
    async run(args = [], code = 0) {
      return command(executeTool, ['--report', report, ...args], code);
    },
    async data() {
      return JSON.parse(
        (await readFile(report, 'utf8')).match(
          /<script id="run-data" type="application\/json">([\s\S]*?)<\/script>/
        )[1]
      );
    },
    async close() {
      if (report) await rm(path.dirname(report), { recursive: true, force: true });
      await rm(scripts, { recursive: true, force: true });
      await rm(folder, { recursive: true, force: true });
    }
  };
}

test('Node 脚本请求真实测试 HTTP 服务，失败进入 AI 复核，显式重跑保留历史', async () => {
  let valid = false;
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ value: req.url === '/C1' || valid ? 1 : 0 }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const h = await harness('node');
  try {
    await writeFile(
      h.script,
      `
import assert from 'node:assert/strict';import{writeFile}from'node:fs/promises';import path from'node:path';
const results=[];
for(const itemId of JSON.parse(process.env.FASTGPT_TEST_ITEMS)){
 const body=await(await fetch(process.env.FASTGPT_TEST_BASE_URL+'/'+itemId)).json();
 const file=itemId+'.json';await writeFile(path.join(process.env.FASTGPT_TEST_RUN_DIR,file),JSON.stringify(body));
 try{assert.equal(body.value,1);results.push({caseId:process.env.FASTGPT_TEST_CASE_ID,itemId,result:'passed',note:'实际响应符合预期',evidence:[{path:file}]});}
 catch(error){results.push({caseId:process.env.FASTGPT_TEST_CASE_ID,itemId,result:'failed',note:error.message,evidence:[{path:file}]});}
}
await writeFile(process.env.FASTGPT_TEST_RESULTS_FILE,JSON.stringify(results));if(results.some(r=>r.result==='failed'))process.exitCode=1;
`
    );
    await h.init('http://127.0.0.1:' + server.address().port);
    const first = await h.run([], 1);
    assert.deepEqual(
      first.aiTasks.map((entry) => [entry.itemId, entry.action]),
      [
        ['C2', 'review'],
        ['C3', 'execute']
      ]
    );
    let data = await h.data();
    assert.equal(data.cases[0].items[0].executor, 'script');
    assert.equal(data.cases[0].items[1].result, 'failed');
    assert.equal(data.cases[0].items[2].executor, null);
    valid = true;
    await h.run(['--case', h.caseId, '--items', 'C2']);
    data = await h.data();
    const row = data.cases[0].items[1];
    assert.equal(row.result, 'passed');
    assert.equal(row.attempt, 2);
    assert.ok(
      row.history.some((entry) => entry.result === 'failed' && entry.executor === 'script')
    );
    assert.equal(data.cases[0].items[2].result, 'pending');
    await writeFile(h.script, 'setInterval(() => {}, 1000); await new Promise(() => {});');
    await h.run(['--case', h.caseId, '--items', 'C2', '--timeout-ms', '1000'], 1);
    data = await h.data();
    assert.equal(data.cases[0].items[1].result, 'blocked');
    assert.match(data.cases[0].items[1].note, /脚本进程超时/);
    await writeFile(
      h.script,
      "import{writeFile}from'node:fs/promises';await writeFile(process.env.FASTGPT_TEST_RESULTS_FILE,'null');"
    );
    await h.run(['--case', h.caseId, '--items', 'C2'], 1);
    assert.equal((await h.data()).cases[0].items[1].result, 'blocked');
  } finally {
    await h.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('无头 Chromium 实际点击，失败回填和每行执行方在 HTML 中准确展示', async () => {
  const h = await harness('playwright');
  let browser;
  try {
    await writeFile(
      h.script,
      `
import{test,expect}from'@playwright/test';
test('[FG-TEST-BROWSER/C1] 无头真实点击',async({page},info)=>{
 expect(info.project.use.headless).toBe(true);
 await page.setContent('<button onclick="this.textContent=\\'完成\\'">执行</button>');
 await page.getByRole('button',{name:'执行'}).click();
 await expect(page.getByRole('button',{name:'完成'})).toBeVisible();
});
test('[FG-TEST-BROWSER/C2] 可控失败供 AI 复核',async({page})=>{
 await page.setContent('<p>框架失败路径自验证</p>');expect(1).toBe(2);
});
`
    );
    const report = await h.init('http://127.0.0.1:1');
    const result = await h.run([], 1);
    assert.ok(result.aiTasks.some((entry) => entry.itemId === 'C2' && entry.action === 'review'));
    const data = await h.data();
    assert.deepEqual(
      data.cases[0].items.map((entry) => entry.result),
      ['passed', 'failed', 'pending']
    );
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(pathToFileURL(report).href);
    assert.equal(await page.locator('#case-table > thead th').count(), 9);
    assert.match(await page.locator('.case-row > td').nth(4).innerText(), /混合/);
    await page.locator('.case-row').click();
    assert.deepEqual(await page.locator('.execution-executor').allTextContents(), [
      '脚本',
      '脚本',
      'AI（未执行）'
    ]);
    assert.equal(await page.locator('.detail-row > td').getAttribute('colspan'), '9');
  } finally {
    await browser?.close();
    await h.close();
  }
});
