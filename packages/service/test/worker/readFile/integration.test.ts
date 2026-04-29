import { describe, it, expect, afterAll, vi } from 'vitest';
import path from 'path';
import { existsSync } from 'fs';

/*
 * 真实 spawn 测试：使用 projects/app/worker/readFile.js 构建产物，
 * 通过 WorkerPool 实际启动 Node Worker 线程并解析。
 *
 * 通过 mock getWorker 把 cwd 相对路径换成 build 产物的绝对路径，
 * 这样在 packages/service 下跑 vitest 也能拿到 worker。
 *
 * 若构建产物不存在则跳过整套用例（提示用户先 build）。
 */
const REAL_WORKER_PATH = path.resolve(__dirname, '../../../../../projects/app/worker/readFile.js');

const hasBuiltWorker = existsSync(REAL_WORKER_PATH);

vi.mock('@fastgpt/service/worker/utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/worker/utils')>();
  return {
    ...mod,
    getWorker: (name: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Worker } = require('worker_threads');
      const workerPath =
        name === 'readFile' ? REAL_WORKER_PATH : path.join(process.cwd(), 'worker', `${name}.js`);
      return new Worker(workerPath, { env: mod.getSafeEnv() });
    }
  };
});

const { getWorkerController, WorkerNameEnum } = await import('@fastgpt/service/worker/utils');
const { readRawContentFromBuffer } = await import('@fastgpt/service/worker/function');

const describeIfBuilt = hasBuiltWorker ? describe : describe.skip;

