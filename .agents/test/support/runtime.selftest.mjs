import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('缺少业务夹具时仅为选中场景写阻塞及证据，不产生假通过', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'fastgpt-case-runtime-'));
  try {
    const env = {
      ...process.env,
      FASTGPT_TEST_FIXTURE: '',
      FASTGPT_TEST_BASE_URL: 'http://127.0.0.1:1',
      FASTGPT_TEST_CASE_ID: 'FG-INTEGRATION-OPENAPI-001',
      FASTGPT_TEST_ITEMS: '["C1","C5"]',
      FASTGPT_TEST_RUN_DIR: directory,
      FASTGPT_TEST_RESULTS_FILE: path.join(directory, 'results.json')
    };
    const run = spawnSync(
      process.execPath,
      ['.agents/test/integration/openapi/FG-INTEGRATION-OPENAPI-001.mjs'],
      {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 5000
      }
    );
    assert.equal(run.status, 1);
    const results = JSON.parse(await readFile(env.FASTGPT_TEST_RESULTS_FILE, 'utf8'));
    assert.deepEqual(
      results.map((r) => [r.itemId, r.result]),
      [
        ['C1', 'blocked'],
        ['C5', 'blocked']
      ]
    );
    for (const row of results) {
      assert.match(row.note, /FASTGPT_TEST_FIXTURE/);
      assert.ok(JSON.parse(await readFile(path.join(directory, row.evidence[0].path), 'utf8')));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('任意 500 和入参错误不能作为权限拒绝的通过证据', async () => {
  const { permissionDenied } = await import('./scenario.mjs');
  assert.throws(() =>
    permissionDenied({ error: true, http: 500, json: { code: 500, statusText: 'database error' } })
  );
  assert.throws(() => permissionDenied({ error: true, http: 400, json: { code: 400 } }));
  permissionDenied({ error: true, http: 500, json: { code: 502001, statusText: 'unAuthApp' } });
});

test('真实 gate 只接受本轮 RUN 与 token，收尾会放行未完成连接并关闭端口', async () => {
  const { getGate } = await import('./gate.mjs');
  const context = { run: 'fgtest-gate-selfcheck', resources: new Map(), finalizers: [] };
  const observations = [];
  const gate = await getGate(context, {
    fixture: { gate: { port: 0, tokenEnv: 'SELFTEST_TOKEN' } },
    secret: () => 'private-fixture-token',
    record: (label, value) => observations.push({ label, value })
  });
  const url = `http://127.0.0.1:${gate.address.port}/wait`;
  try {
    assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 403);
    const first = gate.register(context.run + '-first');
    const response = gate.track(
      fetch(url, {
        method: 'POST',
        headers: { 'x-fastgpt-test-token': 'private-fixture-token' },
        body: JSON.stringify({ runId: context.run + '-first' })
      })
    );
    await first.entered();
    assert.equal(first.count(), 1);
    first.release();
    assert.equal((await (await response).value.json()).marker, context.run + '-first');
    const second = gate.register(context.run + '-second');
    const unfinished = gate.track(
      fetch(url, {
        method: 'POST',
        headers: { 'x-fastgpt-test-token': 'private-fixture-token' },
        body: JSON.stringify({ runId: context.run + '-second' })
      })
    );
    await second.entered();
    const late = gate.register(context.run + '-late');
    let sendLate;
    const afterCleanupBegins = new Promise((resolve) => {
      sendLate = resolve;
    });
    const lateResponse = gate.track(
      afterCleanupBegins.then(() =>
        fetch(url, {
          method: 'POST',
          headers: { 'x-fastgpt-test-token': 'private-fixture-token' },
          body: JSON.stringify({ runId: context.run + '-late' })
        })
      )
    );
    const cleanup = context.finalizers[0]();
    sendLate();
    await cleanup;
    assert.equal((await (await unfinished).value.json()).cleanup, true);
    assert.equal((await (await lateResponse).value.json()).cleanup, true);
    assert.equal(late.count(), 1);
    assert.equal(observations.length, 3);
  } finally {
    // finalizer 可重复执行：Node server.close 已关闭时也会返回，不遗留服务。
    await context.finalizers[0]();
  }
});

test('清理失败仍继续回收其他资源，并将成功场景降为阻塞；证据不含凭证', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'fastgpt-cleanup-selfcheck-'));
  try {
    const fixture = path.join(directory, 'fixture.json');
    await writeFile(
      fixture,
      JSON.stringify({
        version: 1,
        isolated: true,
        teamId: '000000000000000000000001',
        baseUrl: 'http://127.0.0.1:1'
      })
    );
    const entry = path.join(directory, 'entry.mjs');
    const runtime = new URL('./runtime.mjs', import.meta.url).href;
    await writeFile(
      entry,
      `import {runNodeCase} from ${JSON.stringify(runtime)}; import {writeFile} from 'node:fs/promises'; await runNodeCase('FG-SELFTEST', {C1: async c => { c.secrets.add('private-test-credential'); c.observations.push({sample:'private-test-credential'}); c.cleanups.push(() => writeFile(${JSON.stringify(path.join(directory, 'recovered'))}, 'yes')); c.cleanups.push(() => {throw new Error('cleanup private-test-credential')}); return 'checked'; }});`
    );
    const run = spawnSync(process.execPath, [entry], {
      cwd: root,
      env: {
        ...process.env,
        FASTGPT_TEST_FIXTURE: fixture,
        FASTGPT_TEST_BASE_URL: 'http://127.0.0.1:1',
        FASTGPT_TEST_CASE_ID: 'FG-SELFTEST',
        FASTGPT_TEST_ITEMS: '["C1"]',
        FASTGPT_TEST_RUN_DIR: directory,
        FASTGPT_TEST_RESULTS_FILE: path.join(directory, 'results.json')
      },
      encoding: 'utf8',
      timeout: 5000
    });
    assert.equal(run.status, 1);
    assert.equal(await readFile(path.join(directory, 'recovered'), 'utf8'), 'yes');
    const results = JSON.parse(await readFile(path.join(directory, 'results.json'), 'utf8'));
    assert.equal(results[0].result, 'blocked');
    for (const name of ['C1-evidence.json', 'cleanup.json'])
      assert.ok(
        !(await readFile(path.join(directory, name), 'utf8')).includes('private-test-credential')
      );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('真实 HTTP 分块 SSE 保留中文与多行 data，并识别错误和完成事件', async () => {
  const { readHttpResult } = await import('./scenario.mjs');
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const bytes = Buffer.from(
      'event: answer\r\ndata: {"choices":[{"delta":{"content":"中文"}}]}\r\n\r\nevent: error\ndata: {"code":504001,\ndata: "message":"busy"}\n\nevent: done\ndata: [DONE]\n\n'
    );
    for (const byte of bytes) res.write(Buffer.of(byte));
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const result = await readHttpResult(await fetch(`http://127.0.0.1:${server.address().port}`));
    assert.equal(result.text, '中文');
    assert.equal(result.done, true);
    assert.equal(result.events.find((e) => e.event === 'error').data.code, 504001);
    assert.equal(result.error, true);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('证据脱敏遇到循环资源也能完成，不丢失已执行的场景结果', async () => {
  const { sanitize } = await import('./scenario.mjs');
  const resource = { token: 'private-value' };
  resource.self = resource;
  assert.deepEqual(sanitize(resource), { token: '[REDACTED]', self: '[Circular]' });
});

test('一个场景失败后先执行该项收尾，再运行下一场景，防止忙任务污染后续', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'fg-item-finalizer-'));
  try {
    const fixture = path.join(directory, 'fixture.json'),
      entry = path.join(directory, 'entry.mjs'),
      results = path.join(directory, 'results.json');
    await writeFile(
      fixture,
      JSON.stringify({
        version: 1,
        isolated: true,
        teamId: '000000000000000000000001',
        baseUrl: 'http://127.0.0.1:1'
      })
    );
    await writeFile(
      entry,
      `import assert from 'node:assert/strict';import{runNodeCase}from ${JSON.stringify(new URL('./runtime.mjs', import.meta.url).href)};await runNodeCase('FG-ITEM-FINALLY',{C1:async c=>{c.resources.set('busy',true);c.itemFinalizers.push(async()=>c.resources.set('busy',false));throw Error('expected first failure');},C2:async c=>{assert.equal(c.resources.get('busy'),false);c.observations.push({idle:true});return 'next is isolated';}});`
    );
    const run = spawnSync(process.execPath, [entry], {
      env: {
        ...process.env,
        FASTGPT_TEST_FIXTURE: fixture,
        FASTGPT_TEST_BASE_URL: 'http://127.0.0.1:1',
        FASTGPT_TEST_CASE_ID: 'FG-ITEM-FINALLY',
        FASTGPT_TEST_ITEMS: '["C1","C2"]',
        FASTGPT_TEST_RUN_DIR: directory,
        FASTGPT_TEST_RESULTS_FILE: results
      },
      encoding: 'utf8',
      timeout: 5000
    });
    assert.equal(run.status, 1);
    assert.deepEqual(
      JSON.parse(await readFile(results, 'utf8')).map((row) => row.result),
      ['failed', 'passed']
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
