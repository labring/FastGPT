import { Queue, Worker } from 'bullmq';

declare global {
  var queues: Map<string, Queue> | undefined;
  var workers: Map<string, Worker> | undefined;
}
