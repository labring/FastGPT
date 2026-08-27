import type { TransferListItem, Worker as NodeWorker } from 'worker_threads';
import { Worker } from 'worker_threads';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { getLogger, LogCategories } from '../common/logger';
import { serviceEnv } from '../env';

type WorkerTaskOutcome =
  | 'success'
  | 'error'
  | 'resource_limit'
  | 'queue_timeout'
  | 'execution_timeout'
  | 'worker_error'
  | 'message_error'
  | 'dispatch_error';

export enum WorkerNameEnum {
  readFile = 'readFile',
  htmlStr2Md = 'htmlStr2Md',
  countGptMessagesTokens = 'countGptMessagesTokens',
  systemPluginRun = 'systemPluginRun',
  text2Chunks = 'text2Chunks'
}

export const getSafeEnv = () => {
  return {
    MAX_HTML_TRANSFORM_CHARS: String(serviceEnv.MAX_HTML_TRANSFORM_CHARS),
    XLSX_PARSE_MAX_ROWS: String(serviceEnv.XLSX_PARSE_MAX_ROWS),
    XLSX_PARSE_MAX_COLUMNS: String(serviceEnv.XLSX_PARSE_MAX_COLUMNS),
    XLSX_PARSE_MAX_CELLS: String(serviceEnv.XLSX_PARSE_MAX_CELLS),
    XLSX_PARSE_MAX_MERGED_CELLS: String(serviceEnv.XLSX_PARSE_MAX_MERGED_CELLS),
    PARSE_FILE_WORKER_MEMORY_LIMIT_MB: String(serviceEnv.PARSE_FILE_WORKER_MEMORY_LIMIT_MB),
    NODE_ENV: process.env.NODE_ENV,
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    NO_PROXY: process.env.NO_PROXY
  };
};

const createNodeWorker = (workerPath: string, name: `${WorkerNameEnum}`) => {
  return new Worker(workerPath, {
    env: getSafeEnv(),
    // 文件解析依赖会构造大量 JS 对象；限制 V8 老生代，XLSX 预检也复用该预算限制解压量。
    resourceLimits:
      name === WorkerNameEnum.readFile
        ? {
            maxOldGenerationSizeMb: serviceEnv.PARSE_FILE_WORKER_MEMORY_LIMIT_MB
          }
        : undefined
  });
};

export const getWorker = (name: `${WorkerNameEnum}`) => {
  const workerPath = path.join(process.cwd(), 'worker', `${name}.js`);
  return createNodeWorker(workerPath, name);
};

export const runWorker = <T = any>(name: WorkerNameEnum, params?: Record<string, any>) => {
  const logger = getLogger(LogCategories.INFRA.WORKER);
  return new Promise<T>((resolve, reject) => {
    const start = Date.now();
    const taskId = randomUUID();
    const worker = getWorker(name);

    logger.debug('Worker task submitted', {
      eventName: 'worker.task.submitted',
      workerName: name,
      taskId,
      taskType: 'default'
    });

    worker.postMessage(params);

    worker.on('message', (msg: { type: 'success' | 'error'; data: any }) => {
      const durationMs = Date.now() - start;
      if (msg.type === 'error') {
        logger.error('Worker task failed', {
          eventName: 'worker.task.failed',
          workerName: name,
          taskId,
          taskType: 'default',
          executionDurationMs: durationMs,
          error: msg.data
        });
        logger.debug('Worker task finished', {
          eventName: 'worker.task.finished',
          workerName: name,
          taskId,
          taskType: 'default',
          executionDurationMs: durationMs,
          outcome: 'error'
        });
        reject(msg.data);
        return;
      }

      resolve(msg.data);
      logger.debug('Worker task finished', {
        eventName: 'worker.task.finished',
        workerName: name,
        taskId,
        taskType: 'default',
        executionDurationMs: durationMs,
        outcome: 'success'
      });
    });

    worker.on('error', (err) => {
      logger.error('Worker thread error', {
        eventName: 'worker.thread.error',
        workerName: name,
        taskId,
        error: err
      });
      reject(err);
      worker.terminate();
    });
    worker.on('messageerror', (err) => {
      logger.error('Worker message error', {
        eventName: 'worker.thread.message_error',
        workerName: name,
        taskId,
        error: err
      });
      reject(err);
      worker.terminate();
    });
  });
};

