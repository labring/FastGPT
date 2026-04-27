import { describe, test, expect, beforeEach } from 'vitest';
import {
  setAgentRuntimeStop,
  delAgentRuntimeStopSign,
  shouldWorkflowStop,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';

describe('Workflow Status Redis Functions', () => {
  const testAppId = 'test_app_123';
  const testChatId = 'test_chat_456';

  beforeEach(async () => {
    // 清理测试数据
    await delAgentRuntimeStopSign({ appId: testAppId, chatId: testChatId });
  });

  test('should set stopping sign', async () => {
    await setAgentRuntimeStop({
      appId: testAppId,
      chatId: testChatId
    });
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(true);
  });

  test('should return false for non-existent status', async () => {
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(false);
  });

  test('should detect stopping status', async () => {
    await setAgentRuntimeStop({
      appId: testAppId,
      chatId: testChatId
    });
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(true);
  });

  test('should return false after deleting stop sign', async () => {
    await setAgentRuntimeStop({
      appId: testAppId,
      chatId: testChatId
    });
    await delAgentRuntimeStopSign({
      appId: testAppId,
      chatId: testChatId
    });
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(false);
  });

  test('should wait for workflow completion', async () => {
    // 设置初始停止标志
    await setAgentRuntimeStop({
      appId: testAppId,
      chatId: testChatId
    });

    // 模拟异步完成(删除停止标志)
    setTimeout(async () => {
      await delAgentRuntimeStopSign({ appId: testAppId, chatId: testChatId });
    }, 500);

    // 等待完成，waitForWorkflowComplete 现在是 void 返回
    await waitForWorkflowComplete({
      appId: testAppId,
      chatId: testChatId,
      timeout: 2000
    });

    // 验证停止标志已被删除
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(false);
  });

  test('should timeout when waiting too long', async () => {
    await setAgentRuntimeStop({
      appId: testAppId,
      chatId: testChatId
    });

    // 等待超时（不删除标志）
    await waitForWorkflowComplete({
      appId: testAppId,
      chatId: testChatId,
      timeout: 100
    });

    // 验证停止标志仍然存在
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(true);
  });

  test('should delete workflow stop sign', async () => {
    await setAgentRuntimeStop({
      appId: testAppId,
      chatId: testChatId
    });
    await delAgentRuntimeStopSign({ appId: testAppId, chatId: testChatId });
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(false);
  });

  test('should handle concurrent stop sign operations', async () => {
    // 并发设置停止标志
    await Promise.all([
      setAgentRuntimeStop({ appId: testAppId, chatId: testChatId }),
      setAgentRuntimeStop({ appId: testAppId, chatId: testChatId })
    ]);

    // 停止标志应该存在
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(true);
  });
});