describeIfBuilt('readFile worker (real spawn integration)', () => {
  if (!hasBuiltWorker) {
    // eslint-disable-next-line no-console
    console.warn(
      `[skipped] worker bundle not found at ${REAL_WORKER_PATH}. Run "cd projects/app && pnpm build" first.`
    );
  }

  // 关掉所有真实 worker，避免线程残留拖累其它测试
  afterAll(async () => {
    const pool = (global as any).workerPoll?.[WorkerNameEnum.readFile];
    if (pool?.workerQueue) {
      await Promise.all(
        pool.workerQueue.map(async (item: any) => {
          item.worker.removeAllListeners();
          await item.worker.terminate();
        })
      );
      pool.workerQueue = [];
      pool.waitQueue = [];
    }
  });

  it('解析 txt 文本（真实 worker）', async () => {
    const text = '这是一个测试 hello world\n第二行';
    const result = await readRawContentFromBuffer({
      extension: 'txt',
      encoding: 'utf-8',
      buffer: Buffer.from(text, 'utf-8')
    });

    expect(result.rawText).toBe(text);
  });

  it('解析 md 文本', async () => {
    const md = '# Title\n\nbody paragraph.\n\n- item 1\n- item 2';
    const result = await readRawContentFromBuffer({
      extension: 'md',
      encoding: 'utf-8',
      buffer: Buffer.from(md, 'utf-8')
    });

    expect(result.rawText).toContain('# Title');
    expect(result.rawText).toContain('item 1');
  });

  it('解析 csv', async () => {
    const csv = 'name,age,city\nAlice,30,Beijing\nBob,25,Shanghai';
    const result = await readRawContentFromBuffer({
      extension: 'csv',
      encoding: 'utf-8',
      buffer: Buffer.from(csv, 'utf-8')
    });

    expect(result.rawText).toContain('Alice');
    expect(result.rawText).toContain('30');
    expect(result.rawText).toContain('Shanghai');
  });

  it('未知扩展名应被 reject', async () => {
    await expect(
      readRawContentFromBuffer({
        extension: 'unknown_xyz',
        encoding: 'utf-8',
        buffer: Buffer.from('x')
      })
    ).rejects.toBeTruthy();

    // worker 在 reject 后应仍存活、可继续接任务
    const ok = await readRawContentFromBuffer({
      extension: 'txt',
      encoding: 'utf-8',
      buffer: Buffer.from('still alive', 'utf-8')
    });
    expect(ok.rawText).toBe('still alive');
  });

  it('worker 复用：顺序多次调用累积在同一 worker 上', async () => {
    const pool = (global as any).workerPoll?.[WorkerNameEnum.readFile];
    expect(pool).toBeDefined();

    // 取当前已有 worker 的 baseline（前面 case 已经创建了 1 个）
    const targetWorker = pool.workerQueue.find((w: any) => w.status === 'idle');
    expect(targetWorker).toBeDefined();
    const initialTasks = targetWorker.tasksCompleted;
    const initialQueueLen = pool.workerQueue.length;

    for (let i = 0; i < 5; i++) {
      await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: Buffer.from(`line-${i}`, 'utf-8')
      });
    }

    // 池容量没变（顺序调用不需要新建）
    expect(pool.workerQueue.length).toBe(initialQueueLen);
    // 同一 worker 任务计数 +5
    const sameWorker = pool.workerQueue.find((w: any) => w.id === targetWorker.id);
    expect(sameWorker?.tasksCompleted).toBe(initialTasks + 5);
  });

  it('并发场景：池按上限扩容，所有任务都成功返回', async () => {
    const pool = (global as any).workerPoll?.[WorkerNameEnum.readFile];
    const concurrency = 4;

    const results = await Promise.all(
      Array.from({ length: concurrency }, (_, i) =>
        readRawContentFromBuffer({
          extension: 'txt',
          encoding: 'utf-8',
          buffer: Buffer.from(`payload-${i}`, 'utf-8')
        })
      )
    );

    expect(results).toHaveLength(concurrency);
    results.forEach((r, i) => expect(r.rawText).toBe(`payload-${i}`));

    // 池子大小不应超过 maxReservedThreads（默认 4）
    expect(pool.workerQueue.length).toBeLessThanOrEqual(pool.maxReservedThreads);
  });

  it('maxTasksPerWorker 触发回收：任务数达到阈值后 worker 被销毁', async () => {
    // 用一个独立 name + 临时 pool 走完整生命周期，避免污染 readFile 单例
    const tempPool = getWorkerController<any, any>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      taskTimeoutMs: 30_000,
      maxTasksPerWorker: 3
    });
    // 上面这个调用会命中已缓存的 readFile 单例，不会用我们传的新参数；
    // 因此本测试改成直接验证已存在 pool 的回收逻辑：
    // 把单例 pool 的 maxTasksPerWorker 临时压低到 当前任务数+2，再跑 2 个任务触发回收。
    const pool = (global as any).workerPoll[WorkerNameEnum.readFile];
    const idle = pool.workerQueue.find((w: any) => w.status === 'idle');
    expect(idle).toBeDefined();

    const originalMax = pool.maxTasksPerWorker;
    pool.maxTasksPerWorker = idle.tasksCompleted + 1; // 下一次任务即触发回收
    const targetId = idle.id;

    await readRawContentFromBuffer({
      extension: 'txt',
      encoding: 'utf-8',
      buffer: Buffer.from('recycle me', 'utf-8')
    });

    // 那个被回收的 worker 应该已经从队列里摘除
    expect(pool.workerQueue.find((w: any) => w.id === targetId)).toBeUndefined();

    pool.maxTasksPerWorker = originalMax;
  });

  it('二进制保真：含 0x00 / 0xFF 的字节透传 worker 不丢字节', async () => {
    // 用 csv 这条相对纯文本的路径，但塞入控制字符
    const bytes = new Uint8Array([
      'a'.charCodeAt(0),
      0x00,
      'b'.charCodeAt(0),
      0xff,
      'c'.charCodeAt(0)
    ]);
    const result = await readRawContentFromBuffer({
      extension: 'txt',
      encoding: 'utf-8',
      buffer: Buffer.from(bytes)
    });

    // 至少 a/b/c 被保留（中间的非法字节由 utf-8 decoder 处理，不应使整个解析失败）
    expect(result.rawText).toContain('a');
    expect(result.rawText).toContain('b');
    expect(result.rawText).toContain('c');
  });
});
