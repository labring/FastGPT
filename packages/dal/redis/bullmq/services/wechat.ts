import { bullMQ, type BullMQBinding } from '../binding';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker, WorkerOptions } from '../types';

export type WechatPollJobData = {
  shareId: string;
};

export type WechatReplyJobData = {
  shareId: string;
  userId: string;
  text: string;
  contextToken: string;
  lastMsgId: string;
};

export const WECHAT_POLL_JOB_NAME = 'wechatPublishPoll';
export const WECHAT_REPLY_JOB_NAME = 'wechatPublishReply';

/** 微信轮询和回复队列的业务服务。 */
export class WechatMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  getPollQueue(): Queue<WechatPollJobData> {
    return this.binding.getQueue<WechatPollJobData>(QueueNames.wechatPoll);
  }

  getReplyQueue(): Queue<WechatReplyJobData> {
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

  /** 投递微信回复任务，具体幂等键由调用方根据消息 id 生成。 */
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
  addPollJob(
    data: WechatPollJobData,
    opts: {
      jobId: string;
      delay?: number;
      removeOnComplete?: boolean;
      removeOnFail?: boolean;
    }
  ) {
    return this.getPollQueue().add(WECHAT_POLL_JOB_NAME, data, opts);
  }

  /** 删除指定渠道的轮询任务。active 任务由 BullMQ 自身状态决定是否可移除。 */
  removePollJob(jobId: string) {
    return this.getPollQueue().remove(jobId);
  }
}

export const wechatMQService = new WechatMQService();
