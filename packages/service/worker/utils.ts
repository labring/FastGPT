import type { TransferListItem, Worker as NodeWorker } from 'worker_threads';
import { Worker } from 'worker_threads';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { getLogger, LogCategories } from '../common/logger';
import { serviceEnv } from '../env';
import { UserError } from '@fastgpt/global/common/error/utils';

type WorkerTaskOutcome =
  | 'success'
  | 'error'
  | 'resource_limit'
  | 'queue_timeout'
  | 'execution_timeout'
  | 'worker_error'
  | 'message_error'
  | 'protocol_error'
  | 'dispatch_error';

export enum WorkerNameEnum {
  readFile = 'readFile',
  htmlStr2Md = 'htmlStr2Md',
  countGptMessagesTokens = 'countGptMessagesTokens',
  systemPluginRun = 'systemPluginRun',
  text2Chunks = 'text2Chunks',
  workflowBuilderMermaid = 'workflowBuilderMermaid'
}

export const getSafeEnv = () => {
  return {
    MAX_HTML_TRANSFORM_CHARS: String(serviceEnv.MAX_HTML_TRANSFORM_CHARS),
    XLSX_PARSE_MAX_ROWS: String(serviceEnv.XLSX_PARSE_MAX_ROWS),
    XLSX_PARSE_MAX_COLUMNS: String(serviceEnv.XLSX_PARSE_MAX_COLUMNS),
    XLSX_PARSE_MAX_CELLS: String(serviceEnv.XLSX_PARSE_MAX_CELLS),
    XLSX_PARSE_MAX_MERGED_CELLS: String(serviceEnv.XLSX_PARSE_MAX_MERGED_CELLS),
    NODE_ENV: process.env.NODE_ENV,
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    NO_PROXY: process.env.NO_PROXY
  };
};

const createNodeWorker = (workerPath: string) => {
  return new Worker(workerPath, {
    env: getSafeEnv()
  });
};

export const getWorker = (name: `${WorkerNameEnum}`) => {
  const workerPath = path.join(process.cwd(), 'worker', `${name}.js`);
  return createNodeWorker(workerPath);
};

type WorkerTaskLogContext = {
  taskId: string;
  taskType: string;
  resourceBytes: number;
};

type WorkerRunTaskType<T> = WorkerTaskLogContext & {
  data: T;
  transferList?: TransferListItem[];
  handlers?: WorkerRunHandlers;
  enqueuedAt: number;
  startedAt?: number;
  queueTimeoutId?: NodeJS.Timeout;
  abortController?: AbortController;
  lastLoggedResourceBytes: number;
  /**
   * 主线程在失败发生处（此时错误尚未跨线程、仍是原始对象）判定的预期任务错误。
   * 只用主线程状态传递，不放进 worker 消息：结构化克隆会把自定义 Error 压平成普通 Error。
   */
  expectedTaskError?: boolean;
  resolve: (e: any) => void;
  reject: (e: any) => void;
};
const WORKER_RESOURCE_LOG_STEP_BYTES = 16 * 1024 * 1024;
export type WorkerUploadFileRequest = {
  name: string;
  mime: string;
  buffer: ArrayBuffer;
};
export type WorkerUploadFileResult = {
  key: string;
};
export type WorkerLoadFileResult = {
  buffer: ArrayBuffer;
  bufferSize: number;
  metadata: {
    filename?: string;
    contentType?: string;
    extension?: string;
    encoding?: string;
  };
};
export type WorkerTaskResourceController = {
  /** 单调更新运行任务的软预留；只执行永久硬上限检查，不检查当前动态可用内存。 */
  updateResourceBytes: (requiredBytes: number) => void;
};
/**
 * Worker 任务运行期间可发起的通用主线程能力。
 *
 * 这些 handler 只服务当前 run 调用，worker 发送中间事件时不会释放任务槽位；
 * 只有最终 success/error 消息才会完成任务。
 */
