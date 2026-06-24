import { afterEach, describe, expect, it } from 'vitest';
import http from 'http';
import { existsSync } from 'fs';
import { PythonIsolatedRunner } from '../../src/isolated/python-isolated-runner';
import {
  PYTHON_SANDBOX_ROOT,
  shouldEnablePythonNativeIsolation
} from '../../src/isolated/python-isolation-config';

describe('PythonIsolatedRunner 兼容性', () => {
  let runner: PythonIsolatedRunner | undefined;

  afterEach(async () => {
    await runner?.shutdown();
    runner = undefined;
  });

  async function createRunner(maxConcurrency = 2) {
    runner = new PythonIsolatedRunner(maxConcurrency);
    await runner.init();
    return runner;
  }

  async function waitForIdlePid(r: PythonIsolatedRunner, previousPid?: number) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const pid = (r as any).idleChildren.values().next().value?.proc?.pid;
      if (pid && pid !== previousPid) return pid;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return undefined;
  }

  it('支持 main() 无参数、print log 和 JSON 返回', async () => {
    const r = await createRunner();

    const result = await r.execute({
      code: `def main():
    print("debug")
    return {"ok": True, "none": None}`,
      variables: {}
    });

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({ ok: true, none: null });
    expect(result.data?.log).toContain('debug');
  });

  it('预热阶段没有 ready 子进程时 init fail closed', async () => {
    const r = new PythonIsolatedRunner(1);
    (r as any).replenishWarmChildren = async () => undefined;
    runner = r;

    await expect(r.init()).rejects.toThrow(/warmup failed/);
    expect(r.stats.ready).toBe(false);
    expect(r.stats.total).toBe(0);
  });

  it('支持 main(variables) 和 main(a, b) 旧写法', async () => {
    const r = await createRunner();

    const byVariables = await r.execute({
      code: `def main(variables):
    return {"name": variables["name"]}`,
      variables: { name: 'FastGPT' }
    });
    expect(byVariables.success).toBe(true);
    expect(byVariables.data?.codeReturn.name).toBe('FastGPT');

    const byArgs = await r.execute({
      code: `def main(a, b=1):
    return {"sum": a + b}`,
      variables: { a: 2 }
    });
    expect(byArgs.success).toBe(true);
    expect(byArgs.data?.codeReturn.sum).toBe(3);
  });

  it('保留 type() 正常判断能力', async () => {
    const r = await createRunner();

    const result = await r.execute({
      code: `def main():
    value = 3
    return {"is_int": type(value) == int}`,
      variables: {}
    });

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.is_int).toBe(true);
  });

  it('每次执行独立进程，不复用全局状态和模块污染', async () => {
    const r = await createRunner(1);

    const first = await r.execute({
      code: `import json
json.dumps = lambda value: "polluted"
leaked = "yes"
def main():
    return {"polluted": json.dumps({})}`,
      variables: {}
    });
    expect(first.success).toBe(true);
    expect(first.data?.codeReturn.polluted).toBe('polluted');

    const second = await r.execute({
      code: `import json
def main():
    try:
        leaked
        has_leaked = True
    except NameError:
        has_leaked = False
    return {"json": json.dumps({"a": 1}), "has_leaked": has_leaked}`,
      variables: {}
    });
    expect(second.success).toBe(true);
    expect(second.data?.codeReturn.json).toBe('{"a": 1}');
    expect(second.data?.codeReturn.has_leaked).toBe(false);
  });

  it('每个任务使用独立临时目录，结束后由父进程清理', async () => {
    const r = await createRunner(1);

    const result = await r.execute({
      code: `import pandas as pd
def main():
    path = task_tmpdir + '/allowed.csv'
    pd.DataFrame({'a': [1]}).to_csv(path, index=False)
    return {"tmp": task_tmpdir}`,
      variables: {}
    });

    expect(result.success).toBe(true);
    const taskTmp = result.data?.codeReturn.tmp;
    expect(taskTmp).toMatch(/task-/);
    const hostTaskTmp = shouldEnablePythonNativeIsolation()
      ? `${PYTHON_SANDBOX_ROOT}${taskTmp}`
      : taskTmp;
    expect(existsSync(hostTaskTmp)).toBe(false);
  });

  it('预热进程执行一次后销毁，不归还给后续任务复用', async () => {
    const r = await createRunner(1);

    const firstIdlePid = (r as any).idleChildren.values().next().value?.proc?.pid;
    expect(firstIdlePid).toBeTruthy();

    const first = await r.execute({
      code: `def main():
    return {"ok": True}`,
      variables: {}
    });
    expect(first.success).toBe(true);
    expect(first.data?.codeReturn.ok).toBe(true);

    const secondIdlePid = await waitForIdlePid(r, firstIdlePid);
    expect(secondIdlePid).toBeTruthy();
    expect(secondIdlePid).not.toBe(firstIdlePid);

    const second = await r.execute({
      code: `def main():
    return {"ok": True}`,
      variables: {}
    });
    expect(second.success).toBe(true);
    expect(second.data?.codeReturn.ok).toBe(true);
  });

  it('并发超过上限时排队执行', async () => {
    const r = await createRunner(1);

    const p1 = r.execute({
      code: `import time
def main(idx):
    time.sleep(0.2)
    return {"idx": idx}`,
      variables: { idx: 1 }
    });
    const p2 = r.execute({
      code: `def main(idx):
    return {"idx": idx}`,
      variables: { idx: 2 }
    });

    expect(r.stats.queued).toBe(1);
    const results = await Promise.all([p1, p2]);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(results.map((item) => item.data?.codeReturn.idx)).toEqual([1, 2]);
  });

  it('高并发快速任务不会在 stdout drain 前被误判为无结果', async () => {
    const r = await createRunner(20);

    const results = await Promise.all(
      Array.from({ length: 80 }, (_, idx) =>
        r.execute({
          code: `def main(idx):
    return {"idx": idx}`,
          variables: { idx }
        })
      )
    );

    expect(results.every((item) => item.success)).toBe(true);
    expect(results.map((item) => item.data?.codeReturn.idx).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 80 }, (_, idx) => idx)
    );
  });
});

