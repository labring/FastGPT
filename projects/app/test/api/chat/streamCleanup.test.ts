import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authChatCompletionHeaderRequest: vi.fn(),
  preChatRound: vi.fn(),
  dispatchWorkFlow: vi.fn(),
  finalizeChatRound: vi.fn(),
  failChatRound: vi.fn(),
  updateInteractiveChat: vi.fn(),
  updateChatGenerateStatus: vi.fn(),
  responseWrite: vi.fn(),
  writeStreamError: vi.fn(),
  flushResume: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@/service/support/permission/auth/chatCompletion', () => ({
  authChatCompletionHeaderRequest: mocks.authChatCompletionHeaderRequest
}));
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authChatCompletionHeaderRequest
}));
vi.mock('@fastgpt/service/core/app/resource/service', () => ({
  prepareAppWorkflowResources: vi.fn(async () => [])
}));
vi.mock('@fastgpt/service/common/api/frequencyLimit', () => ({
  LimitTypeEnum: { chat: 'chat' },
  teamFrequencyLimit: vi.fn(async () => true)
}));
vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn(async () => ({
    versionId: 'version-1',
    nodes: [],
    edges: [],
    chatConfig: {},
    resources: []
  }))
}));
vi.mock('@fastgpt/service/core/workflow/utils/fileLimits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/workflow/utils/fileLimits')>()),
  getWorkflowFileLimits: vi.fn(async () => ({ maxFileAmount: 5, maxBytesPerFile: 1024 }))
}));
vi.mock('@fastgpt/service/support/user/team/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/user/team/utils')>()),
  getRunningUserInfoByTmbId: vi.fn(async () => ({}))
}));
vi.mock('@fastgpt/service/core/chat/utils/prepare', () => ({
  preChatRound: mocks.preChatRound
}));
vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  finalizeChatRound: mocks.finalizeChatRound,
  failChatRound: mocks.failChatRound,
  updateInteractiveChat: mocks.updateInteractiveChat
}));
vi.mock('@fastgpt/service/core/chat/chatGenerateStatus', () => ({
  updateChatGenerateStatus: mocks.updateChatGenerateStatus
}));
vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: mocks.dispatchWorkFlow
}));
vi.mock('@fastgpt/service/core/chat/title', () => ({
  createGeneratedChatTitleSender: () => ({
    start: vi.fn(async () => undefined),
    send: vi.fn(async () => ''),
    close: vi.fn()
  })
}));
vi.mock('@fastgpt/service/core/workflow/utils/streamResponseContext', () => ({
  createWorkflowStreamResponseContext: vi.fn(async () => ({
    responseWrite: mocks.responseWrite,
    writeStreamError: mocks.writeStreamError,
    flushResume: mocks.flushResume
  }))
}));

import completionsHandler from '@/pages/api/v2/chat/completions';
import chatTestHandler from '@/pages/api/core/chat/chatTest';

describe.each([
  { name: 'v2 completions', handler: completionsHandler, supportsNonStream: true },
  { name: 'workflow chatTest', handler: chatTestHandler, supportsNonStream: false }
])('$name stream cleanup', ({ handler, supportsNonStream }) => {
  const appId = '67f4c91c79a4d61b1f116b2a';
  const preparedRound = {
    chatId: 'chat-1',
    responseChatItemId: 'response-1',
    shouldPersistChatRound: true,
    shouldFinalizePreparedRound: true
  };

  const runRequest = (stream = true) => {
    const response = { end: vi.fn(), json: vi.fn(), status: vi.fn().mockReturnThis() };
    const request = {
      headers: {},
      body: {
        appId,
        chatId: preparedRound.chatId,
        responseChatItemId: preparedRound.responseChatItemId,
        messages: [{ role: 'user', content: 'Hello' }],
        nodes: [],
        edges: [],
        chatConfig: {},
        appName: 'Chat',
        stream
      }
    } as NextApiRequest;

    return {
      response,
      result: handler(request, response as unknown as NextApiResponse)
    };
  };

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.authChatCompletionHeaderRequest.mockResolvedValue({
      teamId: '67f4c91c79a4d61b1f116b2b',
      tmbId: '67f4c91c79a4d61b1f116b2c',
      authType: 'apikey',
      app: { _id: appId, name: 'Chat', type: AppTypeEnum.workflow }
    });
    mocks.preChatRound.mockResolvedValue({ ...preparedRound });
    mocks.dispatchWorkFlow.mockResolvedValue({
      flowUsages: [],
      assistantResponses: [],
      newVariables: {},
      durationSeconds: 1,
      flatNodeResponses: []
    });
    mocks.flushResume.mockResolvedValue(undefined);
  });

  it('waits for queued stream events before ending a successful response', async () => {
    const started = Promise.withResolvers<void>();
    const flushed = Promise.withResolvers<void>();
    mocks.flushResume.mockImplementationOnce(() => {
      started.resolve();
      return flushed.promise;
    });

    const { response, result } = runRequest();
    await started.promise;
    expect(response.end).not.toHaveBeenCalled();
    flushed.resolve();
    await result;

    expect(mocks.finalizeChatRound).toHaveBeenCalledOnce();
    expect(mocks.flushResume).toHaveBeenCalledOnce();
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('flushes once after reporting a workflow error', async () => {
    const error = new Error('Workflow failed');
    mocks.dispatchWorkFlow.mockRejectedValueOnce(error);

    const { response, result } = runRequest();
    await result;

    expect(mocks.writeStreamError).toHaveBeenCalledWith(error);
    expect(mocks.flushResume).toHaveBeenCalledOnce();
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('cleans up and preserves errors after interactive status persistence fails', async () => {
    const persistenceError = new Error('Failure persistence failed');
    mocks.preChatRound.mockResolvedValueOnce({
      ...preparedRound,
      shouldFinalizePreparedRound: false
    });
    mocks.dispatchWorkFlow.mockRejectedValueOnce(new Error('Workflow failed'));
    mocks.updateChatGenerateStatus.mockRejectedValueOnce(persistenceError);

    const { response, result } = runRequest();
    await expect(result).rejects.toBe(persistenceError);

    expect(mocks.updateChatGenerateStatus).toHaveBeenCalledOnce();
    expect(mocks.flushResume).toHaveBeenCalledOnce();
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('ends a rejected stream even when no stream context was created', async () => {
    mocks.authChatCompletionHeaderRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const { response, result } = runRequest();
    await result;

    expect(mocks.flushResume).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalledOnce();
  });

  if (supportsNonStream) {
    it('keeps non-streaming responses outside stream cleanup', async () => {
      const { response, result } = runRequest(false);
      await result;

      expect(response.json).toHaveBeenCalledOnce();
      expect(mocks.flushResume).not.toHaveBeenCalled();
      expect(response.end).not.toHaveBeenCalled();
    });
  }
});
