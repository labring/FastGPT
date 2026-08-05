import type { Queue, Worker } from 'bullmq';
import type { BullMQEventListener, WorkerListenerSnapshot } from './types';

/** 管理 DAL 自己挂载的 listener，避免关闭或重启时删除业务 listener。 */
export class BullMQLifecycleListeners {
  private readonly queueErrorHandlers = new WeakMap<Queue, BullMQEventListener>();
  private readonly workerLifecycleHandlers = new WeakMap<Worker, Set<BullMQEventListener>>();

  registerQueueErrorHandler(queue: Queue, handler: BullMQEventListener) {
    this.queueErrorHandlers.set(queue, handler);
  }

  registerWorkerLifecycleHandlers(worker: Worker, handlers: Set<BullMQEventListener>) {
    this.workerLifecycleHandlers.set(worker, handlers);
  }

  captureWorkerBusinessListeners(
    worker: Worker,
    lifecycleHandlers: Set<BullMQEventListener>
  ): WorkerListenerSnapshot[] {
    const snapshots: WorkerListenerSnapshot[] = [];

    for (const eventName of worker.eventNames()) {
      for (const rawListener of worker.rawListeners(eventName)) {
        const listenerWithOriginal = rawListener as BullMQEventListener & {
          listener?: BullMQEventListener;
        };
        const listener = listenerWithOriginal.listener ?? listenerWithOriginal;
        if (
          lifecycleHandlers.has(rawListener as BullMQEventListener) ||
          lifecycleHandlers.has(listener)
        ) {
          continue;
        }

        snapshots.push({
          eventName,
          listener,
          once: listenerWithOriginal.listener !== undefined
        });
      }
    }

    return snapshots;
  }

  restoreWorkerBusinessListeners(
    worker: Worker,
    listeners: readonly WorkerListenerSnapshot[] | undefined
  ) {
    for (const { eventName, listener, once } of listeners ?? []) {
      if (once) {
        worker.once(eventName as any, listener as any);
      } else {
        worker.on(eventName as any, listener as any);
      }
    }
  }

  removeWorkerLifecycleListeners(worker: Worker) {
    const lifecycleHandlers = this.workerLifecycleHandlers.get(worker);
    if (!lifecycleHandlers) return;

    for (const eventName of worker.eventNames()) {
      for (const rawListener of worker.rawListeners(eventName)) {
        const listenerWithOriginal = rawListener as BullMQEventListener & {
          listener?: BullMQEventListener;
        };
        const listener = listenerWithOriginal.listener ?? listenerWithOriginal;
        if (
          lifecycleHandlers.has(rawListener as BullMQEventListener) ||
          lifecycleHandlers.has(listener)
        ) {
          worker.removeListener(eventName as any, rawListener as any);
        }
      }
    }

    this.workerLifecycleHandlers.delete(worker);
  }

  removeQueueLifecycleListener(queue: Queue) {
    const errorHandler = this.queueErrorHandlers.get(queue);
    if (!errorHandler) return;

    queue.removeListener('error', errorHandler as any);
    this.queueErrorHandlers.delete(queue);
  }
}
