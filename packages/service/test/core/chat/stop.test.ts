import { describe, test, expect, beforeEach, afterEach, it, vi } from 'vitest';
import { WorkflowStopSignalCache } from '@fastgpt/dal/redis/caches/workflowStopSignal';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  createChatStopController,
  setAgentRuntimeStop,
  delAgentRuntimeStopSign,
  shouldWorkflowStop,
  waitForWorkflowComplete,
  getRuntimeStatusKey
} from '@fastgpt/service/core/chat/stop';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('createChatStopController', () => {
  const params = { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1', chatId: 'chat-1' };
  const controllers: Awaited<ReturnType<typeof createChatStopController>>[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(WorkflowStopSignalCache.prototype, 'isStopping').mockResolvedValue(false);
    vi.spyOn(WorkflowStopSignalCache.prototype, 'clear').mockResolvedValue(undefined);
  });
  afterEach(async () => {
    for (const controller of controllers.splice(0)) await controller.cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('preserves a stop requested during preparation without clearing it on startup', async () => {
    const read = vi.mocked(WorkflowStopSignalCache.prototype.isStopping).mockResolvedValue(true);
    const controller = await createChatStopController(params);
    controllers.push(controller);

    expect(controller.checkIsStopping()).toBe(true);
    expect(WorkflowStopSignalCache.prototype.clear).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(read).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('serializes slow reads and latches stop until cleanup', async () => {
    const pending = Promise.withResolvers<boolean>();
    const read = vi
      .mocked(WorkflowStopSignalCache.prototype.isStopping)
      .mockResolvedValueOnce(false)
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(true);
    const controller = await createChatStopController(params);
    controllers.push(controller);

    await vi.advanceTimersByTimeAsync(500);
    expect(read).toHaveBeenCalledTimes(2);
    expect(controller.checkIsStopping()).toBe(false);
    pending.resolve(false);
    await pending.promise;
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.checkIsStopping()).toBe(true);

    read.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(controller.checkIsStopping()).toBe(true);
    expect(read).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up once and ignores a read that finishes after disposal', async () => {
    const pending = Promise.withResolvers<boolean>();
    const read = vi
      .mocked(WorkflowStopSignalCache.prototype.isStopping)
      .mockResolvedValueOnce(false)
      .mockImplementationOnce(() => pending.promise);
    const controller = await createChatStopController(params);
    controllers.push(controller);
    await vi.advanceTimersByTimeAsync(100);

    await Promise.all([controller.cleanup(), controller.cleanup()]);
    pending.resolve(true);
    await pending.promise;
    await vi.advanceTimersByTimeAsync(500);

    expect(controller.checkIsStopping()).toBe(false);
    expect(WorkflowStopSignalCache.prototype.clear).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Workflow Status Redis Functions', () => {
  const testAppId = 'test_app_123';
  const testChatId = 'test_chat_456';
  const statusParams = {
    sourceType: ChatSourceTypeEnum.app,
    sourceId: testAppId,
    chatId: testChatId
  };

  beforeEach(async () => {
    // 清理测试数据
    await delAgentRuntimeStopSign(statusParams);
  });

  test('should include source type in runtime status key', () => {
    expect(getRuntimeStatusKey(statusParams)).toBe(
      `agent_runtime_stopping:${ChatSourceTypeEnum.app}:${testAppId}:${testChatId}`
    );

    expect(
      getRuntimeStatusKey({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: testAppId,
        chatId: testChatId
      })
    ).toBe(`agent_runtime_stopping:${ChatSourceTypeEnum.skillEdit}:${testAppId}:${testChatId}`);
  });

  test('should set stopping sign', async () => {
    await setAgentRuntimeStop(statusParams);
    const shouldStop = await shouldWorkflowStop(statusParams);
    expect(shouldStop).toBe(true);
  });

  test('should return false for non-existent status', async () => {
    const shouldStop = await shouldWorkflowStop(statusParams);
    expect(shouldStop).toBe(false);
  });

  test('should detect stopping status', async () => {
    await setAgentRuntimeStop(statusParams);
    const shouldStop = await shouldWorkflowStop(statusParams);
    expect(shouldStop).toBe(true);
  });

  test('should return false after deleting stop sign', async () => {
    await setAgentRuntimeStop(statusParams);
    await delAgentRuntimeStopSign(statusParams);
    const shouldStop = await shouldWorkflowStop(statusParams);
    expect(shouldStop).toBe(false);
  });

  test('should wait for workflow completion', async () => {
    // 设置初始停止标志
    await setAgentRuntimeStop(statusParams);

    // 模拟异步完成(删除停止标志)
    setTimeout(async () => {
      await delAgentRuntimeStopSign(statusParams);
    }, 500);

    // 等待完成，waitForWorkflowComplete 现在是 void 返回
    await waitForWorkflowComplete({
      ...statusParams,
      timeout: 2000
    });

    // 验证停止标志已被删除
    const shouldStop = await shouldWorkflowStop(statusParams);
    expect(shouldStop).toBe(false);
  });

  test('should timeout when waiting too long', async () => {
    await setAgentRuntimeStop(statusParams);

    // 等待超时（不删除标志）
    await waitForWorkflowComplete({
      ...statusParams,
      timeout: 100
    });

    // 验证停止标志仍然存在
    const shouldStop = await shouldWorkflowStop(statusParams);
    expect(shouldStop).toBe(true);
  });

  test('should delete workflow stop sign', async () => {
    await setAgentRuntimeStop(statusParams);
    await delAgentRuntimeStopSign(statusParams);
    const shouldStop = await shouldWorkflowStop(statusParams);
    expect(shouldStop).toBe(false);
  });

  test('should handle concurrent stop sign operations', async () => {
    // 并发设置停止标志
    await Promise.all([setAgentRuntimeStop(statusParams), setAgentRuntimeStop(statusParams)]);

    // 停止标志应该存在
    const shouldStop = await shouldWorkflowStop(statusParams);
    expect(shouldStop).toBe(true);
  });
});

describe('getErrText upgraded logic', () => {
  test('should prioritize system_error_text', () => {
    const errorObj = {
      system_error_text: '虚拟机环境缺失，请先配置虚拟机',
      errorText: 'Some other error',
      message: 'Unused message'
    };
    expect(getErrText(errorObj)).toBe('虚拟机环境缺失，请先配置虚拟机');
  });

  test('should fallback to errorText', () => {
    const errorObj = {
      errorText: 'Sandbox startup error',
      message: 'Unused message'
    };
    expect(getErrText(errorObj)).toBe('Sandbox startup error');
  });

  test('should fallback to message', () => {
    const errorObj = {
      message: 'Standard exception message'
    };
    expect(getErrText(errorObj)).toBe('Standard exception message');
  });

  test('should fallback to getErrText with raw object', () => {
    const errorObj = {
      status: 500
    };
    expect(getErrText(errorObj)).toBe('');
  });

  test('should handle plain string', () => {
    expect(getErrText('Plain string error')).toBe('Plain string error');
  });

  test('should recursively resolve nested error object', () => {
    const errorObj = {
      error: {
        system_error_text: 'Nested VM initialization failed'
      }
    };
    expect(getErrText(errorObj)).toBe('Nested VM initialization failed');
  });
});
