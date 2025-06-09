import { Worker } from 'worker_threads';
import path from 'path';
import { addLog } from '../common/system/log';

export enum WorkerNameEnum {
  readFile = 'readFile',
  htmlStr2Md = 'htmlStr2Md',
  countGptMessagesTokens = 'countGptMessagesTokens',
  systemPluginRun = 'systemPluginRun',
  text2Chunks = 'text2Chunks'
}

export const getSafeEnv = () => {
  return {
    LOG_LEVEL: process.env.LOG_LEVEL,
    STORE_LOG_LEVEL: process.env.STORE_LOG_LEVEL,
    NODE_ENV: process.env.NODE_ENV
  };
};

export const getWorker = (name: WorkerNameEnum) => {
  const workerPath = path.join(process.cwd(), '.next', 'server', 'worker', `${name}.js`);
  return new Worker(workerPath, {
    env: getSafeEnv()
  });
};

export const runWorker = <T = any>(name: WorkerNameEnum, params?: Record<string, any>) => {
  return new Promise<T>((resolve, reject) => {
    const start = Date.now();
    const worker = getWorker(name);

    worker.postMessage(params);

    worker.on('message', (msg: { type: 'success' | 'error'; data: any }) => {
      if (msg.type === 'error') return reject(msg.data);

      resolve(msg.data);

      const time = Date.now() - start;
      if (time > 1000) {
        addLog.info(`Worker ${name} run time: ${time}ms`);
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
  worker: Worker;
  status: 'running' | 'idle';
  taskTime: number;
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
*/
export class WorkerPool<Props = Record<string, any>, Response = any> {
  name: WorkerNameEnum;
  maxReservedThreads: number;
  workerQueue: WorkerQueueItem[] = [];
  waitQueue: WorkerRunTaskType<Props>[] = [];

  constructor({ name, maxReservedThreads }: { name: WorkerNameEnum; maxReservedThreads: number }) {
    this.name = name;
    this.maxReservedThreads = maxReservedThreads;
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
      }, 30000);

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
    // watch memory
    // addLog.debug(`${this.name} worker queueLength: ${this.workerQueue.length}`);

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
    // Create a new worker and push it queue.
    const workerId = `${Date.now()}${Math.random()}`;
    const worker = getWorker(this.name);

    const item: WorkerQueueItem = {
      id: workerId,
      worker,
      status: 'running',
      taskTime: Date.now(),
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
      item.status = 'idle';
    });

    // Worker error, terminate and delete it.（Un catch error)
    worker.on('error', (err) => {
      console.log(err);
      addLog.error('Worker error', err);
      this.deleteWorker(workerId);
    });
    worker.on('messageerror', (err) => {
      console.log(err);
      addLog.error('Worker messageerror', err);
      this.deleteWorker(workerId);
    });

    return item;
  }

  private deleteWorker(workerId: string) {
    const item = this.workerQueue.find((item) => item.id === workerId);
    if (item) {
      item.reject?.('error');
      clearTimeout(item.timeoutId);
      item.worker.terminate();
    }

    this.workerQueue = this.workerQueue.filter((item) => item.id !== workerId);
  }
}

export const getWorkerController = <Props, Response>(props: {
  name: WorkerNameEnum;
  maxReservedThreads: number;
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