type WorkerRunTaskType<T> = {
  taskId: string;
  taskType: string;
  data: T;
  transferList?: TransferListItem[];
  handlers?: WorkerRunHandlers;
  resourceBytes: number;
  enqueuedAt: number;
  startedAt?: number;
  queueTimeoutId?: NodeJS.Timeout;
  resolve: (e: any) => void;
  reject: (e: any) => void;
};
export type WorkerUploadFileRequest = {
  name: string;
  mime: string;
  buffer: ArrayBuffer;
};
export type WorkerUploadFileResult = {
  key: string;
};
/**
 * Worker 任务运行期间可发起的通用主线程能力。
 *
 * 这些 handler 只服务当前 run 调用，worker 发送中间事件时不会释放任务槽位；
 * 只有最终 success/error 消息才会完成任务。
 */
export type WorkerRunHandlers = {
  uploadFile?: (data: WorkerUploadFileRequest) => Promise<WorkerUploadFileResult>;
};
type WorkerQueueItem = {
  id: string;
  worker: NodeWorker;
  status: 'running' | 'idle';
  taskTime: number;
  tasksCompleted: number;
  timeoutId?: NodeJS.Timeout;
  idleTimeoutId?: NodeJS.Timeout;
  handlers?: WorkerRunHandlers;
  currentTask?: WorkerRunTaskType<any>;
};
type WorkerResponse<T = any> = {
  id: string;
  type: 'success' | 'error' | 'uploadFile';
  requestId?: string;
  data: T;
};

export type WorkerPoolResourcePolicy<Props> = {
  getTaskResourceBytes: (data: Props) => number;
  getAvailableResourceBytes: () => number;
  getMaximumTaskResourceBytes: () => number;
  queueTimeoutMs: number;
  resourcePollIntervalMs?: number;
  getResourceDetails?: () => {
    constrainedMemoryBytes: number;
    availableMemoryBytes: number;
    safetyReserveBytes: number;
    maximumSafeTaskMemoryBytes: number;
    currentlySchedulableMemoryBytes: number;
  };
};

export type WorkerPoolLogger = Pick<
  ReturnType<typeof getLogger>,
  'debug' | 'info' | 'warn' | 'error'
>;

export class WorkerTaskResourceLimitError extends Error {
  constructor({ requiredBytes, maximumBytes }: { requiredBytes: number; maximumBytes: number }) {
    super(
      `File parsing requires an estimated ${Math.ceil(requiredBytes / 1024 / 1024)} MiB of memory, ` +
        `which exceeds the current safe limit of ${Math.floor(maximumBytes / 1024 / 1024)} MiB. ` +
        'Split the file or increase the service memory limit.'
    );
    this.name = 'WorkerTaskResourceLimitError';
  }
}

export class WorkerTaskQueueTimeoutError extends Error {
  constructor(queueTimeoutMs: number) {
    super(
      `File parsing resources remained busy for ${Math.ceil(queueTimeoutMs / 60_000)} minutes. Try again later.`
    );
    this.name = 'WorkerTaskQueueTimeoutError';
  }
}

export class WorkerTaskExecutionTimeoutError extends Error {
  constructor(taskTimeoutMs: number) {
    super(`Worker task execution timed out after ${Math.ceil(taskTimeoutMs / 1000)} seconds.`);
    this.name = 'WorkerTaskExecutionTimeoutError';
  }
}

