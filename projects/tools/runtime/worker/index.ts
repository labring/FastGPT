import { Worker } from 'worker_threads';
type WorkerQueueItem = {
  id: string;
  worker: Worker;
  status: 'running' | 'idle';
  taskTime: number;
  timeoutId?: NodeJS.Timeout;
  resolve: (e: unknown) => void;
  reject: (e: unknown) => void;
};
type WorkerResponse<T = unknown> = {
  id: string;
  type: 'success' | 'error';
  data: T;
};

type WorkerRunTaskType<T> = {
  data: T;
  resolve: (e: unknown) => void;
  reject: (e: unknown) => void;
};

export class WorkerPool<Props = Record<string, unknown>, Response = unknown> {
  maxReservedThreads: number;
  workerQueue: WorkerQueueItem[] = [];
  waitQueue: WorkerRunTaskType<Props>[] = [];

  constructor({ maxReservedThreads }: { maxReservedThreads: number }) {
    this.maxReservedThreads = maxReservedThreads;
  }

  private runTask({ data, resolve, reject }: WorkerRunTaskType<Props>) {
    // Get idle worker or create a new worker
    const runningWorker = (() => {
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

  async run(data: Props) {
    // watch memory
    // addLog.debug(`${this.name} worker queueLength: ${this.workerQueue.length}`);

    return new Promise<Response>((resolve, reject) => {
      /*
          Whether the task is executed immediately or delayed, the promise callback will dispatch after task complete.
        */
      this.runTask({
        data,
        resolve: (result: unknown) => resolve(result as Response),
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
    const worker = new Worker('./worker.js', {
      env: {},
      resourceLimits: {
        maxOldGenerationSizeMb: parseInt(process.env.MAX_MEMORYMB || '1024')
      }
    });

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
    worker.on('message', ({ type, data }: WorkerResponse<Response>) => {
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
      this.deleteWorker(workerId);
    });
    worker.on('messageerror', (err) => {
      console.log(err);
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

const maxReservedThreads = parseInt(process.env.MAX_WORKER || '8');

const workerPool = new WorkerPool({ maxReservedThreads });

export async function dispatch(data: Record<string, unknown>) {
  return await workerPool.run(data);
}
