import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WorkerPoolLogger } from '@fastgpt/service/worker/utils';

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

const { getSafeEnv, WorkerPool, WorkerNameEnum } = await import('@fastgpt/service/worker/utils');

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
  const pools: Array<WorkerPool<any, any>> = [];

  const createLogger = () =>
    ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }) as unknown as WorkerPoolLogger;

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
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
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

    availableResourceBytes = 100;
    await expect(result).resolves.toEqual({ payload: 'wake' });
    expect(pool.waitQueue).toHaveLength(0);
  });

  it('执行超时销毁 worker 并释放预留资源', async () => {
    const logger = createLogger();
    const pool = createPool<
      { simple: true; payload: string; delayMs: number; resourceBytes: number },
      never
    >({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      taskTimeoutMs: 20,
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
      pool.run({ simple: true, payload: 'slow', delayMs: 100, resourceBytes: 60 })
    ).rejects.toMatchObject({ name: 'WorkerTaskExecutionTimeoutError' });
    expect(pool.reservedResourceBytes).toBe(0);
    expect(pool.workerQueue).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      'Worker task execution timeout',
      expect.objectContaining({ eventName: 'worker.task.execution_timeout' })
    );
  });

  it('延迟物化期间执行超时会 abort source 并释放增长后的软预留', async () => {
    const pool = createPool<{ loadFile: true; resourceBytes: number }, never>({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 1,
      taskTimeoutMs: 20,
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

    await expect(
      pool.run({ loadFile: true, resourceBytes: 10 }, undefined, {
        loadFile: (controller, signal) => {
          handlerSignal = signal;
          controller.updateResourceBytes(60);
          return new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          });
        }
      })
    ).rejects.toMatchObject({ name: 'WorkerTaskExecutionTimeoutError' });
    expect(handlerSignal?.aborted).toBe(true);
    expect(pool.reservedResourceBytes).toBe(0);
    expect(pool.workerQueue).toHaveLength(0);
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
    const pool = createPool<
      { simple: true; payload: string; delayMs: number },
      { payload: string }
    >({
      name: WorkerNameEnum.readFile,
      maxReservedThreads: 3,
      idleWorkerTimeoutMs: 20,
      minIdleWorkers: 1
    });

    await Promise.all(
      ['a', 'b', 'c'].map((payload) => pool.run({ simple: true, payload, delayMs: 20 }))
    );
    expect(pool.workerQueue).toHaveLength(3);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pool.workerQueue).toHaveLength(1);
    expect(pool.workerQueue[0].status).toBe('idle');
  });
});