/*
  多线程任务管理
  * 全局只需要创建一个示例
  * 可以设置最大线程数；线程或资源不足时任务等待执行，可选空闲回收。
  * 每次执行，会把数据丢到一个空闲线程里运行。主线程需要监听子线程返回的数据，并执行对于的 callback，主要是通过 workerId 进行标记。
  * 务必保证，每个线程只会同时运行 1 个任务，否则 callback 会对应不上。
  * taskTimeoutMs：单任务超时时间，超时会终止 worker 并从队列摘除（避免 hang 住占池）。
  * maxTasksPerWorker：worker 完成多少任务后回收（应对依赖库的内存泄漏，例如 readFile 的 mammoth/xlsx/pdf-parse）。
*/
export class WorkerPool<Props = Record<string, any>, Response = any> {
  name: WorkerNameEnum;
  maxReservedThreads: number;
  taskTimeoutMs: number;
  maxTasksPerWorker: number;
  resourcePolicy?: WorkerPoolResourcePolicy<Props>;
  idleWorkerTimeoutMs?: number;
  minIdleWorkers: number;
  queueWarningThreshold: number;
  getTaskType: (data: Props) => string;
  logger: WorkerPoolLogger;
  reservedResourceBytes = 0;
  queuePollTimeoutId?: NodeJS.Timeout;
  workerQueue: WorkerQueueItem[] = [];
  waitQueue: WorkerRunTaskType<Props>[] = [];
  private queueEpisodeStartedAt?: number;
  private queueEpisodeMaxLength = 0;
  private queueWarningActive = false;

  constructor({
    name,
    maxReservedThreads,
    taskTimeoutMs = 60000,
    maxTasksPerWorker = 1000,
    resourcePolicy,
    idleWorkerTimeoutMs,
    minIdleWorkers = 0,
    queueWarningThreshold = Math.max(1, maxReservedThreads),
    getTaskType = () => 'default',
    logger = getLogger(LogCategories.INFRA.WORKER)
  }: {
    name: WorkerNameEnum;
    maxReservedThreads: number;
    taskTimeoutMs?: number;
    maxTasksPerWorker?: number;
    resourcePolicy?: WorkerPoolResourcePolicy<Props>;
    idleWorkerTimeoutMs?: number;
    minIdleWorkers?: number;
    queueWarningThreshold?: number;
    getTaskType?: (data: Props) => string;
    logger?: WorkerPoolLogger;
  }) {
    this.name = name;
    this.maxReservedThreads = maxReservedThreads;
    this.taskTimeoutMs = taskTimeoutMs;
    this.maxTasksPerWorker = maxTasksPerWorker;
    this.resourcePolicy = resourcePolicy;
    this.idleWorkerTimeoutMs = idleWorkerTimeoutMs;
    this.minIdleWorkers = minIdleWorkers;
    this.queueWarningThreshold = Math.max(1, queueWarningThreshold);
    this.getTaskType = getTaskType;
    this.logger = logger;

    this.logger.info('Worker pool initialized', {
      eventName: 'worker.pool.initialized',
      workerName: this.name,
      maxWorkers: this.maxReservedThreads,
      taskTimeoutMs: this.taskTimeoutMs,
      queueTimeoutMs: this.resourcePolicy?.queueTimeoutMs,
      queueWarningThreshold: this.queueWarningThreshold,
      maxTasksPerWorker: this.maxTasksPerWorker,
      idleWorkerTimeoutMs: this.idleWorkerTimeoutMs,
      minIdleWorkers: this.minIdleWorkers
    });
  }

