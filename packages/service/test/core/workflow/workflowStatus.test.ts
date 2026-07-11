import { describe, test, expect, beforeEach } from 'vitest';
import {
  setAgentRuntimeStop,
  delAgentRuntimeStopSign,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';
import {
  getAgentRuntimeStatusKey,
  shouldAgentRuntimeStop
} from '@fastgpt/service/core/ai/runtimeStatus';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

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
    expect(getAgentRuntimeStatusKey(statusParams)).toBe(
      `agent_runtime_stopping:${ChatSourceTypeEnum.app}:${testAppId}:${testChatId}`
    );

    expect(
      getAgentRuntimeStatusKey({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: testAppId,
        chatId: testChatId
      })
    ).toBe(`agent_runtime_stopping:${ChatSourceTypeEnum.skillEdit}:${testAppId}:${testChatId}`);
  });

  test('should manage the stop sign lifecycle', async () => {
    expect(await shouldAgentRuntimeStop(statusParams)).toBe(false);

    await setAgentRuntimeStop(statusParams);
    expect(await shouldAgentRuntimeStop(statusParams)).toBe(true);

    await delAgentRuntimeStopSign(statusParams);
    expect(await shouldAgentRuntimeStop(statusParams)).toBe(false);
  });

  test('should wait for workflow completion', async () => {
    await setAgentRuntimeStop(statusParams);

    setTimeout(async () => {
      await delAgentRuntimeStopSign(statusParams);
    }, 20);

    await waitForWorkflowComplete({
      ...statusParams,
      timeout: 200,
      pollInterval: 10
    });

    expect(await shouldAgentRuntimeStop(statusParams)).toBe(false);
  });

  test('should timeout when waiting too long', async () => {
    await setAgentRuntimeStop(statusParams);

    // 等待超时（不删除标志）
    await waitForWorkflowComplete({
      ...statusParams,
      timeout: 100
    });

    expect(await shouldAgentRuntimeStop(statusParams)).toBe(true);
  });
});