export type WorkerRunHandlers = {
  uploadFile?: (data: WorkerUploadFileRequest) => Promise<WorkerUploadFileResult>;
  loadFile?: (
    controller: WorkerTaskResourceController,
    signal: AbortSignal
  ) => Promise<WorkerLoadFileResult>;
};
type WorkerQueueItem<Props = Record<string, any>> = {
  id: string;
  worker: NodeWorker;
  status: 'running' | 'idle';
  taskTime: number;
  tasksCompleted: number;
  timeoutId?: NodeJS.Timeout;
  idleTimeoutId?: NodeJS.Timeout;
  handlers?: WorkerRunHandlers;
  currentTask?: WorkerRunTaskType<Props>;
};
type WorkerResponse<T = any> = {
  id: string;
  type: string;
  requestId?: string;
  data: T;
};

type WorkerPoolMemoryDetails = {
  constrainedMemoryBytes: number;
  availableMemoryBytes: number;
  safetyReserveBytes: number;
  maximumSafeTaskMemoryBytes: number;
  currentlySchedulableMemoryBytes: number;
};

export type WorkerPoolResourceSnapshot = {
  availableResourceBytes: number;
  maximumTaskResourceBytes: number;
  memoryDetails?: WorkerPoolMemoryDetails;
};

export type WorkerPoolResourcePolicy<Props> = {
  getTaskResourceBytes: (data: Props) => number; // 估算任务所需资源（字节），用于准入检查和运行期间的资源预留
  getResourceSnapshot: () => WorkerPoolResourceSnapshot; // 读取当前可用资源、单任务资源上限及可选的内存日志明细
  canRunTask?: (props: { data: Props; resourceSnapshot: WorkerPoolResourceSnapshot }) => boolean; // 额外的资源准入条件，返回 false 时继续排队
  queueTimeoutMs: number; // 排队超时（毫秒），超时拒绝任务；任务开始执行后停止排队计时
  resourcePollIntervalMs?: number; // 排队期间复查资源余量的间隔（毫秒），默认 1000
};

export type WorkerPoolLogger = Pick<
  ReturnType<typeof getLogger>,
  'debug' | 'info' | 'warn' | 'error'
>;

export class WorkerTaskResourceLimitError extends Error {
  constructor({ requiredBytes, maximumBytes }: { requiredBytes: number; maximumBytes: number }) {
    super(
      `Worker task requires an estimated ${Math.ceil(requiredBytes / 1024 / 1024)} MiB of resources, ` +
        `which exceeds the current safe limit of ${Math.floor(maximumBytes / 1024 / 1024)} MiB. ` +
        'Reduce the task size or increase the service resource limit.'
    );
    this.name = 'WorkerTaskResourceLimitError';
  }
}