  /** 返回日志快照；字段名保持稳定，便于 OTel Collector 从 log body 提取并建立告警。 */
  private getPoolSnapshot() {
    const now = Date.now();
    const runningWorkers = this.workerQueue.filter((item) => item.status === 'running').length;
    const availableResourceBytes = this.resourcePolicy?.getAvailableResourceBytes();
    const resourceDetails = this.resourcePolicy?.getResourceDetails?.();

    return {
      queueLength: this.waitQueue.length,
      oldestQueueAgeMs:
        this.waitQueue.length > 0
          ? Math.max(...this.waitQueue.map((task) => now - task.enqueuedAt))
          : 0,
      runningWorkers,
      idleWorkers: this.workerQueue.length - runningWorkers,
      workerCount: this.workerQueue.length,
      maxWorkers: this.maxReservedThreads,
      workerUtilizationRatio:
        this.maxReservedThreads > 0 ? runningWorkers / this.maxReservedThreads : 0,
      reservedResourceBytes: this.reservedResourceBytes,
      resourceAvailableBytes: availableResourceBytes,
      resourceUnreservedBytes:
        availableResourceBytes === undefined
          ? undefined
          : Math.max(0, availableResourceBytes - this.reservedResourceBytes),
      maximumTaskResourceBytes: this.resourcePolicy?.getMaximumTaskResourceBytes(),
      memoryConstrainedBytes: resourceDetails?.constrainedMemoryBytes,
      memoryAvailableBytes: resourceDetails?.availableMemoryBytes,
      memoryUsedBytes: resourceDetails
        ? Math.max(0, resourceDetails.constrainedMemoryBytes - resourceDetails.availableMemoryBytes)
        : undefined,
      memoryUsedRatio:
        resourceDetails && resourceDetails.constrainedMemoryBytes > 0
          ? Math.max(
              0,
              Math.min(
                1,
                (resourceDetails.constrainedMemoryBytes - resourceDetails.availableMemoryBytes) /
                  resourceDetails.constrainedMemoryBytes
              )
            )
          : undefined,
      memorySafetyReserveBytes: resourceDetails?.safetyReserveBytes,
      memorySchedulableBytes: resourceDetails?.currentlySchedulableMemoryBytes
    };
  }

  /** 队列日志按状态变化输出，避免资源轮询时重复刷 warn。 */
  private observeQueueState() {
    const logger = this.logger;
    const queueLength = this.waitQueue.length;

    if (queueLength > 0 && this.queueEpisodeStartedAt === undefined) {
      this.queueEpisodeStartedAt = Date.now();
      this.queueEpisodeMaxLength = queueLength;
      logger.info('Worker queue became active', {
        eventName: 'worker.queue.active',
        workerName: this.name,
        ...this.getPoolSnapshot()
      });
    }

    this.queueEpisodeMaxLength = Math.max(this.queueEpisodeMaxLength, queueLength);
    if (queueLength >= this.queueWarningThreshold && !this.queueWarningActive) {
      this.queueWarningActive = true;
      logger.warn('Worker queue reached warning threshold', {
        eventName: 'worker.queue.pressure',
        workerName: this.name,
        queueWarningThreshold: this.queueWarningThreshold,
        ...this.getPoolSnapshot()
      });
    } else if (queueLength < this.queueWarningThreshold && this.queueWarningActive) {
      this.queueWarningActive = false;
      logger.info('Worker queue recovered below warning threshold', {
        eventName: 'worker.queue.recovered',
        workerName: this.name,
        queueWarningThreshold: this.queueWarningThreshold,
        ...this.getPoolSnapshot()
      });
    }

    if (queueLength === 0 && this.queueEpisodeStartedAt !== undefined) {
      logger.info('Worker queue drained', {
        eventName: 'worker.queue.drained',
        workerName: this.name,
        queueEpisodeDurationMs: Date.now() - this.queueEpisodeStartedAt,
        queueEpisodeMaxLength: this.queueEpisodeMaxLength,
        ...this.getPoolSnapshot()
      });
      this.queueEpisodeStartedAt = undefined;
      this.queueEpisodeMaxLength = 0;
    }
  }

  private getTaskWorkerId(data: Props) {
    if (typeof data !== 'object' || data === null || !('workerId' in data)) return;
    const workerId = data.workerId;
    return typeof workerId === 'string' ? workerId : undefined;
  }

