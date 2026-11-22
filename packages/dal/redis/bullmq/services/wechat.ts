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

const replyCompletionRetention = {
  age: 24 * 60 * 60,
  count: 10_000
};

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

  /** 沿用旧版任务 ID，并在游标提交失败后的重拉中复用已完成的任务。 */
  async addReplyJob(data: WechatReplyJobData & { bindingKey: string; items: unknown[] }) {
    const queue = this.getReplyQueue();
    const legacyJobId = `wechat-reply:${data.shareId}:${data.lastMsgId}`;
    const bindingJobId = `wechat-reply:${data.shareId}:${data.bindingKey}:${data.lastMsgId}`;
    // 之前已因冲突使用绑定键的回复，在旧键清理后重拉时仍沿用绑定键。
    const existingBindingJob = await queue.getJob(bindingJobId);
    if (existingBindingJob) return existingBindingJob;

    const opts = { removeOnComplete: replyCompletionRetention };
    await queue.add(WECHAT_REPLY_JOB_NAME, data, { ...opts, jobId: legacyJobId });
    // BullMQ add 返回的是本次传入的数据。发生 ID 冲突时，读取 Redis 中真正占用该 ID 的任务。
    const stored = await queue.getJob(legacyJobId);
    if (!stored) throw new Error('Wechat reply job was not retained');
    if (stored.data.bindingKey === data.bindingKey) return stored;

    // 绑定可能复用消息 ID。旧任务保留原键，当前轮询重新拉取的消息用其已知绑定入队。
    return queue.add(WECHAT_REPLY_JOB_NAME, data, { ...opts, jobId: bindingJobId });
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