export class WorkerTaskQueueTimeoutError extends Error {
  constructor(queueTimeoutMs: number) {
    super(
      `Worker resources remained busy for ${Math.ceil(queueTimeoutMs / 60_000)} minutes. Try again later.`
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

const WORKER_NETWORK_ERROR_CODES = [
  'ENOTFOUND',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ECONNABORTED',
  'ERR_NETWORK',
  'ERR_NAME_NOT_RESOLVED'
];

const WORKER_PLACEHOLDER_DOMAIN_PATTERN = /(?:^|[^a-zA-Z0-9-])example\.com(?=$|[^a-zA-Z0-9-])/i;
const WORKER_NETWORK_ERROR_PATTERN = new RegExp(
  `\\b(?:${WORKER_NETWORK_ERROR_CODES.join('|')})\\b`
);

/**
 * 校验 Worker 任务执行错误是否属于预期的网络/DNS 故障或用户业务异常。
 *
 * 只在**主线程发生失败的位置**调用（此时拿到的是未跨线程的原始错误对象，`instanceof` 与自定义字段都有效），
 * 判定结果记录到 task 上供 completeTask 使用。不要对跨线程克隆后的对象调用：
 * 结构化克隆会把 `UserError` 压平成 `name: 'Error'` 的普通 Error。
 *
 * 网络/DNS 故障（ENOTFOUND、ECONNREFUSED 等）允许降级为 warn，不区分任务来源。
 * 先检查原始消息中的配置占位符，再识别 UserError 和本层/cause 的错误码；
 * 仅在缺少错误码时兼容明确的错误码文案与旧版文件超限错误，未知错误保留 error。
 *
 * 该函数必须对任意输入安全返回，读取错误属性失败时保守地保留 error，
 * 避免分类异常中断 loadFileError 回传，使任务只能等待执行超时。
 */
export const isExpectedWorkerTaskError = (error: unknown): boolean => {
  try {
    /** 只读取分类所需的原始字段，避免展示文案或 URL 脱敏改变错误含义。 */
    const getErrorDetails = (value: unknown) => {
      const isObject = typeof value === 'object' && value !== null;
      return {
        code: isObject && 'code' in value && typeof value.code === 'string' ? value.code : '',
        name: isObject && 'name' in value && typeof value.name === 'string' ? value.name : '',
        message:
          typeof value === 'string'
            ? value
            : isObject && 'message' in value && typeof value.message === 'string'
              ? value.message
              : '',
        cause: isObject && 'cause' in value ? value.cause : undefined
      };
    };
    const current = getErrorDetails(error);
    const cause = getErrorDetails(current.cause);
    const messages = [current.message, cause.message];

    // 占位符检查必须覆盖参与分类的 cause，否则 cause 里的占位域名会被误降级
    if (messages.some((message) => WORKER_PLACEHOLDER_DOMAIN_PATTERN.test(message))) {
      return false;
    }

    if (error instanceof UserError || current.name === 'UserError') return true;

    // 错误码优先于文案：getaddrinfo 的 EAI_MEMORY 等基础设施故障不能因文本相似而降级。
    const codes = [current.code, cause.code].filter(Boolean);
    if (codes.length > 0) {
      return codes.some((code) => WORKER_NETWORK_ERROR_CODES.includes(code));
    }

    // 兼容只保留消息的旧错误；按完整错误码匹配，避免误认其他标识符中的片段。
    return messages.some(
      (message) =>
        WORKER_NETWORK_ERROR_PATTERN.test(message) || message.includes('maximum allowed size')
    );
  } catch {
    // 分类失败时保守地按未知异常处理（保持 error 级别）
    return false;
  }
};

/*
  多线程任务管理
  * 全局只需要创建一个示例
  * 可以设置最大线程数；线程或资源不足时任务等待执行，可选空闲回收。
  * 每次执行，会把数据丢到一个空闲线程里运行。主线程需要监听子线程返回的数据，并执行对于的 callback，主要是通过 workerId 进行标记。
  * 务必保证，每个线程只会同时运行 1 个任务，否则 callback 会对应不上。
  * taskTimeoutMs：单任务超时时间，超时会终止 worker 并从队列摘除（避免 hang 住占池）。
  * maxTasksPerWorker：worker 完成多少任务后回收（应对依赖库的内存泄漏，例如 readFile 的 mammoth/xlsx/pdf-parse）。
  * 空闲线程不阻止进程退出；运行和排队任务保持进程存活，线程仍按原有策略复用和回收。
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
  workerQueue: WorkerQueueItem<Props>[] = [];
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
    name: WorkerNameEnum; // Worker 类型，对应 worker/<name>.js 线程入口
    maxReservedThreads: number; // 池内线程数量上限，达到上限且没有空闲线程时排队
    taskTimeoutMs?: number; // 单任务执行超时（毫秒），默认 60000，从派发时计时，超时终止线程
    maxTasksPerWorker?: number; // 单线程完成任务数上限，默认 1000，达到后回收线程
    resourcePolicy?: WorkerPoolResourcePolicy<Props>; // 资源准入和排队超时策略，未配置时仅按线程容量调度
    idleWorkerTimeoutMs?: number; // 空闲回收等待时间（毫秒），未配置或为 0 时不按空闲时长回收
    minIdleWorkers?: number; // 空闲回收时保留的线程数，默认 0，不会主动创建线程
    queueWarningThreshold?: number; // 排队告警阈值，默认取线程上限且至少为 1，仅告警、不限制排队
    getTaskType?: (data: Props) => string; // 提取日志中的任务类型，默认返回 'default'
    logger?: WorkerPoolLogger; // 日志记录器，默认使用 INFRA.WORKER 分类
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
  private getPoolSnapshot(resourceSnapshot = this.resourcePolicy?.getResourceSnapshot()) {
    const now = Date.now();
    const runningWorkers = this.workerQueue.filter((item) => item.status === 'running').length;
    const availableResourceBytes = resourceSnapshot?.availableResourceBytes;
    const memoryDetails = resourceSnapshot?.memoryDetails;
    let oldestQueueAgeMs = 0;
    let queuedExecutionResourceBytes = 0;
    for (const task of this.waitQueue) {
      oldestQueueAgeMs = Math.max(oldestQueueAgeMs, now - task.enqueuedAt);
      queuedExecutionResourceBytes += task.resourceBytes;
    }

    return {
      queueLength: this.waitQueue.length,
      oldestQueueAgeMs,
      queuedExecutionResourceBytes,
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
      maximumTaskResourceBytes: resourceSnapshot?.maximumTaskResourceBytes,
      memoryConstrainedBytes: memoryDetails?.constrainedMemoryBytes,
      memoryAvailableBytes: memoryDetails?.availableMemoryBytes,
      memoryUsedBytes: memoryDetails
        ? Math.max(0, memoryDetails.constrainedMemoryBytes - memoryDetails.availableMemoryBytes)
        : undefined,
      memoryUsedRatio:
        memoryDetails && memoryDetails.constrainedMemoryBytes > 0
          ? Math.max(
              0,
              Math.min(
                1,
                (memoryDetails.constrainedMemoryBytes - memoryDetails.availableMemoryBytes) /
                  memoryDetails.constrainedMemoryBytes
              )
            )
          : undefined,
      memorySafetyReserveBytes: memoryDetails?.safetyReserveBytes,
      memorySchedulableBytes: memoryDetails?.currentlySchedulableMemoryBytes
    };
  }

  /** 统一输出任务终态字段，保证正常、拒绝、超时和线程异常可使用同一套日志查询。 */
  private logTaskFinished({
    task,
    outcome,
    workerId,
    queueDurationMs,
    executionDurationMs,
    resourceSnapshot
  }: {
    task: WorkerTaskLogContext;
    outcome: WorkerTaskOutcome;
    workerId?: string;
    queueDurationMs?: number;
    executionDurationMs: number;
    resourceSnapshot?: WorkerPoolResourceSnapshot;
  }) {
    this.logger.debug('Worker task finished', {
      eventName: 'worker.task.finished',
      workerName: this.name,
      workerId,
      taskId: task.taskId,
      taskType: task.taskType,
      taskResourceBytes: task.resourceBytes,
      queueDurationMs,
      executionDurationMs,
      outcome,
      ...this.getPoolSnapshot(resourceSnapshot)
    });
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

  private hasWorkerCapacity(task: Pick<WorkerRunTaskType<Props>, 'data'>) {
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

  private hasResourceCapacity(
    task: Pick<WorkerRunTaskType<Props>, 'data' | 'resourceBytes'>,
    resourceSnapshot?: WorkerPoolResourceSnapshot
  ) {
    if (!this.resourcePolicy) return true;

    const currentResourceSnapshot = resourceSnapshot ?? this.resourcePolicy.getResourceSnapshot();
    if (
      this.resourcePolicy.canRunTask &&
      !this.resourcePolicy.canRunTask({
        data: task.data,
        resourceSnapshot: currentResourceSnapshot
      })
    ) {
      return false;
    }

    return (
      task.resourceBytes <=
      Math.max(0, currentResourceSnapshot.availableResourceBytes - this.reservedResourceBytes)
    );
  }

  /** 外部内存释放不会触发 worker 事件；有排队任务时保持进程存活并低频复查动态余量。 */
  private scheduleQueuePoll() {
    if (!this.resourcePolicy || this.waitQueue.length === 0 || this.queuePollTimeoutId) return;

    this.queuePollTimeoutId = setTimeout(() => {
      this.queuePollTimeoutId = undefined;
      this.dispatchTasks();
    }, this.resourcePolicy.resourcePollIntervalMs ?? 1000);
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
      const resourceSnapshot = this.resourcePolicy?.getResourceSnapshot();
      const taskIndex = this.waitQueue.findIndex(
        (task) => this.hasWorkerCapacity(task) && this.hasResourceCapacity(task, resourceSnapshot)
      );
      if (taskIndex < 0) {
        this.observeQueueState();
        this.scheduleQueuePoll();
        return;
      }

      const task = this.waitQueue.splice(taskIndex, 1)[0];
      const queueDurationMs = Date.now() - task.enqueuedAt;

      let workerItem: WorkerQueueItem<Props> | undefined;
      try {
        workerItem = this.getWorkerForTask(task);
      } catch (error) {
        clearTimeout(task.queueTimeoutId);
        this.logger.error('Failed to create worker for task', {
          eventName: 'worker.instance.create_error',
          workerName: this.name,
          taskId: task.taskId,
          taskType: task.taskType,
          error,
          ...this.getPoolSnapshot(resourceSnapshot)
        });
        this.logTaskFinished({
          task,
          outcome: 'dispatch_error',
          queueDurationMs,
          executionDurationMs: 0,
          resourceSnapshot
        });
        task.reject(error);
        continue;
      }
      if (!workerItem) {
        this.waitQueue.splice(taskIndex, 0, task);
        this.observeQueueState();
        this.scheduleQueuePoll();
        return;
      }
      clearTimeout(task.queueTimeoutId);

      clearTimeout(workerItem.idleTimeoutId);
      workerItem.idleTimeoutId = undefined;
      workerItem.status = 'running';
      workerItem.worker.ref();
      workerItem.taskTime = Date.now();
      task.startedAt = workerItem.taskTime;
      task.abortController = new AbortController();
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
        ...this.getPoolSnapshot(resourceSnapshot)
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

  /** 提交任务；配置资源策略时检查资源准入和排队超时，执行超时从任务派发时开始计时。 */
  run(data: Props, transferList?: TransferListItem[], handlers?: WorkerRunHandlers) {
    return new Promise<Response>((resolve, reject) => {
      const taskId = randomUUID();
      const taskType = this.getTaskType(data);
      const enqueuedAt = Date.now();
      const resourceBytes = Math.max(0, this.resourcePolicy?.getTaskResourceBytes(data) ?? 0);
      const resourceSnapshot = this.resourcePolicy?.getResourceSnapshot();
      const maximumResourceBytes =
        resourceSnapshot?.maximumTaskResourceBytes ?? Number.MAX_SAFE_INTEGER;
      const logger = this.logger;
      const taskLogContext: WorkerTaskLogContext = { taskId, taskType, resourceBytes };

      logger.debug('Worker task submitted', {
        eventName: 'worker.task.submitted',
        workerName: this.name,
        taskId,
        taskType,
        taskResourceBytes: resourceBytes,
        ...this.getPoolSnapshot(resourceSnapshot)
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
          ...this.getPoolSnapshot(resourceSnapshot)
        });
        this.logTaskFinished({
          task: taskLogContext,
          outcome: 'resource_limit',
          executionDurationMs: 0,
          resourceSnapshot
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
        lastLoggedResourceBytes: resourceBytes,
        enqueuedAt,
        resolve,
        reject
      };

      if (this.resourcePolicy) {
        const queueTimeoutMs = this.resourcePolicy.queueTimeoutMs;
        task.queueTimeoutId = setTimeout(() => {
          const taskIndex = this.waitQueue.indexOf(task);
          if (taskIndex < 0) return;

          this.waitQueue.splice(taskIndex, 1);
          const error = new WorkerTaskQueueTimeoutError(queueTimeoutMs);
          const queueDurationMs = Date.now() - task.enqueuedAt;
          const resourceSnapshot = this.resourcePolicy?.getResourceSnapshot();
          logger.error('Worker task queue timeout', {
            eventName: 'worker.task.queue_timeout',
            workerName: this.name,
            taskId,
            taskType,
            taskResourceBytes: resourceBytes,
            queueDurationMs,
            error,
            ...this.getPoolSnapshot(resourceSnapshot)
          });
          this.logTaskFinished({
            task,
            outcome: 'queue_timeout',
            queueDurationMs,
            executionDurationMs: 0,
            resourceSnapshot
          });
          reject(error);
          this.dispatchTasks();
        }, queueTimeoutMs);
        // 排队也属于未完成的业务任务，超时计时器需要保持进程存活。
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

    const item: WorkerQueueItem<Props> = {
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

    /** 所有线程级失败统一释放任务、资源预留和 worker 槽位。 */
    const handleWorkerFailure = ({
      message,
      eventName,
      error,
      outcome,
      details
    }: {
      message: string;
      eventName: string;
      error: unknown;
      outcome: Extract<WorkerTaskOutcome, 'worker_error' | 'message_error' | 'protocol_error'>;
      details?: Record<string, unknown>;
    }) => {
      logger.error(message, {
        eventName,
        workerName: this.name,
        workerId,
        taskId: item.currentTask?.taskId,
        taskType: item.currentTask?.taskType,
        ...details,
        error,
        ...this.getPoolSnapshot()
      });
      this.deleteWorker(workerId, error, outcome);
    };

    // watch response
    worker.on('message', ({ id, type, requestId, data }: WorkerResponse<Response>) => {
      if (id !== item.id) {
        const error = new Error(`Worker response id mismatch: expected ${item.id}, received ${id}`);
        handleWorkerFailure({
          message: 'Worker protocol error',
          eventName: 'worker.thread.protocol_error',
          error,
          outcome: 'protocol_error'
        });
        return;
      }

      if (type === 'uploadFile') {
        this.handleUploadFileMessage({ item, requestId, data });
        return;
      }

      if (type === 'loadFile') {
        this.handleLoadFileMessage({ item, requestId });
        return;
      }

      if (type === 'success') {
        this.completeTask(item, { type: 'success', data });
      } else if (type === 'error') {
        this.completeTask(item, { type: 'error', data });
      } else {
        const error = new Error(`Unknown worker response type: ${type}`);
        handleWorkerFailure({
          message: 'Worker protocol error',
          eventName: 'worker.thread.protocol_error',
          error,
          outcome: 'protocol_error'
        });
      }
    });

    // Worker error, terminate and delete it.（Un catch error)
    worker.on('error', (err) => {
      handleWorkerFailure({
        message: 'Worker thread error',
        eventName: 'worker.thread.error',
        error: err,
        outcome: 'worker_error'
      });
    });
    worker.on('messageerror', (err) => {
      handleWorkerFailure({
        message: 'Worker message error',
        eventName: 'worker.thread.message_error',
        error: err,
        outcome: 'message_error'
      });
    });
    worker.on('exit', (code) => {
      if (!this.workerQueue.includes(item)) return;

      const error = new Error(`Worker exited unexpectedly with code ${code}`);
      handleWorkerFailure({
        message: 'Worker exited unexpectedly',
        eventName: 'worker.thread.exit',
        error,
        outcome: 'worker_error',
        details: { exitCode: code }
      });
    });

    // 所有线程池统一在空闲时释放引用，任务开始时恢复引用；线程本身继续复用。
    worker.unref();
    return item;
  }

  private completeTask(
    item: WorkerQueueItem<Props>,
    result: { type: 'success' | 'error'; data: unknown }
  ) {
    const task = item.currentTask as WorkerRunTaskType<Props> | undefined;
    if (!task) return;

    clearTimeout(item.timeoutId);
    task.abortController?.abort();
    item.timeoutId = undefined;
    item.currentTask = undefined;
    item.handlers = undefined;
    item.tasksCompleted += 1;
    item.status = 'idle';
    this.reservedResourceBytes = Math.max(0, this.reservedResourceBytes - task.resourceBytes);
    const durationMs = Date.now() - (task.startedAt ?? item.taskTime);
    const resourceSnapshot = this.resourcePolicy?.getResourceSnapshot();

    if (result.type === 'error') {
      // 使用主线程在失败处判定的结果，而不是在这里猜测跨线程克隆后的错误形态
      const isExpected = task.expectedTaskError === true;
      const logFn = isExpected
        ? this.logger.warn.bind(this.logger)
        : this.logger.error.bind(this.logger);

      logFn('Worker task failed', {
        eventName: 'worker.task.failed',
        workerName: this.name,
        workerId: item.id,
        taskId: task.taskId,
        taskType: task.taskType,
        taskResourceBytes: task.resourceBytes,
        executionDurationMs: durationMs,
        error: result.data,
        ...this.getPoolSnapshot(resourceSnapshot)
      });
    }

    this.logTaskFinished({
      task,
      outcome: result.type,
      workerId: item.id,
      executionDurationMs: durationMs,
      resourceSnapshot
    });

    if (result.type === 'success') {
      task.resolve(result.data);
    } else {
      task.reject(result.data);
    }

    if (item.tasksCompleted >= this.maxTasksPerWorker) {
      this.deleteWorker(item.id, undefined, 'max_tasks');
    } else {
      item.worker.unref();
      this.scheduleIdleWorkerCleanup(item);
      this.dispatchTasks();
    }
  }

  private scheduleIdleWorkerCleanup(item: WorkerQueueItem<Props>) {
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
    item: WorkerQueueItem<Props>;
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

  /** 处理 readFile worker 的延迟物化请求，并在主线程同步维护任务软预留。 */
  private handleLoadFileMessage({
    item,
    requestId
  }: {
    item: WorkerQueueItem<Props>;
    requestId?: string;
  }) {
    const reply = (
      type: 'loadFileResult' | 'loadFileError',
      data: unknown,
      transferList?: TransferListItem[]
    ) => {
      if (!this.workerQueue.includes(item) || item.status !== 'running') return;
      try {
        item.worker.postMessage(
          {
            id: item.id,
            type,
            requestId,
            data
          },
          transferList
        );
      } catch (error) {
        this.logger.error('Failed to reply worker loadFile request', {
          eventName: 'worker.task.handler_reply_error',
          workerId: item.id,
          workerName: this.name,
          taskId: item.currentTask?.taskId,
          taskType: item.currentTask?.taskType,
          error
        });
        this.deleteWorker(item.id, error, 'dispatch_error');
      }
    };

    const task = item.currentTask;
    if (!requestId) {
      reply('loadFileError', new Error('Missing loadFile requestId'));
      return;
    }
    if (!task?.abortController) {
      reply('loadFileError', new Error('Missing running worker task'));
      return;
    }

    const handler = item.handlers?.loadFile;
    if (!handler) {
      reply('loadFileError', new Error('Missing loadFile handler'));
      return;
    }

    const updateResourceBytes = (requiredBytes: number) => {
      if (item.currentTask !== task || task.abortController?.signal.aborted) {
        throw new Error('Worker task is no longer running');
      }

      const normalizedRequiredBytes = Math.max(0, requiredBytes);
      const resourceSnapshot = this.resourcePolicy?.getResourceSnapshot();
      const maximumResourceBytes =
        resourceSnapshot?.maximumTaskResourceBytes ?? Number.MAX_SAFE_INTEGER;
      if (normalizedRequiredBytes > maximumResourceBytes) {
        const error = new WorkerTaskResourceLimitError({
          requiredBytes: normalizedRequiredBytes,
          maximumBytes: maximumResourceBytes
        });
        this.logger.warn('Worker task rejected by hard resource limit during execution', {
          eventName: 'worker.task.hard_resource_rejected',
          workerName: this.name,
          workerId: item.id,
          taskId: task.taskId,
          taskType: task.taskType,
          taskResourceBytes: task.resourceBytes,
          requiredResourceBytes: normalizedRequiredBytes,
          error,
          ...this.getPoolSnapshot(resourceSnapshot)
        });
        throw error;
      }
      if (normalizedRequiredBytes <= task.resourceBytes) return;

      const previousResourceBytes = task.resourceBytes;
      const deltaBytes = normalizedRequiredBytes - previousResourceBytes;
      task.resourceBytes = normalizedRequiredBytes;
      this.reservedResourceBytes += deltaBytes;
      if (task.resourceBytes - task.lastLoggedResourceBytes >= WORKER_RESOURCE_LOG_STEP_BYTES) {
        task.lastLoggedResourceBytes = task.resourceBytes;
        this.logger.debug('Worker task resource reservation updated', {
          eventName: 'worker.task.resource_reservation_updated',
          workerName: this.name,
          workerId: item.id,
          taskId: task.taskId,
          taskType: task.taskType,
          previousResourceBytes,
          taskResourceBytes: task.resourceBytes,
          deltaResourceBytes: deltaBytes,
          ...this.getPoolSnapshot(resourceSnapshot)
        });
      }
    };

    const materializeStartedAt = Date.now();
    this.logger.debug('Worker task file materialization started', {
      eventName: 'worker.task.materialize_started',
      workerName: this.name,
      workerId: item.id,
      taskId: task.taskId,
      taskType: task.taskType,
      taskInitialResourceBytes: task.resourceBytes
    });
    handler({ updateResourceBytes }, task.abortController.signal)
      .then((result) => {
        this.logger.debug('Worker task file materialization finished', {
          eventName: 'worker.task.materialize_finished',
          workerName: this.name,
          workerId: item.id,
          taskId: task.taskId,
          taskType: task.taskType,
          sourceActualBytes: result.bufferSize,
          taskFinalResourceBytes: task.resourceBytes,
          materializeDurationMs: Date.now() - materializeStartedAt
        });
        reply('loadFileResult', result, [result.buffer]);
      })
      .catch((error) => {
        // 预期内的失败（用户业务异常、网络/DNS 故障）降级为 warn，不区分任务来源：
        // 来源相关的处理由上游调用方负责。判定在此进行：此刻 error 尚未跨线程，instanceof 与 cause 都有效。
        task.expectedTaskError = isExpectedWorkerTaskError(error);

        this.logger.warn('Worker task file source failed', {
          eventName:
            error instanceof Error && error.message.includes('maximum allowed size')
              ? 'worker.task.file_size_rejected'
              : 'worker.task.source_failed',
          workerName: this.name,
          workerId: item.id,
          taskId: task.taskId,
          taskType: task.taskType,
          taskFinalResourceBytes: task.resourceBytes,
          materializeDurationMs: Date.now() - materializeStartedAt,
          error
        });
        reply('loadFileError', error);
      });
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
        task.abortController?.abort();
        item.currentTask = undefined;
        this.reservedResourceBytes = Math.max(0, this.reservedResourceBytes - task.resourceBytes);
        const outcome: WorkerTaskOutcome =
          reason === 'idle_timeout' || reason === 'max_tasks' || reason === 'terminated'
            ? 'worker_error'
            : reason;
        const durationMs = Date.now() - (task.startedAt ?? item.taskTime);
        this.logTaskFinished({
          task,
          outcome,
          workerId: item.id,
          executionDurationMs: durationMs
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

/** 按任务类型复用进程内线程池；首次调用确定调度参数和线程入口，后续调用复用同一实例。 */
export const getWorkerController = <Props, Response>(props: {
  name: WorkerNameEnum; // Worker 类型，对应线程入口；同类型复用缓存的线程池
  maxReservedThreads: number; // 池内线程数量上限，达到上限且没有空闲线程时排队
  taskTimeoutMs?: number; // 单任务执行超时（毫秒），默认 60000，从派发时计时，超时终止线程
  maxTasksPerWorker?: number; // 单线程完成任务数上限，默认 1000，达到后回收线程
  resourcePolicy?: WorkerPoolResourcePolicy<Props>; // 资源准入和排队超时策略，未配置时仅按线程容量调度
  idleWorkerTimeoutMs?: number; // 空闲回收等待时间（毫秒），未配置或为 0 时不按空闲时长回收
  minIdleWorkers?: number; // 空闲回收时保留的线程数，默认 0，不会主动创建线程
  queueWarningThreshold?: number; // 排队告警阈值，默认取线程上限且至少为 1，仅告警、不限制排队
  getTaskType?: (data: Props) => string; // 提取日志中的任务类型，默认返回 'default'
  logger?: WorkerPoolLogger; // 日志记录器，默认使用 INFRA.WORKER 分类
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