  private hasWorkerCapacity(task: WorkerRunTaskType<Props>) {
    const targetWorkerId = this.getTaskWorkerId(task.data);
    if (targetWorkerId) {
      return this.workerQueue.some((item) => item.id === targetWorkerId && item.status === 'idle');
    }

    return (
      this.workerQueue.some((item) => item.status === 'idle') ||
      this.workerQueue.length < this.maxReservedThreads
    );
  }

  private getWorkerForTask(task: WorkerRunTaskType<Props>) {
    const targetWorkerId = this.getTaskWorkerId(task.data);
    if (targetWorkerId) {
      return this.workerQueue.find((item) => item.id === targetWorkerId && item.status === 'idle');
    }

    return (
      this.workerQueue.find((item) => item.status === 'idle') ??
      (this.workerQueue.length < this.maxReservedThreads ? this.createWorker() : undefined)
    );
  }

  private hasResourceCapacity(task: WorkerRunTaskType<Props>) {
    if (!this.resourcePolicy) return true;

    return (
      task.resourceBytes <=
      Math.max(0, this.resourcePolicy.getAvailableResourceBytes() - this.reservedResourceBytes)
    );
  }

  /** 外部内存释放不会触发 worker 事件，因此等待队列需要低频复查动态可用内存。 */
  private scheduleQueuePoll() {
    if (!this.resourcePolicy || this.waitQueue.length === 0 || this.queuePollTimeoutId) return;

    this.queuePollTimeoutId = setTimeout(() => {
      this.queuePollTimeoutId = undefined;
      this.dispatchTasks();
    }, this.resourcePolicy.resourcePollIntervalMs ?? 1000);
    this.queuePollTimeoutId.unref();
  }

  /**
   * 从等待队列选择最早且当前 CPU、内存都能容纳的任务。
   *
   * 任务的资源预留与 worker 状态切换都在同一同步调用栈中完成，避免多个并发请求观察到同一份余量。
   */
  private dispatchTasks() {
    clearTimeout(this.queuePollTimeoutId);
    this.queuePollTimeoutId = undefined;

    while (true) {
      const taskIndex = this.waitQueue.findIndex(
        (task) => this.hasWorkerCapacity(task) && this.hasResourceCapacity(task)
      );
      if (taskIndex < 0) {
        this.observeQueueState();
        this.scheduleQueuePoll();
        return;
      }

      const task = this.waitQueue.splice(taskIndex, 1)[0];
      clearTimeout(task.queueTimeoutId);
      const queueDurationMs = Date.now() - task.enqueuedAt;

      const workerItem = this.getWorkerForTask(task);
      if (!workerItem) {
        this.waitQueue.splice(taskIndex, 0, task);
        return;
      }

      clearTimeout(workerItem.idleTimeoutId);
      workerItem.idleTimeoutId = undefined;
      workerItem.status = 'running';
      workerItem.taskTime = Date.now();
      task.startedAt = workerItem.taskTime;
      workerItem.handlers = task.handlers;
      workerItem.currentTask = task;
      this.reservedResourceBytes += task.resourceBytes;

      this.logger.debug('Worker task started', {
        eventName: 'worker.task.started',
        workerName: this.name,
        workerId: workerItem.id,
        taskId: task.taskId,
        taskType: task.taskType,
        taskResourceBytes: task.resourceBytes,
        queueDurationMs,
        ...this.getPoolSnapshot()
      });

      workerItem.timeoutId = setTimeout(() => {
        const error = new WorkerTaskExecutionTimeoutError(this.taskTimeoutMs);
        this.logger.error('Worker task execution timeout', {
          eventName: 'worker.task.execution_timeout',
          workerName: this.name,
          workerId: workerItem.id,
          taskId: task.taskId,
          taskType: task.taskType,
          taskResourceBytes: task.resourceBytes,
          executionDurationMs: Date.now() - (task.startedAt ?? Date.now()),
          error,
          ...this.getPoolSnapshot()
        });
        this.deleteWorker(workerItem.id, error, 'execution_timeout');
      }, this.taskTimeoutMs);

      try {
        workerItem.worker.postMessage(
          {
            id: workerItem.id,
            ...task.data
          },
          task.transferList
        );
      } catch (error) {
        this.logger.error('Failed to dispatch worker task', {
          eventName: 'worker.task.dispatch_error',
          workerName: this.name,
          workerId: workerItem.id,
          taskId: task.taskId,
          taskType: task.taskType,
          error,
          ...this.getPoolSnapshot()
        });
        this.deleteWorker(workerItem.id, error, 'dispatch_error');
      }
    }
  }

