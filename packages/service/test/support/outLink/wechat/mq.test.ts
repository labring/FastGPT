import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWorker: vi.fn(),
  getQueue: vi.fn(),
  getUpdates: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  exists: vi.fn(),
  updateOne: vi.fn(),
  increment: vi.fn(),
  reset: vi.fn(),
  clear: vi.fn(),
  queueAdd: vi.fn()
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
  defaultWorkerOptions: { removeOnFail: { count: 10000 } },
  QueueNames: {
    wechatPoll: 'wechatPoll',
    wechatReply: 'wechatReply'
  }
}));

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: {
    find: mocks.find,
    findOne: mocks.findOne,
    exists: mocks.exists,
    updateOne: mocks.updateOne
  }
}));

vi.mock('../../../../support/outLink/schema', () => ({
  MongoOutLink: {
    find: mocks.find,
    findOne: mocks.findOne,
    exists: mocks.exists,
    updateOne: mocks.updateOne
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
import { ILinkClient } from '@fastgpt/service/support/outLink/wechat/ilinkClient';
import { WechatRequestPolicyError } from '@fastgpt/service/support/outLink/wechat/request';

const bindingId = 'eab36734-81b6-4346-a623-fd3821712cd6';
const outLink = {
  shareId: 'share-1',
  app: {
    status: 'online',
    token: 'token',
    bindingId,
    loginTime: '2026-11-22T07:00:00.000Z',
    baseUrl: 'https://ilinkai.weixin.qq.com',
    syncBuf: 'cursor'
  }
};

const currentConnectionFilter = {
  shareId: outLink.shareId,
  'app.status': 'online',
  'app.bindingId': bindingId,
  'app.baseUrl': outLink.app.baseUrl,
  'app.token': outLink.app.token,
  'app.loginTime': outLink.app.loginTime
};

const job = {
  id: 'job-1',
  data: { shareId: 'share-1' }
};

describe('Wechat polling failure counter integration', () => {
  const workers: Array<{
    processor: (job: any) => Promise<unknown>;
    on: ReturnType<typeof vi.fn>;
  }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    workers.length = 0;

    mocks.getWorker.mockImplementation((_queueName: string, processor: any) => {
      const on = vi.fn();
      workers.push({ processor, on });
      return { on };
    });
    mocks.getQueue.mockReturnValue({
      add: mocks.queueAdd,
      remove: vi.fn()
    });
    mocks.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(outLink) });
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    vi.spyOn(ILinkClient.prototype, 'getUpdates').mockImplementation(mocks.getUpdates);
    mocks.getUpdates.mockResolvedValue({ ret: 0, msgs: [] });
    mocks.increment.mockResolvedValue(1);
    mocks.reset.mockResolvedValue(undefined);
    mocks.clear.mockResolvedValue(true);
    mocks.queueAdd.mockResolvedValue({ id: 'poll-job' });
    mocks.exists.mockResolvedValue(null);
  });

  afterEach(() => vi.restoreAllMocks());

  const getPollProcessor = async () => {
    await initWechatPollWorker();
    return workers[0]?.processor;
  };

  it('initializes both poll and reply workers with fixed concurrency 1000', async () => {
    await initWechatPollWorker();
    expect(mocks.getWorker).toHaveBeenCalledTimes(2);
    for (const queueName of ['wechatPoll', 'wechatReply']) {
      expect(mocks.getWorker).toHaveBeenCalledWith(
        queueName,
        expect.any(Function),
        expect.objectContaining({ concurrency: 1000 })
      );
    }
  });

  it('rechecks a stopped channel and resumes only if it was rebound', async () => {
    mocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const processor = await getPollProcessor();
    await expect(processor?.(job)).resolves.toBe('stopped');
    expect(mocks.getUpdates).not.toHaveBeenCalled();

    const completed = workers[0].on.mock.calls.find(([event]) => event === 'completed')?.[1];
    const finishedJob = { ...job, name: 'wechatPublishPoll' };
    await completed(finishedJob, 'stopped');
    expect(mocks.queueAdd).not.toHaveBeenCalled();

    mocks.exists.mockResolvedValue({ _id: 'rebound-channel' });
    await completed(finishedJob, 'stopped');
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      { shareId: outLink.shareId },
      expect.objectContaining({ jobId: `wechat-poll:${outLink.shareId}` })
    );
  });

  it('pauses polling for a legacy channel with a disallowed server address', async () => {
    const baseUrl = 'https://example.invalid';
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...outLink, app: { ...outLink.app, baseUrl } })
    });
    const processor = await getPollProcessor();

    await expect(processor?.(job)).rejects.toThrow('outside the allowed endpoints');
    expect(mocks.getUpdates).not.toHaveBeenCalled();
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { ...currentConnectionFilter, 'app.baseUrl': baseUrl },
      { $set: { 'app.status': 'error', 'app.lastError': 'invalid_url' } }
    );
  });

  it('pauses polling immediately for an address policy rejection', async () => {
    const rejection = new WechatRequestPolicyError('private_address');
    mocks.getUpdates.mockRejectedValue(rejection);
    const processor = await getPollProcessor();

    await expect(processor?.(job)).rejects.toBe(rejection);
    expect(mocks.increment).not.toHaveBeenCalled();
    expect(mocks.updateOne).toHaveBeenCalledWith(currentConnectionFilter, {
      $set: { 'app.status': 'error', 'app.lastError': 'private_address' }
    });
  });

  it.each([1, 5])(
    'counts transport failures and applies the threshold (count %d)',
    async (count) => {
      const rejection = new Error('network temporarily unavailable');
      mocks.getUpdates.mockRejectedValue(rejection);
      mocks.increment.mockResolvedValue(count);
      const processor = await getPollProcessor();

      await expect(processor?.(job)).rejects.toBe(rejection);
      expect(mocks.increment).toHaveBeenCalledWith(outLink.shareId, bindingId);
      if (count < 5) {
        expect(mocks.updateOne).not.toHaveBeenCalled();
      } else {
        expect(mocks.updateOne).toHaveBeenCalledWith(currentConnectionFilter, {
          $set: { 'app.status': 'error', 'app.lastError': 'request_failed' }
        });
      }
    }
  );

  it('uses the atomic cache increment for API failures', async () => {
    mocks.getUpdates.mockResolvedValue({ ret: 500, errmsg: 'upstream failed' });
    mocks.increment.mockResolvedValue(2);
    const processor = await getPollProcessor();

    await expect(processor?.(job)).rejects.toThrow('getUpdates API error: ret=500');
    expect(mocks.increment).toHaveBeenCalledWith('share-1', bindingId);
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('resets the counter after a successful poll', async () => {
    mocks.getUpdates.mockResolvedValue({ ret: 0, msgs: [], get_updates_buf: 'next-cursor' });
    const processor = await getPollProcessor();

    await expect(processor?.(job)).resolves.toBe('idle');
    expect(mocks.reset).toHaveBeenCalledWith('share-1', bindingId);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { ...currentConnectionFilter, 'app.syncBuf': 'cursor' },
      { $set: { 'app.syncBuf': 'next-cursor' } }
    );
  });

  it('continues after a local long-poll timeout without changing the failure count', async () => {
    mocks.getUpdates.mockResolvedValue(undefined);
    const processor = await getPollProcessor();

    await expect(processor?.(job)).resolves.toBe('idle');
    expect(mocks.increment).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('ignores a poll response that arrives after the worker hard deadline', async () => {
    vi.useFakeTimers();
    try {
      const response = Promise.withResolvers<{ ret: number; get_updates_buf: string }>();
      const requestStarted = Promise.withResolvers<void>();
      mocks.getUpdates.mockImplementation(() => {
        requestStarted.resolve();
        return response.promise;
      });
      const processor = await getPollProcessor();
      const poll = processor?.(job);
      await requestStarted.promise;

      const timedOut = expect(poll).rejects.toThrow('Poll job hard timeout');
      await vi.advanceTimersByTimeAsync(120_000);
      await timedOut;
      response.resolve({ ret: 0, get_updates_buf: 'late-cursor' });
      await vi.advanceTimersByTimeAsync(0);

      expect(mocks.reset).not.toHaveBeenCalled();
      expect(mocks.updateOne).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('isolates a failure that arrives after the channel has been rebound', async () => {
    const response = Promise.withResolvers<never>();
    const requestStarted = Promise.withResolvers<void>();
    const reboundId = '7526d2d7-a6c2-4327-89ed-bb77f3318515';
    const failure = new Error('transport unavailable');
    mocks.getUpdates
      .mockImplementationOnce(() => {
        requestStarted.resolve();
        return response.promise;
      })
      .mockRejectedValueOnce(failure);
    const processor = await getPollProcessor();
    const oldPoll = processor?.(job);
    await requestStarted.promise;

    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...outLink, app: { ...outLink.app, bindingId: reboundId } })
    });
    const lateFailure = expect(oldPoll).rejects.toBe(failure);
    response.reject(failure);
    await lateFailure;
    await expect(processor?.(job)).rejects.toBe(failure);

    expect(mocks.increment.mock.calls).toEqual([
      [outLink.shareId, bindingId],
      [outLink.shareId, reboundId]
    ]);
  });

  it('keeps rich message items in the reply job', async () => {
    const items = [{ type: 1, text_item: { text: 'hello' } }];
    mocks.getUpdates.mockResolvedValue({
      ret: 0,
      msgs: [
        {
          message_type: 1,
          message_id: '18446744073709551615',
          from_user_id: 'user-1',
          context_token: 'context-token',
          item_list: items
        }
      ]
    });
    const processor = await getPollProcessor();

    await expect(processor?.(job)).resolves.toBe('messages');
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      {
        shareId: 'share-1',
        bindingKey: bindingId,
        userId: 'user-1',
        items,
        contextToken: 'context-token',
        lastMsgId: '18446744073709551615'
      },
      {
        jobId: `wechat-reply:share-1:${bindingId}:18446744073709551615`,
        backoff: { type: 'fixed', delay: 2000 }
      }
    );
  });

  it('clears the counter and marks the channel after the threshold', async () => {
    mocks.getUpdates.mockResolvedValue({ ret: 500, errmsg: 'upstream failed' });
    mocks.increment.mockResolvedValue(5);
    const processor = await getPollProcessor();

    await expect(processor?.(job)).rejects.toThrow('getUpdates API error: ret=500');
    expect(mocks.updateOne).toHaveBeenCalledWith(currentConnectionFilter, {
      $set: { 'app.status': 'error', 'app.lastError': 'upstream failed' }
    });
    expect(mocks.clear).toHaveBeenCalledWith('share-1', bindingId);
  });
});
