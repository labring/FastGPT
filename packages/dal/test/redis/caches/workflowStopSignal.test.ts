import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  WorkflowStopSignalCache,
  getWorkflowStopSignalKey,
  WORKFLOW_STOP_SIGNAL_TTL_SECONDS
} from '@fastgpt/dal/redis/caches';

const params = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  chatId: 'chat-1'
};

describe('WorkflowStopSignalCache', () => {
  const logger = { warn: vi.fn() };
  const redis = {
    delete: vi.fn(),
    get: vi.fn(),
    set: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    redis.delete.mockResolvedValue(true);
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue(undefined);
  });

  it('builds the historical logical key with source type isolation', () => {
    expect(getWorkflowStopSignalKey(params)).toBe('agent_runtime_stopping:app:app-1:chat-1');
    expect(getWorkflowStopSignalKey({ ...params, sourceType: ChatSourceTypeEnum.skillEdit })).toBe(
      'agent_runtime_stopping:skillEdit:app-1:chat-1'
    );
  });

  it('writes the historical value with a one-minute TTL', async () => {
    const cache = new WorkflowStopSignalCache({ redis, logger });

    await cache.set(params);

    expect(redis.set).toHaveBeenCalledWith({
      key: 'agent_runtime_stopping:app:app-1:chat-1',
      value: '1',
      ttlMs: WORKFLOW_STOP_SIGNAL_TTL_SECONDS * 1000
    });
  });

  it('reads present and missing stop signals', async () => {
    const cache = new WorkflowStopSignalCache({ redis, logger });

    redis.get.mockResolvedValueOnce('1').mockResolvedValueOnce(null);
    await expect(cache.isStopping(params)).resolves.toBe(true);
    await expect(cache.isStopping(params)).resolves.toBe(false);
    expect(redis.get).toHaveBeenNthCalledWith(1, 'agent_runtime_stopping:app:app-1:chat-1');
  });

  it('fails open on read errors and keeps clear best-effort', async () => {
    const readError = new Error('read failed');
    const clearError = new Error('clear failed');
    redis.get.mockRejectedValue(readError);
    redis.delete.mockRejectedValue(clearError);
    const cache = new WorkflowStopSignalCache({ redis, logger });

    await expect(cache.isStopping(params)).resolves.toBe(false);
    await expect(cache.clear(params)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenNthCalledWith(
      1,
      'Workflow stop signal read failed open',
      expect.objectContaining({ key: 'agent_runtime_stopping:app:app-1:chat-1', error: readError })
    );
    expect(logger.warn).toHaveBeenNthCalledWith(
      2,
      'Workflow stop signal clear failed',
      expect.objectContaining({ key: 'agent_runtime_stopping:app:app-1:chat-1', error: clearError })
    );
  });

  it('propagates write errors so stop requests fail closed', async () => {
    const error = new Error('write failed');
    redis.set.mockRejectedValue(error);
    const cache = new WorkflowStopSignalCache({ redis, logger });

    await expect(cache.set(params)).rejects.toBe(error);
  });

  it.each([
    { ...params, sourceId: '' },
    { ...params, chatId: '' },
    { ...params, sourceType: '' }
  ])('rejects empty stop signal segments %#', (invalidParams) => {
    expect(() => getWorkflowStopSignalKey(invalidParams as any)).toThrow(
      'sourceType, sourceId and chatId must be non-empty strings'
    );
  });
});