  /** 提交任务；资源永久不满足时立即拒绝，暂时不足时最多等待 resourcePolicy.queueTimeoutMs。 */
  run(data: Props, transferList?: TransferListItem[], handlers?: WorkerRunHandlers) {
    return new Promise<Response>((resolve, reject) => {
      const taskId = randomUUID();
      const taskType = this.getTaskType(data);
      const enqueuedAt = Date.now();
      const resourceBytes = Math.max(0, this.resourcePolicy?.getTaskResourceBytes(data) ?? 0);
      const maximumResourceBytes =
        this.resourcePolicy?.getMaximumTaskResourceBytes() ?? Number.MAX_SAFE_INTEGER;
      const logger = this.logger;

      logger.debug('Worker task submitted', {
        eventName: 'worker.task.submitted',
        workerName: this.name,
        taskId,
        taskType,
        taskResourceBytes: resourceBytes,
        ...this.getPoolSnapshot()
      });

      if (resourceBytes > maximumResourceBytes) {
        const error = new WorkerTaskResourceLimitError({
          requiredBytes: resourceBytes,
          maximumBytes: maximumResourceBytes
        });
        logger.warn('Worker task rejected by resource limit', {
          eventName: 'worker.task.resource_rejected',
          workerName: this.name,
          taskId,
          taskType,
          taskResourceBytes: resourceBytes,
          error,
          ...this.getPoolSnapshot()
        });
        logger.debug('Worker task finished', {
          eventName: 'worker.task.finished',
          workerName: this.name,
          taskId,
          taskType,
          taskResourceBytes: resourceBytes,
          executionDurationMs: 0,
          outcome: 'resource_limit',
          ...this.getPoolSnapshot()
        });
        reject(error);
        return;
      }

      const task: WorkerRunTaskType<Props> = {
        taskId,
        taskType,
        data,
        transferList,
        handlers,
        resourceBytes,
        enqueuedAt,
        resolve,
        reject
      };

      if (this.resourcePolicy) {
        task.queueTimeoutId = setTimeout(() => {
          const taskIndex = this.waitQueue.indexOf(task);
          if (taskIndex < 0) return;

          this.waitQueue.splice(taskIndex, 1);
          const error = new WorkerTaskQueueTimeoutError(this.resourcePolicy!.queueTimeoutMs);
          const queueDurationMs = Date.now() - task.enqueuedAt;
          logger.error('Worker task queue timeout', {
            eventName: 'worker.task.queue_timeout',
            workerName: this.name,
            taskId,
            taskType,
            taskResourceBytes: resourceBytes,
            queueDurationMs,
            error,
            ...this.getPoolSnapshot()
          });
          logger.debug('Worker task finished', {
            eventName: 'worker.task.finished',
            workerName: this.name,
            taskId,
            taskType,
            taskResourceBytes: resourceBytes,
            queueDurationMs,
            executionDurationMs: 0,
            outcome: 'queue_timeout',
            ...this.getPoolSnapshot()
          });
          reject(error);
          this.dispatchTasks();
        }, this.resourcePolicy.queueTimeoutMs);
        task.queueTimeoutId.unref();
      }

      this.waitQueue.push(task);
      this.dispatchTasks();
      if (this.waitQueue.includes(task)) {
        logger.debug('Worker task queued', {
          eventName: 'worker.task.queued',
          workerName: this.name,
          taskId,
          taskType,
          taskResourceBytes: resourceBytes,
          ...this.getPoolSnapshot()
        });
        this.observeQueueState();
      }
    });
  }

