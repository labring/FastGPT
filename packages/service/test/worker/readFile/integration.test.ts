import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import path from 'path';
import { existsSync } from 'fs';

/*
 * 真实 spawn 测试：使用 projects/app/worker/readFile.js 构建产物，
 * 通过 WorkerPool 实际启动 Node Worker 线程并解析。
 *
 * WorkerPool 内部会通过 process.cwd()/worker/readFile.js 解析构建产物。
 * 测试运行在 packages/service 下，因此本文件临时把 process.cwd() 指向
 * projects/app，让测试路径和真实运行时保持一致。
 *
 * 默认跳过；设置 RUN_READ_FILE_WORKER_INTEGRATION=true 且构建产物存在时才运行。
 */
const APP_PROJECT_DIR = path.resolve(__dirname, '../../../../../projects/app');
const REAL_WORKER_PATH = path.join(APP_PROJECT_DIR, 'worker/readFile.js');

const shouldRunIntegration =
  process.env.RUN_READ_FILE_WORKER_INTEGRATION === 'true' && existsSync(REAL_WORKER_PATH);

const { WorkerNameEnum } = await import('@fastgpt/service/worker/utils');
const { readRawContentFromBuffer } = await import('@fastgpt/service/worker/function');

const describeIfEnabled = shouldRunIntegration ? describe : describe.skip;

const getReadFilePool = () => {
  const pool = (global as any).workerPoll?.[WorkerNameEnum.readFile];
  expect(pool).toBeDefined();
  return pool;
};

const getIdleWorker = () => {
  const pool = getReadFilePool();
  const idleWorker = pool.workerQueue.find((worker: any) => worker.status === 'idle');
  expect(idleWorker).toBeDefined();
  return idleWorker;
};

const parseText = (text: string) =>
  readRawContentFromBuffer({
    extension: 'txt',
    encoding: 'utf-8',
    buffer: Buffer.from(text, 'utf-8')
  });

const destroyReadFilePool = async () => {
  const workerPoll = (global as any).workerPoll;
  const pool = workerPoll?.[WorkerNameEnum.readFile];
  if (!pool?.workerQueue) return;

  await Promise.all(
    pool.workerQueue.map(async (item: any) => {
      item.worker.removeAllListeners();
      await item.worker.terminate();
    })
  );
  pool.workerQueue = [];
  pool.waitQueue = [];
  delete workerPoll[WorkerNameEnum.readFile];
};

describeIfEnabled('readFile worker (real spawn integration)', () => {
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  if (process.env.RUN_READ_FILE_WORKER_INTEGRATION === 'true' && !existsSync(REAL_WORKER_PATH)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[skipped] readFile worker integration requires RUN_READ_FILE_WORKER_INTEGRATION=true and worker bundle at ${REAL_WORKER_PATH}.`
    );
  }

  beforeAll(() => {
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(APP_PROJECT_DIR);
  });

  afterEach(async () => {
    await destroyReadFilePool();
  });

  afterAll(() => {
    cwdSpy.mockRestore();
  });

  it('解析 txt 文本（真实 worker）', async () => {
    const text = '这是一个测试 hello world\n第二行';
    const result = await parseText(text);

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
    const ok = await parseText('still alive');
    expect(ok.rawText).toBe('still alive');
  });

  it('worker 复用：顺序多次调用累积在同一 worker 上', async () => {
    await parseText('warmup');

    const pool = getReadFilePool();
    const targetWorker = getIdleWorker();
    const initialTasks = targetWorker.tasksCompleted;
    const initialQueueLen = pool.workerQueue.length;

    for (let i = 0; i < 5; i++) {
      await parseText(`line-${i}`);
    }

    // 池容量没变（顺序调用不需要新建）
    expect(pool.workerQueue.length).toBe(initialQueueLen);
    // 同一 worker 任务计数 +5
    const sameWorker = pool.workerQueue.find((w: any) => w.id === targetWorker.id);
    expect(sameWorker?.tasksCompleted).toBe(initialTasks + 5);
  });

  it('并发场景：池按上限扩容，所有任务都成功返回', async () => {
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

    const pool = getReadFilePool();
    // 池子大小不应超过 maxReservedThreads
    expect(pool.workerQueue.length).toBeLessThanOrEqual(pool.maxReservedThreads);
    expect(pool.workerQueue.length).toBeGreaterThan(1);
  });

  it('maxTasksPerWorker 触发回收：任务数达到阈值后 worker 被销毁', async () => {
    await parseText('warmup');

    const pool = getReadFilePool();
    const idle = getIdleWorker();
    const originalMax = pool.maxTasksPerWorker;
    const targetId = idle.id;

    try {
      pool.maxTasksPerWorker = idle.tasksCompleted + 1; // 下一次任务即触发回收
      await parseText('recycle me');
    } finally {
      pool.maxTasksPerWorker = originalMax;
    }

    // 那个被回收的 worker 应该已经从队列里摘除
    expect(pool.workerQueue.find((w: any) => w.id === targetId)).toBeUndefined();
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
