import { bullMQ, type BullMQBinding } from '../binding';
import { addOrRequeueFailedJob } from '../job-recovery';
import { QueueNames } from '../names';
import type { FlowJob, JobNode, Processor, Queue, Worker } from '../types';

export type AppDeleteJobData = {
  teamId: string;
  appId: string;
  /** Distinguishes task roots, internal Flow steps, and pre-Flow jobs. */
  jobType?: 'task' | 'step' | 'root' | 'app';
  taskId?: string;
};

const appDeleteQueueOptions = {
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: 'exponential' as const,
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: { age: 30 * 24 * 60 * 60 }
  }
};

const appDeleteFlowJobOptions = appDeleteQueueOptions.defaultJobOptions;

/** Apply the App deletion queue retry and retention policy to every node in a Flow tree. */
const applyFlowJobOptions = (flow: FlowJob): FlowJob => ({
  ...flow,
  opts: {
    ...appDeleteFlowJobOptions,
    ...flow.opts
  },
  ...(flow.children
    ? {
        children: flow.children.map((child) => applyFlowJobOptions(child))
      }
    : {})
});

/** App 删除队列的业务合同和生命周期入口。 */
export class AppDeleteMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  /** 获取 App 删除队列；队列对象由 binding 按名称懒加载并复用。 */
  getQueue(): Queue<AppDeleteJobData> {
    return this.binding.getQueue<AppDeleteJobData>(QueueNames.appDelete, appDeleteQueueOptions);
  }

  /** 使用 service 统一的删除任务保留策略创建 App 删除 Worker。 */
  getWorker(processor: Processor<AppDeleteJobData>): Worker<AppDeleteJobData> {
    return this.binding.getWorker<AppDeleteJobData>(QueueNames.appDelete, processor, {
      concurrency: 1,
      removeOnFail: {
        age: 90 * 24 * 60 * 60,
        count: 10000
      }
    });
  }

  /** Add a root deletion job and delay it by one second for request completion. */
  addJob(data: AppDeleteJobData) {
    const jobId = `${String(data.teamId)}-${String(data.appId)}`;
    return addOrRequeueFailedJob({
      queue: this.getQueue(),
      name: 'delete_app',
      data: { ...data, jobType: 'root' },
      opts: {
        jobId,
        delay: 1000
      }
    });
  }

  /** Returns the FlowProducer used to atomically submit deletion task Flows. */
  getFlowProducer() {
    return this.binding.getFlowProducer();
  }

  /** Atomically submits task Flows; callers define step order through the dependency chain. */
  addFlows(flows: FlowJob[]): Promise<JobNode[]> {
    if (flows.length === 0) return Promise.resolve([]);

    return this.getFlowProducer().addBulk(flows.map((flow) => applyFlowJobOptions(flow)));
  }
}

export const appDeleteMQService = new AppDeleteMQService();