  createWorker() {
    const logger = this.logger;
    // Create a new worker and push it queue.
    const workerId = randomUUID();
    const worker = getWorker(this.name);

    const item: WorkerQueueItem = {
      id: workerId,
      worker,
      status: 'idle',
      taskTime: Date.now(),
      tasksCompleted: 0,
      handlers: undefined
    };
    this.workerQueue.push(item);
    logger.debug('Worker thread created', {
      eventName: 'worker.instance.created',
      workerName: this.name,
      workerId,
      ...this.getPoolSnapshot()
    });

    // watch response
    worker.on('message', ({ id, type, requestId, data }: WorkerResponse<Response>) => {
      if (id !== item.id) return;

      if (type === 'uploadFile') {
        this.handleUploadFileMessage({ item, requestId, data });
        return;
      }

      if (type === 'success') {
        this.completeTask(item, { type: 'success', data });
      } else if (type === 'error') {
        this.completeTask(item, { type: 'error', data });
      }
    });

    // Worker error, terminate and delete it.（Un catch error)
    worker.on('error', (err) => {
      logger.error('Worker thread error', {
        eventName: 'worker.thread.error',
        workerName: this.name,
        workerId,
        taskId: item.currentTask?.taskId,
        taskType: item.currentTask?.taskType,
        error: err,
        ...this.getPoolSnapshot()
      });
      this.deleteWorker(workerId, err, 'worker_error');
    });
    worker.on('messageerror', (err) => {
      logger.error('Worker message error', {
        eventName: 'worker.thread.message_error',
        workerName: this.name,
        workerId,
        taskId: item.currentTask?.taskId,
        taskType: item.currentTask?.taskType,
        error: err,
        ...this.getPoolSnapshot()
      });
      this.deleteWorker(workerId, err, 'message_error');
    });

    return item;
  }

  private completeTask(
    item: WorkerQueueItem,
    result: { type: 'success' | 'error'; data: unknown }
  ) {
    const task = item.currentTask as WorkerRunTaskType<Props> | undefined;
    if (!task) return;

    clearTimeout(item.timeoutId);
    item.timeoutId = undefined;
    item.currentTask = undefined;
    item.handlers = undefined;
    item.tasksCompleted += 1;
    item.status = 'idle';
    this.reservedResourceBytes = Math.max(0, this.reservedResourceBytes - task.resourceBytes);
    const durationMs = Date.now() - (task.startedAt ?? item.taskTime);

    if (result.type === 'error') {
      this.logger.error('Worker task failed', {
        eventName: 'worker.task.failed',
        workerName: this.name,
        workerId: item.id,
        taskId: task.taskId,
        taskType: task.taskType,
        taskResourceBytes: task.resourceBytes,
        executionDurationMs: durationMs,
        error: result.data,
        ...this.getPoolSnapshot()
      });
    }

    this.logger.debug('Worker task finished', {
      eventName: 'worker.task.finished',
      workerName: this.name,
      workerId: item.id,
      taskId: task.taskId,
      taskType: task.taskType,
      taskResourceBytes: task.resourceBytes,
      executionDurationMs: durationMs,
      outcome: result.type,
      ...this.getPoolSnapshot()
    });

    if (result.type === 'success') {
      task.resolve(result.data);
    } else {
      task.reject(result.data);
    }

    if (item.tasksCompleted >= this.maxTasksPerWorker) {
      this.deleteWorker(item.id, undefined, 'max_tasks');
    } else {
      this.scheduleIdleWorkerCleanup(item);
      this.dispatchTasks();
    }
  }

  private scheduleIdleWorkerCleanup(item: WorkerQueueItem) {
    if (!this.idleWorkerTimeoutMs) return;

    item.idleTimeoutId = setTimeout(() => {
      if (item.status !== 'idle') return;

      const idleWorkerCount = this.workerQueue.filter(
        (workerItem) => workerItem.status === 'idle'
      ).length;
      if (idleWorkerCount > this.minIdleWorkers) {
        this.deleteWorker(item.id, undefined, 'idle_timeout');
      }
    }, this.idleWorkerTimeoutMs);
    item.idleTimeoutId.unref();
  }

