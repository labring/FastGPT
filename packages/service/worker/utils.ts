import type { Worker as NodeWorker } from 'worker_threads';
import path from 'path';
import { getLogger, LogCategories } from '../common/logger';
import { serviceEnv } from '../env';

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
    NODE_ENV: process.env.NODE_ENV,
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    NO_PROXY: process.env.NO_PROXY
  };
};

const createNodeWorker = (workerPath: string) => {
  const nodeRequire = eval('require') as (id: string) => typeof import('worker_threads');
  const { Worker } = nodeRequire('worker_threads');

  return new Worker(workerPath, {
    env: getSafeEnv()
  });
};

export const getWorker = (name: `${WorkerNameEnum}`) => {
  const workerPath = path.join(process.cwd(), 'worker', `${name}.js`);
  return createNodeWorker(workerPath);
};

export const runWorker = <T = any>(name: WorkerNameEnum, params?: Record<string, any>) => {
  const logger = getLogger(LogCategories.INFRA.WORKER);
  return new Promise<T>((resolve, reject) => {
    const start = Date.now();
    const worker = getWorker(name);

    worker.postMessage(params);

    worker.on('message', (msg: { type: 'success' | 'error'; data: any }) => {
      if (msg.type === 'error') return reject(msg.data);

      resolve(msg.data);

      const time = Date.now() - start;
      if (time > 1000) {
        logger.info('Worker task completed', { name, durationMs: time });
      }
    });

    worker.on('error', (err) => {
      reject(err);
      worker.terminate();
    });
    worker.on('messageerror', (err) => {
      reject(err);
      worker.terminate();
    });
  });
};

type WorkerRunTaskType<T> = { data: T; resolve: (e: any) => void; reject: (e: any) => void };
type WorkerQueueItem = {
  id: string;
  worker: NodeWorker;
  status: 'running' | 'idle';
  taskTime: number;
  tasksCompleted: number;
  timeoutId?: NodeJS.Timeout;
  resolve: (e: any) => void;
  reject: (e: any) => void;
};
type WorkerResponse<T = any> = {
  id: string;
  type: 'success' | 'error';
  data: T;
};

/*
  多线程任务管理
  * 全局只需要创建一个示例
  * 可以设置最大常驻线程（不会被销毁），线程满了后，后续任务会等待执行。
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
  workerQueue: WorkerQueueItem[] = [];
  waitQueue: WorkerRunTaskType<Props>[] = [];

  constructor({
    name,
    maxReservedThreads,
    taskTimeoutMs = 60000,
    maxTasksPerWorker = 1000
  }: {
    name: WorkerNameEnum;
    maxReservedThreads: number;
    taskTimeoutMs?: number;
    maxTasksPerWorker?: number;
  }) {
    this.name = name;
    this.maxReservedThreads = maxReservedThreads;
    this.taskTimeoutMs = taskTimeoutMs;
    this.maxTasksPerWorker = maxTasksPerWorker;
  }

  private runTask({ data, resolve, reject }: WorkerRunTaskType<Props>) {
    // Get idle worker or create a new worker
    const runningWorker = (() => {
      // @ts-ignore
      if (data.workerId) {
        // @ts-ignore
        const worker = this.workerQueue.find((item) => item.id === data.workerId);
        if (worker) return worker;
      }
      const worker = this.workerQueue.find((item) => item.status === 'idle');
      if (worker) return worker;

      if (this.workerQueue.length < this.maxReservedThreads) {
        return this.createWorker();
      }
    })();

    if (runningWorker) {
      // Update memory data to latest task
      runningWorker.status = 'running';
      runningWorker.taskTime = Date.now();
      runningWorker.resolve = resolve;
      runningWorker.reject = reject;
      runningWorker.timeoutId = setTimeout(() => {
        reject('Worker timeout');
        // 超时即销毁，避免占着 idle 槽位永远不释放
        this.deleteWorker(runningWorker.id);
      }, this.taskTimeoutMs);

      runningWorker.worker.postMessage({
        id: runningWorker.id,
        ...data
      });
    } else {
      // Not enough worker, push to wait queue
      this.waitQueue.push({ data, resolve, reject });
    }
  }

  run(data: Props) {
    return new Promise<Response>((resolve, reject) => {
      /*
        Whether the task is executed immediately or delayed, the promise callback will dispatch after task complete.
      */
      this.runTask({
        data,
        resolve,
        reject
      });
    }).finally(() => {
      // Run wait queue
      const waitTask = this.waitQueue.shift();
      if (waitTask) {
        this.runTask(waitTask);
      }
    });
  }

  createWorker() {
    const logger = getLogger(LogCategories.INFRA.WORKER);
    // Create a new worker and push it queue.
    const workerId = `${Date.now()}${Math.random()}`;
    const worker = getWorker(this.name);

    const item: WorkerQueueItem = {
      id: workerId,
      worker,
      status: 'running',
      taskTime: Date.now(),
      tasksCompleted: 0,
      resolve: () => {},
      reject: () => {}
    };
    this.workerQueue.push(item);

    // watch response
    worker.on('message', ({ id, type, data }: WorkerResponse<Response>) => {
      if (type === 'success') {
        item.resolve(data);
      } else if (type === 'error') {
        item.reject(data);
      }

      // Clear timeout timer and update worker status
      clearTimeout(item.timeoutId);
      item.tasksCompleted += 1;

      // 达到任务上限则回收（应对 worker 进程内库的内存泄漏）
      if (item.tasksCompleted >= this.maxTasksPerWorker) {
        this.deleteWorker(item.id);
      } else {
        item.status = 'idle';
      }
    });

    // Worker error, terminate and delete it.（Un catch error)
    worker.on('error', (err) => {
      logger.error('Worker error', { workerId, name: this.name, error: err });
      this.deleteWorker(workerId);
    });
    worker.on('messageerror', (err) => {
      logger.error('Worker message error', { workerId, name: this.name, error: err });
      this.deleteWorker(workerId);
    });

    return item;
  }

  private deleteWorker(workerId: string) {
    const item = this.workerQueue.find((item) => item.id === workerId);
    if (item) {
      item.reject?.('error');
      clearTimeout(item.timeoutId);
      item.worker.removeAllListeners();
      item.worker.terminate();
    }

    this.workerQueue = this.workerQueue.filter((item) => item.id !== workerId);
  }
}

export const getWorkerController = <Props, Response>(props: {
  name: WorkerNameEnum;
  maxReservedThreads: number;
  taskTimeoutMs?: number;
  maxTasksPerWorker?: number;
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
