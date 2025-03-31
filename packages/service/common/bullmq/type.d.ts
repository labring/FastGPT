import { Queue, Worker } from 'bullmq';
import { QueueNames } from './index';

declare global {
  var queues: Map<QueueNames, Queue> | undefined;
  var workers: Map<QueueNames, Worker> | undefined;
}
