import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  WorkflowStopSignalCache,
  getWorkflowStopSignalKey,
  WORKFLOW_STOP_SIGNAL_TTL_SECONDS
} from '@fastgpt/dal/redis/caches/workflowStopSignal';

const params = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  chatId: 'chat-1'
};

describe('WorkflowStopSignalCache', () => {
  const logger = { warn: vi.fn() };
  const redis = {
    delete: vi.fn(),
    evalScript: vi.fn(),
    get: vi.fn(),
    set: vi.fn()
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    redis.delete.mockResolvedValue(true);
    redis.evalScript.mockResolvedValue(1);
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue(undefined);
  });

  it('builds the historical logical key with source type isolation', () => {
    expect(getWorkflowStopSignalKey(params)).toBe('agent_runtime_stopping:app:app-1:chat-1');
    expect(getWorkflowStopSignalKey({ ...params, sourceType: ChatSourceTypeEnum.skillEdit })).toBe(
      'agent_runtime_stopping:skillEdit:app-1:chat-1'
    );
  });

  it('normalizes Mongo source IDs like the generation lease', () => {
    expect(getWorkflowStopSignalKey({ ...params, sourceId: '507F1F77BCF86CD799439012' })).toBe(
      'agent_runtime_stopping:app:507f1f77bcf86cd799439012:chat-1'
    );
  });

  it('writes a new stop version for each request with a one-minute TTL', async () => {
    const cache = new WorkflowStopSignalCache({ redis, logger });

    await cache.set(params);
    await cache.set(params);

    expect(redis.set).toHaveBeenCalledWith({
      key: 'agent_runtime_stopping:app:app-1:chat-1',
      value: expect.any(String),
      ttlMs: WORKFLOW_STOP_SIGNAL_TTL_SECONDS * 1000
    });
    expect(redis.set.mock.calls[0][0].value).not.toBe(redis.set.mock.calls[1][0].value);
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

  it('conditionally clears only the observed stop version without a separate read', async () => {
    const cache = new WorkflowStopSignalCache({ redis, logger });
    await cache.clear(params, 'observed-stop');
    expect(redis.evalScript).toHaveBeenCalledWith({
      script: expect.any(String),
      keys: ['agent_runtime_stopping:app:app-1:chat-1'],
      args: ['observed-stop']
    });
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.delete).not.toHaveBeenCalled();
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
