import type { Queue, Worker } from 'bullmq';
import type { QueueNames } from './index';

declare global {
  var queues: Map<QueueNames, Queue> | undefined;
  var workers: Map<QueueNames, Worker> | undefined;
}