  private handleUploadFileMessage({
    item,
    requestId,
    data
  }: {
    item: WorkerQueueItem;
    requestId?: string;
    data: any;
  }) {
    const reply = (type: 'uploadFileResult' | 'uploadFileError', payload: any) => {
      if (!this.workerQueue.includes(item) || item.status !== 'running') return;
      try {
        item.worker.postMessage({
          id: item.id,
          type,
          requestId,
          data: payload
        });
      } catch (error) {
        this.logger.error('Failed to reply worker uploadFile request', {
          eventName: 'worker.task.handler_reply_error',
          workerId: item.id,
          workerName: this.name,
          taskId: item.currentTask?.taskId,
          taskType: item.currentTask?.taskType,
          error
        });
      }
    };

    if (!requestId) {
      reply('uploadFileError', 'Missing uploadFile requestId');
      return;
    }

    const handler = item.handlers?.uploadFile;
    if (!handler) {
      reply('uploadFileError', 'Missing uploadFile handler');
      return;
    }

    handler(data)
      .then((result) => reply('uploadFileResult', result))
      .catch((error) => reply('uploadFileError', error));
  }

  private deleteWorker(
    workerId: string,
    error: unknown = new Error('Worker terminated'),
    reason: WorkerTaskOutcome | 'idle_timeout' | 'max_tasks' | 'terminated' = 'terminated'
  ) {
    const item = this.workerQueue.find((item) => item.id === workerId);
    this.workerQueue = this.workerQueue.filter((item) => item.id !== workerId);
    if (item) {
      clearTimeout(item.timeoutId);
      clearTimeout(item.idleTimeoutId);
      const task = item.currentTask as WorkerRunTaskType<Props> | undefined;
      if (task) {
        item.currentTask = undefined;
        this.reservedResourceBytes = Math.max(0, this.reservedResourceBytes - task.resourceBytes);
        const outcome: WorkerTaskOutcome =
          reason === 'idle_timeout' || reason === 'max_tasks' || reason === 'terminated'
            ? 'worker_error'
            : reason;
        const durationMs = Date.now() - (task.startedAt ?? item.taskTime);
        this.logger.debug('Worker task finished', {
          eventName: 'worker.task.finished',
          workerName: this.name,
          workerId: item.id,
          taskId: task.taskId,
          taskType: task.taskType,
          taskResourceBytes: task.resourceBytes,
          executionDurationMs: durationMs,
          outcome,
          ...this.getPoolSnapshot()
        });
        task.reject(error);
      }
      item.handlers = undefined;
      item.worker.removeAllListeners();
      void item.worker.terminate();
      this.logger.debug('Worker thread deleted', {
        eventName: 'worker.instance.deleted',
        workerName: this.name,
        workerId,
        reason,
        ...this.getPoolSnapshot()
      });
    }

    this.dispatchTasks();
  }
}

export const getWorkerController = <Props, Response>(props: {
  name: WorkerNameEnum;
  maxReservedThreads: number;
  taskTimeoutMs?: number;
  maxTasksPerWorker?: number;
  resourcePolicy?: WorkerPoolResourcePolicy<Props>;
  idleWorkerTimeoutMs?: number;
  minIdleWorkers?: number;
  queueWarningThreshold?: number;
  getTaskType?: (data: Props) => string;
  logger?: WorkerPoolLogger;
}) => {
  if (!global.workerPoll) {
    // @ts-ignore
    global.workerPoll = {};
  }

  const name = props.name;

  if (global.workerPoll[name]) return global.workerPoll[name] as WorkerPool<Props, Response>;

  global.workerPoll[name] = new WorkerPool(props);

  return global.workerPoll[name] as WorkerPool<Props, Response>;
};
