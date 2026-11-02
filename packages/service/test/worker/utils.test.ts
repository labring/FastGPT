import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Worker } from 'node:worker_threads';
import { UserConfigError, UserError } from '@fastgpt/global/common/error/utils';
import type { WorkerPool as WorkerPoolType } from '@fastgpt/service/worker/utils';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    MAX_HTML_TRANSFORM_CHARS: 1_000_000,
    XLSX_PARSE_MAX_ROWS: 100_000,
    XLSX_PARSE_MAX_COLUMNS: 1_000,
    XLSX_PARSE_MAX_CELLS: 1_000_000,
    XLSX_PARSE_MAX_MERGED_CELLS: 1_000_000
  }
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mockEnv
}));

const { getSafeEnv, getWorkerController, WorkerPool, WorkerNameEnum, isExpectedWorkerTaskError } =
  await import('@fastgpt/service/worker/utils');

const workerScript = `
const { parentPort } = require('worker_threads');

parentPort.on('message', (message) => {
  const { id } = message;

  if (/^(loadFile|uploadFile)(Result|Error)$/.test(message.type || '')) return;

  if (message.loadFile) {
    parentPort.once('message', (response) => {
      if (response.type === 'loadFileResult') {
        parentPort.postMessage({
          id,
          type: 'success',
          data: {
            bufferSize: response.data.bufferSize,
            firstByte: new Uint8Array(response.data.buffer)[0]
          }
        });
        return;
      }

      parentPort.postMessage({ id, type: 'error', data: response.data });
    });
    parentPort.postMessage({ id, type: 'loadFile', requestId: 'load-1' });
    return;
  }

  if (message.simple) {
    if (message.exit) {
      process.exit(0);
    }
    if (message.protocolError) {
      parentPort.postMessage({ id, type: 'unknown', data: null });
      return;
    }
    setTimeout(() => {
      parentPort.postMessage({
        id,
        type: message.fail ? 'error' : 'success',
        data: message.fail ? 'simple failure' : { payload: message.payload }
      });
    }, message.delayMs || 0);
    return;
  }

  parentPort.once('message', (response) => {
    if (response.type === 'uploadFileResult') {
      parentPort.postMessage({
        id,
        type: 'success',
        data: response.data
      });
      return;
    }

    parentPort.postMessage({
      id,
      type: 'error',
      data: response.data
    });
  });

  parentPort.postMessage({
    id,
    type: 'uploadFile',
    requestId: 'upload-1',
    data: {
      name: 'image.png',
      mime: 'image/png',
      buffer: new Uint8Array([1, 2, 3]).buffer
    }
  });
});
`;

describe('worker/utils getSafeEnv', () => {
  it('将 XLSX 解析限制透传给 worker', () => {
    expect(getSafeEnv()).toMatchObject({
      XLSX_PARSE_MAX_ROWS: '100000',
      XLSX_PARSE_MAX_COLUMNS: '1000',
      XLSX_PARSE_MAX_CELLS: '1000000',
      XLSX_PARSE_MAX_MERGED_CELLS: '1000000'
    });
  });
});

