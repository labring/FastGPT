import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getLatestWorkflowBuilderChatId,
  clearWorkflowBuilderChatHistory
} from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/api';

const mocks = vi.hoisted(() => ({
  batchDeleteChatHistories: vi.fn(),
  getChatHistories: vi.fn(),
  POST: vi.fn()
}));

vi.mock('@/web/core/chat/history/api', () => ({
  batchDeleteChatHistories: mocks.batchDeleteChatHistories,
  getChatHistories: mocks.getChatHistories
}));
vi.mock('@/web/common/api/request', () => ({ POST: mocks.POST }));

beforeEach(() => vi.clearAllMocks());

describe('getLatestWorkflowBuilderChatId', () => {
  it('读取应用当前成员最近一次 Builder 会话', async () => {
    mocks.getChatHistories.mockResolvedValueOnce({
      list: [{ chatId: 'eval-chat-1' }],
      total: 1
    });

    await expect(getLatestWorkflowBuilderChatId('app-1')).resolves.toBe('eval-chat-1');
    expect(mocks.getChatHistories).toHaveBeenCalledWith({
      appId: 'app-1',
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      pageNum: 1,
      pageSize: 1
    });
  });

  it('应用没有 Builder 历史时返回空会话 ID', async () => {
    mocks.getChatHistories.mockResolvedValueOnce({ list: [], total: 0 });

    await expect(getLatestWorkflowBuilderChatId('app-2')).resolves.toBeUndefined();
  });
});

describe('clearWorkflowBuilderChatHistory', () => {
  it('clears only the current Builder history before restarting the local chat', async () => {
    mocks.batchDeleteChatHistories.mockResolvedValueOnce(undefined);
    const clearChatRecords = vi.fn();
    const restartChat = vi.fn();

    await clearWorkflowBuilderChatHistory({
      appId: 'app-1',
      chatId: 'builder-chat-1',
      clearChatRecords,
      restartChat
    });

    expect(mocks.batchDeleteChatHistories).toHaveBeenCalledWith({
      appId: 'app-1',
      sourceType: 'workflowBuilder',
      chatIds: ['builder-chat-1']
    });
    expect(clearChatRecords).toHaveBeenCalledTimes(1);
    expect(restartChat).toHaveBeenCalledTimes(1);
  });

  it('keeps local Builder history when server deletion fails', async () => {
    mocks.batchDeleteChatHistories.mockRejectedValueOnce(new Error('delete failed'));
    const clearChatRecords = vi.fn();
    const restartChat = vi.fn();

    await expect(
      clearWorkflowBuilderChatHistory({
        appId: 'app-1',
        chatId: 'builder-chat-1',
        clearChatRecords,
        restartChat
      })
    ).rejects.toThrow('delete failed');

    expect(clearChatRecords).not.toHaveBeenCalled();
    expect(restartChat).not.toHaveBeenCalled();
  });
});
