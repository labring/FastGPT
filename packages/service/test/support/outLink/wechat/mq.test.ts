import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWorker: vi.fn(),
  getQueue: vi.fn(),
  getUpdates: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
  increment: vi.fn(),
  reset: vi.fn(),
  clear: vi.fn()
}));

vi.mock('@fastgpt/dal/redis/bullmq', () => ({
  bullMQ: {
    getWorker: mocks.getWorker,
    getQueue: mocks.getQueue
  },
  wechatMQService: {
    getPollWorker: (processor: unknown, opts: unknown) =>
      mocks.getWorker('wechatPoll', processor, opts),
    getReplyWorker: (processor: unknown, opts: unknown) =>
      mocks.getWorker('wechatReply', processor, opts),
    addPollJob: (...args: unknown[]) => mocks.getQueue('wechatPoll')?.add?.(...args),
    addReplyJob: (...args: unknown[]) => mocks.getQueue('wechatReply')?.add?.(...args),
    removePollJob: (jobId: string) => mocks.getQueue('wechatPoll')?.remove?.(jobId)
  },
  WECHAT_POLL_JOB_NAME: 'wechatPublishPoll',
  QueueNames: {
    wechatPoll: 'wechatPoll',
    wechatReply: 'wechatReply'
  }
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    WECHAT_CHANNEL_CONCURRENCY: 1
  }
}));

vi.mock('../../../env', () => ({
  serviceEnv: {
    WECHAT_CHANNEL_CONCURRENCY: 1
  }
}));

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: {
    find: mocks.find,
    findOne: mocks.findOne,
    updateOne: mocks.updateOne
  }
}));

vi.mock('../../../../support/outLink/schema', () => ({
  MongoOutLink: {
    find: mocks.find,
    findOne: mocks.findOne,
    updateOne: mocks.updateOne
  }
}));

vi.mock('@fastgpt/service/support/outLink/wechat/ilinkClient', () => ({
  ILinkClient: class {
    getUpdates = mocks.getUpdates;
  }
}));

vi.mock('../../../../support/outLink/wechat/ilinkClient', () => ({
  ILinkClient: class {
    getUpdates = mocks.getUpdates;
  }
}));

vi.mock('@fastgpt/service/support/outLink/wechat/provider', () => ({
  wechatOutlinkProvider: vi.fn()
}));

vi.mock('../../../../support/outLink/wechat/provider', () => ({
  wechatOutlinkProvider: vi.fn()
}));

vi.mock('@fastgpt/dal/redis/caches', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/dal/redis/caches')>();
  return {
    ...actual,
    wechatPollingFailureCache: {
      increment: mocks.increment,
      reset: mocks.reset,
      clear: mocks.clear
    }
  };
});

vi.mock('@fastgpt/global/common/system/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/global/common/system/utils')>();
  return {
    ...actual,
    batchRun: vi.fn(async () => undefined),
    retryFn: vi.fn(async (callback: () => Promise<unknown>) => callback())
  };
});

import { initWechatPollWorker } from '@fastgpt/service/support/outLink/wechat/mq';

const outLink = {
  shareId: 'share-1',
  app: {
    status: 'online',
    token: 'token',
    baseUrl: 'https://wechat.example.com',
    syncBuf: 'cursor'
  }
};

const job = {
  id: 'job-1',
  data: { shareId: 'share-1' }
};

describe('Wechat polling failure counter integration', () => {
  const workers: Array<{ processor: (job: any) => Promise<unknown> }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    workers.length = 0;

    mocks.getWorker.mockImplementation((_queueName: string, processor: any) => {
      workers.push({ processor });
      return { on: vi.fn() };
    });
    mocks.getQueue.mockReturnValue({
      add: vi.fn(),
      remove: vi.fn()
    });
    mocks.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(outLink) });
    mocks.updateOne.mockResolvedValue(undefined);
    mocks.getUpdates.mockResolvedValue({ ret: 0, msgs: [] });
    mocks.increment.mockResolvedValue(1);
    mocks.reset.mockResolvedValue(undefined);
    mocks.clear.mockResolvedValue(true);
  });

  const getPollProcessor = async () => {
    await initWechatPollWorker();
    return workers[0]?.processor;
  };

  it('uses the atomic cache increment for API failures', async () => {
    mocks.getUpdates.mockResolvedValue({ ret: 500, errmsg: 'upstream failed' });
    mocks.increment.mockResolvedValue(2);
    const processor = await getPollProcessor();

    await expect(processor?.(job)).rejects.toThrow('getUpdates API error: ret=500');
    expect(mocks.increment).toHaveBeenCalledWith('share-1');
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('resets the counter after a successful poll', async () => {
    mocks.getUpdates.mockResolvedValue({ ret: 0, msgs: [], get_updates_buf: 'next-cursor' });
    const processor = await getPollProcessor();

    await expect(processor?.(job)).resolves.toBe(false);
    expect(mocks.reset).toHaveBeenCalledWith('share-1');
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { shareId: 'share-1' },
      { $set: { 'app.syncBuf': 'next-cursor' } }
    );
  });

  it('clears the counter and marks the channel after the threshold', async () => {
    mocks.getUpdates.mockResolvedValue({ ret: 500, errmsg: 'upstream failed' });
    mocks.increment.mockResolvedValue(5);
    const processor = await getPollProcessor();

    await expect(processor?.(job)).rejects.toThrow('getUpdates API error: ret=500');
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { shareId: 'share-1' },
      { $set: { 'app.status': 'error', 'app.lastError': 'upstream failed' } }
    );
    expect(mocks.clear).toHaveBeenCalledWith('share-1');
  });
});
