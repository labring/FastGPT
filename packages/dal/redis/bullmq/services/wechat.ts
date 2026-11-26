import { bullMQ, type BullMQBinding } from '../binding';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker, WorkerOptions } from '../types';

export type WechatPollJobData = {
  shareId: string;
};

export type WechatReplyJobData = {
  shareId: string;
  bindingKey?: string;
  userId: string;
  items?: unknown[];
  contextToken: string;
  lastMsgId: string;
};

export const WECHAT_POLL_JOB_NAME = 'wechatPublishPoll';
export const WECHAT_REPLY_JOB_NAME = 'wechatPublishReply';

/** 微信轮询和回复队列的业务服务。 */
export class WechatMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  private getPollQueue(): Queue<WechatPollJobData> {
    return this.binding.getQueue<WechatPollJobData>(QueueNames.wechatPoll);
  }

  private getReplyQueue(): Queue<WechatReplyJobData> {
    return this.binding.getQueue<WechatReplyJobData>(QueueNames.wechatReply);
  }

  /** 创建微信轮询 Worker，轮询 processor 的返回值用于 completed 续链策略。 */
  getPollWorker<ReturnType = boolean>(
    processor: Processor<WechatPollJobData, ReturnType>,
    opts: Omit<WorkerOptions, 'connection'>
  ): Worker<WechatPollJobData, ReturnType> {
    return this.binding.getWorker<WechatPollJobData, ReturnType>(
      QueueNames.wechatPoll,
      processor,
      opts
    );
  }

  /** 创建微信回复 Worker。 */
  getReplyWorker(
    processor: Processor<WechatReplyJobData>,
    opts: Omit<WorkerOptions, 'connection'>
  ): Worker<WechatReplyJobData> {
    return this.binding.getWorker<WechatReplyJobData>(QueueNames.wechatReply, processor, opts);
  }

  /** 投递微信回复任务，具体幂等键由调用方根据绑定与消息 id 生成。 */
  addReplyJob(
    data: WechatReplyJobData,
    opts: {
      jobId: string;
      backoff?: { type: 'fixed'; delay: number };
    }
  ) {
    return this.getReplyQueue().add(WECHAT_REPLY_JOB_NAME, data, opts);
  }

  /** 投递下一轮微信轮询任务。 */
  addPollJob(data: WechatPollJobData, opts: { jobId: string; delay?: number }) {
    // 固定 jobId 必须在终态立即释放，Worker 事件才能投递下一轮。
    return this.getPollQueue().add(WECHAT_POLL_JOB_NAME, data, {
      ...opts,
      removeOnComplete: true,
      removeOnFail: true
    });
  }

  /** 删除指定渠道的轮询任务。active 任务由 BullMQ 自身状态决定是否可移除。 */
  removePollJob(jobId: string) {
    return this.getPollQueue().remove(jobId);
  }
}

export const wechatMQService = new WechatMQService();