describe('PythonIsolatedRunner 安全回归', () => {
  let runner: PythonIsolatedRunner | undefined;

  afterEach(async () => {
    await runner?.shutdown();
    runner = undefined;
  });

  async function createRunner() {
    runner = new PythonIsolatedRunner(1);
    await runner.init();
    return runner;
  }

  it('阻断 GHSA-5jmh-5f2m-89jg 字符串拼接 __subclasses__ 绕过', async () => {
    const r = await createRunner();

    const result = await r.execute({
      code: `def main():
    base = (1).__class__.__base__
    subs = getattr(base, "__subcl" + "asses__")()
    for c in subs:
        g = getattr(getattr(c, "__init__", None), "__globals__", None)
        if g and "popen" in g:
            return {"result": g["popen"]("id").read()}
    return {"result": "os not found"}`,
      variables: {}
    });

    expect(result.success).toBe(false);
    expect(result.message).not.toMatch(/uid=/);
    expect(result.message).toMatch(/__class__|Dynamic getattr|not allowed/i);
  });

  it('允许 type() 但阻断通过 type().__base__ 继续反射逃逸', async () => {
    const r = await createRunner();

    const result = await r.execute({
      code: `def main():
    base = type(1).__base__
    return {"count": len(getattr(base, "__subclasses__")())}`,
      variables: {}
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/__base__|__subclasses__|not allowed/i);
  });

  it('阻断直接 import os/subprocess', async () => {
    const r = await createRunner();

    const osResult = await r.execute({
      code: `import os
def main():
    return {"cwd": os.getcwd()}`,
      variables: {}
    });
    expect(osResult.success).toBe(false);
    expect(osResult.message).toContain('os');

    const subprocessResult = await r.execute({
      code: `import subprocess
def main():
    return {"out": subprocess.check_output(["id"]).decode()}`,
      variables: {}
    });
    expect(subprocessResult.success).toBe(false);
    expect(subprocessResult.message).toContain('subprocess');
  });
});

describe('PythonIsolatedRunner HTTP 父进程代理', () => {
  let runner: PythonIsolatedRunner | undefined;
  let server: http.Server | undefined;

  afterEach(async () => {
    await runner?.shutdown();
    runner = undefined;
    await new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
      server = undefined;
    });
  });

  async function createRunner() {
    runner = new PythonIsolatedRunner(1);
    await runner.init();
    return runner;
  }

  async function startPublicLocalServer() {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString('utf8');
      });
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ method: req.method, body }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to start test server');
    return address.port;
  }

  it('http_request 通过 Node 代理层执行内网拦截', async () => {
    const port = await startPublicLocalServer();
    const r = await createRunner();

    const result = await r.execute({
      code: `def main():
    try:
        http_request('http://127.0.0.1:${port}/echo', method='POST', body={'hello': 'world'})
        return {'blocked': False}
    except Exception as e:
        return {'blocked': True, 'msg': str(e)}`,
      variables: {}
    });

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.blocked).toBe(true);
    expect(result.data?.codeReturn.msg).toMatch(/private|internal|not allowed/i);
  });

  it('请求次数限制由父进程按单次执行计数', async () => {
    const r = await createRunner();

    const result = await r.execute({
      code: `def main():
    limit_error = None
    for i in range(35):
        try:
            http_request('http://0.0.0.0:1')
        except Exception as e:
            if 'limit' in str(e).lower():
                limit_error = {'idx': i, 'msg': str(e)}
                break
    return {'limit_error': limit_error}`,
      variables: {}
    });

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.limit_error).not.toBeNull();
  });
});