describe('worker/utils WorkerPool', () => {
  let tmpDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  const pools: Array<WorkerPoolType<any, any>> = [];

  const createLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  });

  const createPool = <Props, Response>(
    options: ConstructorParameters<typeof WorkerPool<Props, Response>>[0]
  ) => {
    const pool = new WorkerPool<Props, Response>(options);
    pools.push(pool);
    return pool;
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-worker-test-'));
    fs.mkdirSync(path.join(tmpDir, 'worker'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'worker', 'readFile.js'), workerScript);
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    await Promise.all(
      pools.flatMap((pool) =>
        pool.workerQueue.map(async (item) => {
          clearTimeout(item.timeoutId);
          clearTimeout(item.idleTimeoutId);
          item.worker.removeAllListeners();
          await item.worker.terminate();
        })
      )
    );
    pools.forEach((pool) => {
      clearTimeout(pool.queuePollTimeoutId);
      pool.waitQueue.forEach((task) => clearTimeout(task.queueTimeoutId));
    });
    pools.length = 0;
    if (global.workerPoll) delete global.workerPoll[WorkerNameEnum.workflowBuilderMermaid];
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('复用构建后的线程，运行时保持引用，空闲时释放引用', async () => {
    fs.writeFileSync(path.join(tmpDir, 'worker', 'workflowBuilderMermaid.js'), workerScript);
    const ref = vi.spyOn(Worker.prototype, 'ref');
    const unref = vi.spyOn(Worker.prototype, 'unref');
    const options = {
      name: WorkerNameEnum.workflowBuilderMermaid,
      maxReservedThreads: 1,
      logger: createLogger()
    };
    const pool = getWorkerController<{ simple: true; payload: string }, { payload: string }>(
      options
    );
    pools.push(pool);
    expect(getWorkerController(options)).toBe(pool);

    try {
      for (const payload of ['first', 'second']) {
        await expect(pool.run({ simple: true, payload })).resolves.toEqual({ payload });
      }
      expect(pool.workerQueue).toHaveLength(1);
      expect(ref).toHaveBeenCalledTimes(2);
      expect(unref).toHaveBeenCalledTimes(3);
      expect(pool.workerQueue[0].status).toBe('idle');
    } finally {
      ref.mockRestore();
      unref.mockRestore();
    }
  });

  it('处理 worker 通用 uploadFile 中间事件，不提前结束任务', async () => {
    const pool = createPool<{ payload: string }, { key: string }>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1
    });
    const uploadFile = vi.fn().mockResolvedValue({
      key: 'parsed/image.png'
    });

    const result = await pool.run({ payload: 'run' }, undefined, { uploadFile });

    expect(uploadFile).toHaveBeenCalledWith({
      name: 'image.png',
      mime: 'image/png',
      buffer: expect.any(ArrayBuffer)
    });
    expect(result).toEqual({
      key: 'parsed/image.png'
    });
    expect(pool.workerQueue[0].status).toBe('idle');
  });

  it('uploadFile handler 失败时把错误回传给 worker', async () => {
    const logger = createLogger();
    const pool = createPool<{ payload: string }, { key: string; src: string }>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      logger
    });
    const uploadError = new Error('upload failed');
    const uploadFile = vi.fn().mockRejectedValue(uploadError);

    await expect(pool.run({ payload: 'run' }, undefined, { uploadFile })).rejects.toEqual(
      uploadError
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Worker task failed',
      expect.objectContaining({ eventName: 'worker.task.failed', error: uploadError })
    );
  });

  it.each([
    [
      '外部 DNS 错误',
      Object.assign(new Error('getaddrinfo ENOTFOUND www.lntour.gov.cn'), { code: 'ENOTFOUND' })
    ],
    ['用户业务错误', new UserError('File exceeds maximum allowed size', '文件过大')]
  ])('loadFile handler 遇%s时使用 warn 记录并不掩盖任务失败', async (_name, error) => {
    const logger = createLogger();
    const pool = createPool<{ loadFile: true }, never>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      logger
    });
    const loadFile = vi.fn().mockRejectedValue(error);

    await expect(pool.run({ loadFile: true }, undefined, { loadFile })).rejects.toThrow(
      error.message
    );

    expect(logger.warn).toHaveBeenCalledWith(
      'Worker task failed',
      expect.objectContaining({ eventName: 'worker.task.failed' })
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('loadFile handler 的网络错误不区分任务来源，内部 S3 同样降级为 warn', async () => {
    const logger = createLogger();
    const pool = createPool<{ loadFile: true; sourceKind: 's3' }, never>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      logger
    });
    // 来源不再参与判定：即使任务来自内部 S3，错误形态相同就同样降级，来源相关的处理交给上游
    const s3Error = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:9000'), {
      code: 'ECONNREFUSED'
    });
    const loadFile = vi.fn().mockRejectedValue(s3Error);

    await expect(
      pool.run({ loadFile: true, sourceKind: 's3' }, undefined, { loadFile })
    ).rejects.toThrow('connect ECONNREFUSED 10.0.0.5:9000');

    expect(logger.warn).toHaveBeenCalledWith(
      'Worker task failed',
      expect.objectContaining({ eventName: 'worker.task.failed' })
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([
    [
      '未配置的占位符域名',
      Object.assign(new Error('getaddrinfo ENOTFOUND seedream.example.com'), { code: 'ENOTFOUND' })
    ],
    [
      '完整 URL 中的占位符域名',
      Object.assign(new Error('Failed to download https://seedream.example.com/file'), {
        code: 'ETIMEDOUT'
      })
    ],
    [
      '带展示文案的占位符异常',
      new UserError('getaddrinfo ENOTFOUND seedream.example.com', 'Download failed')
    ],
    [
      'DNS 内存不足',
      Object.assign(new Error('getaddrinfo EAI_MEMORY files.acme.org'), { code: 'EAI_MEMORY' })
    ]
  ])('loadFile handler 遇%s保留 error 记录', async (_name, error) => {
    const logger = createLogger();
    const pool = createPool<{ loadFile: true }, never>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      logger
    });
    const loadFile = vi.fn().mockRejectedValue(error);

    await expect(pool.run({ loadFile: true }, undefined, { loadFile })).rejects.toThrow(
      error.message
    );

    expect(logger.error).toHaveBeenCalledWith(
      'Worker task failed',
      expect.objectContaining({ eventName: 'worker.task.failed' })
    );
    expect(logger.warn).not.toHaveBeenCalledWith('Worker task failed', expect.anything());
  });

  it('预估资源超过单任务安全上限时立即拒绝且不创建 worker', async () => {
    const pool = createPool<{ resourceBytes: number }, never>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 2,
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes: 100,
          maximumTaskResourceBytes: 80
        }),
        queueTimeoutMs: 100
      }
    });

    await expect(pool.run({ resourceBytes: 81 })).rejects.toMatchObject({
      name: 'WorkerTaskResourceLimitError'
    });
    expect(pool.workerQueue).toHaveLength(0);
    expect(pool.waitQueue).toHaveLength(0);
  });

  it('原子预留运行任务资源，完成后释放并唤醒等待任务', async () => {
    type Task = {
      simple: true;
      payload: string;
      delayMs: number;
      resourceBytes: number;
    };
    const pool = createPool<Task, { payload: string }>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 2,
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes: 100,
          maximumTaskResourceBytes: 100
        }),
        queueTimeoutMs: 1000
      }
    });

    const first = pool.run({ simple: true, payload: 'first', delayMs: 40, resourceBytes: 70 });
    const second = pool.run({ simple: true, payload: 'second', delayMs: 1, resourceBytes: 40 });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pool.reservedResourceBytes).toBe(70);
    expect(pool.workerQueue).toHaveLength(1);
    expect(pool.waitQueue).toHaveLength(1);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { payload: 'first' },
      { payload: 'second' }
    ]);
    expect(pool.reservedResourceBytes).toBe(0);
    expect(pool.waitQueue).toHaveLength(0);
  });

  it('队首任务暂时放不下时允许更小的后续任务执行', async () => {
    type Task = {
      simple: true;
      payload: string;
      delayMs: number;
      resourceBytes: number;
    };
    const pool = createPool<Task, { payload: string }>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 2,
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes: 100,
          maximumTaskResourceBytes: 100
        }),
        queueTimeoutMs: 1000
      }
    });

    const running = pool.run({ simple: true, payload: 'running', delayMs: 50, resourceBytes: 60 });
    const large = pool.run({ simple: true, payload: 'large', delayMs: 1, resourceBytes: 50 });
    const small = pool.run({ simple: true, payload: 'small', delayMs: 1, resourceBytes: 30 });

    await expect(small).resolves.toEqual({ payload: 'small' });
    expect(pool.waitQueue).toHaveLength(1);
    expect(pool.waitQueue[0].data.payload).toBe('large');
    await expect(Promise.all([running, large])).resolves.toEqual([
      { payload: 'running' },
      { payload: 'large' }
    ]);
  });

  it('资源持续不足时按配置触发排队超时', async () => {
    const logger = createLogger();
    const pool = createPool<{ resourceBytes: number }, never>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 2,
      logger,
      getTaskType: () => 'doc',
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes: 0,
          maximumTaskResourceBytes: 100,
          memoryDetails: {
            constrainedMemoryBytes: 1000,
            availableMemoryBytes: 200,
            safetyReserveBytes: 200,
            maximumSafeTaskMemoryBytes: 800,
            currentlySchedulableMemoryBytes: 0
          }
        }),
        queueTimeoutMs: 20
      }
    });

    await expect(pool.run({ resourceBytes: 1 })).rejects.toMatchObject({
      name: 'WorkerTaskQueueTimeoutError'
    });
    expect(pool.workerQueue).toHaveLength(0);
    expect(pool.waitQueue).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      'Worker task queue timeout',
      expect.objectContaining({
        eventName: 'worker.task.queue_timeout',
        taskType: 'doc',
        queueLength: 0,
        memoryUsedBytes: 800,
        memoryUsedRatio: 0.8
      })
    );
  });

  it('额外内存准入不满足时继续排队，余量恢复后自动执行', async () => {
    let availableResourceBytes = 0;
    const pool = createPool<{ simple: true; payload: string }, { payload: string }>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      resourcePolicy: {
        getTaskResourceBytes: () => 0,
        getResourceSnapshot: () => ({
          availableResourceBytes,
          maximumTaskResourceBytes: 100
        }),
        canRunTask: ({ resourceSnapshot }) => resourceSnapshot.availableResourceBytes > 0,
        queueTimeoutMs: 1000,
        resourcePollIntervalMs: 5
      }
    });

    const task = pool.run({ simple: true, payload: 'scheduled' });
    expect(pool.waitQueue).toHaveLength(1);
    expect(pool.workerQueue).toHaveLength(0);

    availableResourceBytes = 1;
    await expect(task).resolves.toEqual({ payload: 'scheduled' });
    expect(pool.waitQueue).toHaveLength(0);
  });

  it('等待队列不设置任务数量或预估资源总量上限', async () => {
    const pool = createPool<{ resourceBytes: number }, never>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes: 0,
          maximumTaskResourceBytes: 100
        }),
        queueTimeoutMs: 1000
      }
    });

    const queued = Array.from({ length: 20 }, () =>
      pool.run({ resourceBytes: 100 }).catch(() => undefined)
    );
    expect(pool.waitQueue).toHaveLength(20);
    expect(
      (pool as unknown as { getPoolSnapshot: () => Record<string, number> }).getPoolSnapshot()
    ).toMatchObject({ queuedExecutionResourceBytes: 2000 });
    pool.waitQueue.forEach((task) => clearTimeout(task.queueTimeoutId));
    await Promise.race([Promise.all(queued), Promise.resolve()]);
  });

  it('运行中的外链任务可增长软预留至当前容量以上，并阻止后续任务启动', async () => {
    type Task = { loadFile?: true; simple?: true; payload?: string; resourceBytes: number };
    const pool = createPool<Task, { bufferSize?: number; payload?: string }>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 2,
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes: 100,
          maximumTaskResourceBytes: 200
        }),
        queueTimeoutMs: 1000
      }
    });
    let releaseMaterialize!: () => void;
    const materializeGate = new Promise<void>((resolve) => {
      releaseMaterialize = resolve;
    });
    const loadFile = vi.fn(async (controller: { updateResourceBytes: (bytes: number) => void }) => {
      controller.updateResourceBytes(60);
      controller.updateResourceBytes(120);
      await materializeGate;
      return {
        buffer: new Uint8Array([7]).buffer,
        bufferSize: 1,
        metadata: { extension: 'txt' }
      };
    });

    const running = pool.run({ loadFile: true, resourceBytes: 20 }, undefined, { loadFile });
    await vi.waitFor(() => expect(loadFile).toHaveBeenCalledTimes(1));
    expect(pool.reservedResourceBytes).toBe(120);

    const waiting = pool.run({ simple: true, payload: 'later', resourceBytes: 10 });
    expect(pool.waitQueue).toHaveLength(1);
    expect(pool.workerQueue).toHaveLength(1);

    releaseMaterialize();
    await expect(running).resolves.toEqual({ bufferSize: 1, firstByte: 7 });
    await expect(waiting).resolves.toEqual({ payload: 'later' });
    expect(pool.reservedResourceBytes).toBe(0);
  });

  it('运行时软预留超过永久单任务上限会拒绝并释放最终预留', async () => {
    const pool = createPool<{ loadFile: true; resourceBytes: number }, never>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes: 100,
          maximumTaskResourceBytes: 80
        }),
        queueTimeoutMs: 1000
      }
    });

    await expect(
      pool.run({ loadFile: true, resourceBytes: 20 }, undefined, {
        loadFile: async (controller) => {
          controller.updateResourceBytes(81);
          throw new Error('unreachable');
        }
      })
    ).rejects.toThrow('exceeds the current safe limit');
    expect(pool.reservedResourceBytes).toBe(0);
  });

  it('为每个任务输出可关联的 debug 生命周期和资源快照', async () => {
    const logger = createLogger();
    const pool = createPool<
      { simple: true; payload: string; delayMs: number; resourceBytes: number },
      { payload: string }
    >({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      logger,
      getTaskType: () => 'wps',
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes: 100,
          maximumTaskResourceBytes: 100,
          memoryDetails: {
            constrainedMemoryBytes: 1000,
            availableMemoryBytes: 600,
            safetyReserveBytes: 250,
            maximumSafeTaskMemoryBytes: 750,
            currentlySchedulableMemoryBytes: 350
          }
        }),
        queueTimeoutMs: 1000
      }
    });

    await expect(
      pool.run({ simple: true, payload: 'observed', delayMs: 1, resourceBytes: 40 })
    ).resolves.toEqual({ payload: 'observed' });

    const lifecycleCalls = vi
      .mocked(logger.debug)
      .mock.calls.filter(([, body]) => String(body?.eventName).startsWith('worker.task.'));
    const submitted = lifecycleCalls.find(
      ([, body]) => body?.eventName === 'worker.task.submitted'
    );
    const started = lifecycleCalls.find(([, body]) => body?.eventName === 'worker.task.started');
    const finished = lifecycleCalls.find(([, body]) => body?.eventName === 'worker.task.finished');
    expect(submitted?.[1]).toMatchObject({ taskType: 'wps', memoryUsedBytes: 400 });
    expect(started?.[1].taskId).toBe(submitted?.[1].taskId);
    expect(finished?.[1]).toMatchObject({
      taskId: submitted?.[1].taskId,
      taskType: 'wps',
      outcome: 'success',
      reservedResourceBytes: 0
    });
  });

  it('队列压力只在跨越阈值时 warn，并在排空时输出恢复 info', async () => {
    let availableResourceBytes = 0;
    const logger = createLogger();
    const pool = createPool<
      { simple: true; payload: string; delayMs: number; resourceBytes: number },
      { payload: string }
    >({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      queueWarningThreshold: 1,
      logger,
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes,
          maximumTaskResourceBytes: 100
        }),
        queueTimeoutMs: 1000,
        resourcePollIntervalMs: 5
      }
    });

    const result = pool.run({ simple: true, payload: 'pressure', delayMs: 1, resourceBytes: 10 });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Worker queue reached warning threshold',
      expect.objectContaining({ eventName: 'worker.queue.pressure', queueLength: 1 })
    );

    availableResourceBytes = 100;
    await expect(result).resolves.toEqual({ payload: 'pressure' });
    expect(logger.info).toHaveBeenCalledWith(
      'Worker queue drained',
      expect.objectContaining({ eventName: 'worker.queue.drained', queueEpisodeMaxLength: 1 })
    );
  });

  it('没有 worker 完成事件时也会轮询动态内存并唤醒任务', async () => {
    let availableResourceBytes = 0;
    const pool = createPool<
      { simple: true; payload: string; delayMs: number; resourceBytes: number },
      { payload: string }
    >({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes,
          maximumTaskResourceBytes: 100
        }),
        queueTimeoutMs: 1000,
        resourcePollIntervalMs: 10
      }
    });

    const result = pool.run({ simple: true, payload: 'wake', delayMs: 1, resourceBytes: 50 });
    expect(pool.waitQueue).toHaveLength(1);
    expect(pool.queuePollTimeoutId?.hasRef()).toBe(true);
    expect(pool.waitQueue[0].queueTimeoutId?.hasRef()).toBe(true);

    availableResourceBytes = 100;
    await expect(result).resolves.toEqual({ payload: 'wake' });
    expect(pool.waitQueue).toHaveLength(0);
    expect(pool.queuePollTimeoutId).toBeUndefined();
  });

  it('执行超时销毁 worker 并释放预留资源', async () => {
    vi.useFakeTimers();
    const logger = createLogger();
    const pool = createPool<
      { simple: true; payload: string; delayMs: number; resourceBytes: number },
      never
    >({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      taskTimeoutMs: 1000,
      logger,
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes: 100,
          maximumTaskResourceBytes: 100
        }),
        queueTimeoutMs: 1000
      }
    });

    const taskResult = expect(
      pool.run({ simple: true, payload: 'slow', delayMs: 10_000, resourceBytes: 60 })
    ).rejects.toMatchObject({ name: 'WorkerTaskExecutionTimeoutError' });

    try {
      await vi.advanceTimersByTimeAsync(1000);
      await taskResult;
      expect(pool.reservedResourceBytes).toBe(0);
      expect(pool.workerQueue).toHaveLength(0);
      expect(logger.error).toHaveBeenCalledWith(
        'Worker task execution timeout',
        expect.objectContaining({ eventName: 'worker.task.execution_timeout' })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('延迟物化期间执行超时会 abort source 并释放增长后的软预留', async () => {
    vi.useFakeTimers();
    const pool = createPool<{ loadFile: true; resourceBytes: number }, never>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      taskTimeoutMs: 1000,
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes: 100,
          maximumTaskResourceBytes: 100
        }),
        queueTimeoutMs: 1000
      }
    });
    let handlerSignal: AbortSignal | undefined;
    let markHandlerStarted: (() => void) | undefined;
    const handlerStarted = new Promise<void>((resolve) => {
      markHandlerStarted = resolve;
    });

    const task = pool.run({ loadFile: true, resourceBytes: 10 }, undefined, {
      loadFile: (controller, signal) => {
        handlerSignal = signal;
        controller.updateResourceBytes(60);
        markHandlerStarted?.();
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      }
    });
    const taskResult = expect(task).rejects.toMatchObject({
      name: 'WorkerTaskExecutionTimeoutError'
    });

    try {
      // 先确认 worker 已请求物化，再推进执行计时器，避免把冷启动耗时误当成被测行为。
      await handlerStarted;
      expect(pool.reservedResourceBytes).toBe(60);
      await vi.advanceTimersByTimeAsync(1000);
      await taskResult;
      expect(handlerSignal?.aborted).toBe(true);
      expect(pool.reservedResourceBytes).toBe(0);
      expect(pool.workerQueue).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('worker 提前退出时立即拒绝任务并释放槽位', async () => {
    const logger = createLogger();
    const pool = createPool<
      { simple: true; exit: true; payload: string; resourceBytes: number },
      never
    >({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      taskTimeoutMs: 1000,
      logger,
      resourcePolicy: {
        getTaskResourceBytes: (data) => data.resourceBytes,
        getResourceSnapshot: () => ({
          availableResourceBytes: 100,
          maximumTaskResourceBytes: 100
        }),
        queueTimeoutMs: 1000
      }
    });

    await expect(
      pool.run({ simple: true, exit: true, payload: 'exit', resourceBytes: 40 })
    ).rejects.toThrow('Worker exited unexpectedly');
    expect(pool.reservedResourceBytes).toBe(0);
    expect(pool.workerQueue).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      'Worker exited unexpectedly',
      expect.objectContaining({ eventName: 'worker.thread.exit', exitCode: 0 })
    );
  });

  it('worker 返回未知协议消息时立即拒绝任务', async () => {
    const logger = createLogger();
    const pool = createPool<{ simple: true; protocolError: true }, never>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      logger
    });

    await expect(pool.run({ simple: true, protocolError: true })).rejects.toThrow(
      'Unknown worker response type'
    );
    expect(pool.workerQueue).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      'Worker protocol error',
      expect.objectContaining({ eventName: 'worker.thread.protocol_error' })
    );
  });

  it('回收超过保留数量的空闲 worker，只留下一个 warm worker', async () => {
    vi.useFakeTimers();
    const pool = createPool<
      { simple: true; payload: string; delayMs: number },
      { payload: string }
    >({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 3,
      idleWorkerTimeoutMs: 20,
      minIdleWorkers: 1
    });

    try {
      await Promise.all(
        ['a', 'b', 'c'].map((payload) => pool.run({ simple: true, payload, delayMs: 20 }))
      );
      expect(pool.workerQueue).toHaveLength(3);

      await vi.advanceTimersByTimeAsync(20);
      expect(pool.workerQueue).toHaveLength(1);
      expect(pool.workerQueue[0].status).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('worker/utils isExpectedWorkerTaskError', () => {
  it('正确识别网络和 DNS 故障为预期错误', () => {
    expect(isExpectedWorkerTaskError({ code: 'ENOTFOUND' })).toBe(true);
    expect(isExpectedWorkerTaskError({ code: 'ECONNREFUSED' })).toBe(true);
    expect(isExpectedWorkerTaskError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isExpectedWorkerTaskError({ code: 'ECONNRESET' })).toBe(true);
    expect(isExpectedWorkerTaskError({ code: 'EAI_AGAIN' })).toBe(true);
    expect(isExpectedWorkerTaskError({ code: 'EHOSTUNREACH' })).toBe(true);
    expect(isExpectedWorkerTaskError({ code: 'ENETUNREACH' })).toBe(true);
    expect(isExpectedWorkerTaskError({ code: 'ECONNABORTED' })).toBe(true);
    expect(isExpectedWorkerTaskError({ code: 'ERR_NETWORK' })).toBe(true);
    expect(isExpectedWorkerTaskError({ code: 'ERR_NAME_NOT_RESOLVED' })).toBe(true);
    expect(isExpectedWorkerTaskError(new Error('getaddrinfo ENOTFOUND www.lntour.gov.cn'))).toBe(
      true
    );
    expect(isExpectedWorkerTaskError(new Error('connect ECONNREFUSED 127.0.0.1:80'))).toBe(true);
    expect(isExpectedWorkerTaskError(new Error('file exceeded maximum allowed size'))).toBe(true);
    expect(
      isExpectedWorkerTaskError(new Error('fetch failed', { cause: { code: 'ENOTFOUND' } }))
    ).toBe(true);
    // notexample.com 是正常的外部域名，不应被占位符规则误杀
    expect(isExpectedWorkerTaskError(new Error('getaddrinfo ENOTFOUND notexample.com'))).toBe(true);
  });

  it('占位符域名 example.com 不降级，保留为非预期错误', () => {
    expect(
      isExpectedWorkerTaskError(
        Object.assign(new Error('getaddrinfo ENOTFOUND seedream.example.com'), {
          code: 'ENOTFOUND'
        })
      )
    ).toBe(false);
    expect(
      isExpectedWorkerTaskError(
        Object.assign(new Error('getaddrinfo ENOTFOUND api.example.com'), {
          code: 'ENOTFOUND'
        })
      )
    ).toBe(false);
  });

  it('普通代码异常或内部崩溃不降级', () => {
    expect(isExpectedWorkerTaskError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isExpectedWorkerTaskError(new Error('upload failed'))).toBe(false);
  });

  it.each([
    {
      name: 'message 非字符串但错误码有效',
      error: { message: 123, code: 'ENOTFOUND' },
      expected: true
    },
    {
      name: '包装错误下 cause 的网络错误码',
      error: { code: 'ERR_BAD_RESPONSE', cause: { code: 'ENOTFOUND' } },
      expected: true
    },
    {
      name: 'DNS 内存不足',
      error: { code: 'EAI_MEMORY', message: 'getaddrinfo EAI_MEMORY files.acme.org' },
      expected: false
    },
    {
      name: '未知错误码不受网络文案影响',
      error: { code: 'EAI_MEMORY', message: 'getaddrinfo ENOTFOUND files.acme.org' },
      expected: false
    }
  ])('优先按结构化错误码判断：$name', ({ error, expected }) => {
    expect(isExpectedWorkerTaskError(error)).toBe(expected);
  });

  it.each([
    {
      name: '字符串中的网络错误码',
      error: 'getaddrinfo ENOTFOUND files.acme.org',
      expected: true
    },
    {
      name: '字符串 cause 中的网络错误码',
      error: new Error('fetch failed', { cause: 'connect ECONNRESET files.acme.org' }),
      expected: true
    },
    {
      name: '缺少错误码的 DNS 内存不足',
      error: new Error('getaddrinfo EAI_MEMORY files.acme.org'),
      expected: false
    },
    {
      name: '其他标识符包含网络错误码片段',
      error: new Error('Unexpected SOME_ENOTFOUND_SUFFIX'),
      expected: false
    }
  ])('无结构化错误码时使用有限文案兼容：$name', ({ error, expected }) => {
    expect(isExpectedWorkerTaskError(error)).toBe(expected);
  });

  it('对脏输入不抛错（否则会让任务 Promise 悬挂）', () => {
    // 主线程 handler 可以拒绝任意值；分类器必须安全返回，让失败继续回传给 worker
    expect(() => isExpectedWorkerTaskError({ message: 123 })).not.toThrow();
    expect(isExpectedWorkerTaskError({ message: 123 })).toBe(false);
    expect(isExpectedWorkerTaskError({ message: null, code: 42 })).toBe(false);
    expect(isExpectedWorkerTaskError({ cause: 'not-an-object' })).toBe(false);
    expect(isExpectedWorkerTaskError(123)).toBe(false);
    expect(isExpectedWorkerTaskError(null)).toBe(false);
    expect(isExpectedWorkerTaskError(undefined)).toBe(false);
  });

  it('读取错误属性失败时保守返回非预期错误', () => {
    const error = {
      get message() {
        throw new Error('Cannot read error message');
      }
    };
    expect(isExpectedWorkerTaskError(error)).toBe(false);
  });

  it('占位符保护覆盖 cause 中的域名', () => {
    // cause 参与分类（cause.code），因此 cause 里的占位域名也必须阻断降级
    expect(
      isExpectedWorkerTaskError(
        new Error('fetch failed', {
          cause: { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND seedream.example.com' }
        })
      )
    ).toBe(false);
    expect(
      isExpectedWorkerTaskError(
        new Error('fetch failed', {
          cause: { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND real.example.org' }
        })
      )
    ).toBe(true);
  });

  it('识别 UserError（仅在未跨线程的原始对象上有效）', () => {
    expect(isExpectedWorkerTaskError(new UserError('modelUnExist'))).toBe(true);
    expect(isExpectedWorkerTaskError({ name: 'UserError', message: 'Invalid file' })).toBe(true);
  });

  it('识别 UserConfigError 及其序列化记录', () => {
    const error = new UserConfigError('Invalid file source');

    expect(isExpectedWorkerTaskError(error)).toBe(true);
    expect(isExpectedWorkerTaskError(JSON.parse(JSON.stringify(error)))).toBe(true);
  });
});
