import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { SkillDebugChatBody } from '@fastgpt/global/core/ai/skill/api';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';
import type { AgentSandboxPrepareAction } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/prepare';
import { sseErrRes } from '@fastgpt/service/common/response';
import { LimitTypeEnum } from '@fastgpt/service/common/api/frequencyLimit';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

const mocks = vi.hoisted(() => ({
  authSkill: vi.fn(),
  assertAuthModels: vi.fn(),
  getRunningSkillEditSandbox: vi.fn(),
  getChatItems: vi.fn(),
  preChatRound: vi.fn(),
  finalizeChatRound: vi.fn(),
  failChatRound: vi.fn(),
  updateInteractiveChat: vi.fn(),
  updateChatGenerateStatus: vi.fn(),
  getRunningUserInfoByTmbId: vi.fn(),
  dispatchWorkFlow: vi.fn(),
  teamFrequencyLimit: vi.fn(),
  getTeamPlanStatus: vi.fn(),
  createWorkflowStreamResponseContext: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/skill/auth', () => ({ authSkill: mocks.authSkill }));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  assertAuthModels: mocks.assertAuthModels
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime', () => ({
  getRunningSkillEditSandbox: mocks.getRunningSkillEditSandbox
}));
vi.mock('@fastgpt/service/core/chat/controller', () => ({ getChatItems: mocks.getChatItems }));
vi.mock('@fastgpt/service/core/chat/utils/prepare', () => ({ preChatRound: mocks.preChatRound }));
vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  finalizeChatRound: mocks.finalizeChatRound,
  failChatRound: mocks.failChatRound,
  updateInteractiveChat: mocks.updateInteractiveChat
}));
vi.mock('@fastgpt/service/core/chat/chatGenerateStatus', () => ({
  updateChatGenerateStatus: mocks.updateChatGenerateStatus
}));
vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getRunningUserInfoByTmbId: mocks.getRunningUserInfoByTmbId
}));
vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: mocks.dispatchWorkFlow
}));
vi.mock('@fastgpt/service/common/api/frequencyLimit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/api/frequencyLimit')>()),
  teamFrequencyLimit: mocks.teamFrequencyLimit
}));
vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  getTeamPlanStatus: mocks.getTeamPlanStatus
}));
vi.mock('@fastgpt/service/core/workflow/utils/streamResponseContext', () => ({
  createWorkflowStreamResponseContext: mocks.createWorkflowStreamResponseContext
}));

import {
  handleSkillDebugChat,
  runSkillDebugChat
} from '@fastgpt/service/core/ai/skill/debugChat/handler';

const skillId = '67f4c91c79a4d61b1f116b2a';
const req = { headers: {} } as NodeApiRequest;
const body: SkillDebugChatBody = {
  skillId,
  chatId: 'chat-1',
  modelId: 'model-1',
  messages: [{ role: 'user', content: 'Debug this skill' }]
};

/** 构造由调用方持有的传输能力，验证业务 runner 不创建或关闭 HTTP 响应。 */
const createTransport = () => ({
  checkTeamFrequencyLimit: vi.fn(async () => true),
  createStreamResponseContext: vi.fn(async () => streamContext),
  agentSandboxPrepareActions: [async (context) => context] as AgentSandboxPrepareAction[]
});

const streamContext = {
  responseWrite: vi.fn(),
  flushResume: vi.fn(async () => {}),
  writeStreamError: vi.fn()
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.authSkill.mockResolvedValue({
    teamId: 'team-1',
    tmbId: 'member-1',
    isRoot: false,
    skill: { name: 'Test skill' }
  });
  mocks.assertAuthModels.mockResolvedValue({
    handle: { findModelData: vi.fn() },
    models: [{ modelId: 'model-1' }]
  });
  mocks.getRunningSkillEditSandbox.mockResolvedValue({ sandboxId: 'sandbox-1' });
  mocks.getChatItems.mockResolvedValue({ histories: [] });
  mocks.preChatRound.mockResolvedValue({
    chatId: 'chat-1',
    responseChatItemId: 'response-1',
    shouldPersistChatRound: true,
    shouldFinalizePreparedRound: true
  });
  mocks.getRunningUserInfoByTmbId.mockResolvedValue({});
  mocks.dispatchWorkFlow.mockResolvedValue({
    flatNodeResponses: [],
    assistantResponses: [{ text: { content: 'Done' } }],
    system_memories: {},
    durationSeconds: 1,
    workflowRuntimeSummary: {}
  });
  mocks.teamFrequencyLimit.mockResolvedValue(true);
  mocks.getTeamPlanStatus.mockResolvedValue({ standard: undefined });
  mocks.createWorkflowStreamResponseContext.mockResolvedValue(streamContext);
});

describe('runSkillDebugChat', () => {
  it('uses injected transport capabilities without requiring a Node API response', async () => {
    const options = createTransport();

    await expect(runSkillDebugChat({ req, body, options })).resolves.toBeUndefined();

    expect(options.checkTeamFrequencyLimit).toHaveBeenCalledWith('team-1');
    expect(options.createStreamResponseContext).toHaveBeenCalledWith({
      teamId: 'team-1',
      skillId,
      chatId: 'chat-1'
    });
    expect(mocks.dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        res: undefined,
        agentSandboxPrepareActions: options.agentSandboxPrepareActions,
        workflowStreamResponse: streamContext.responseWrite
      })
    );
    expect(mocks.finalizeChatRound).toHaveBeenCalledOnce();
    expect(streamContext.flushResume).toHaveBeenCalledOnce();
    expect(mocks.teamFrequencyLimit).not.toHaveBeenCalled();
    expect(mocks.createWorkflowStreamResponseContext).not.toHaveBeenCalled();
  });

  it('stops before sandbox access and SSE creation when the injected limiter rejects', async () => {
    const options = createTransport();
    options.checkTeamFrequencyLimit.mockResolvedValue(false);

    await runSkillDebugChat({ req, body, options });

    expect(mocks.getRunningSkillEditSandbox).not.toHaveBeenCalled();
    expect(options.createStreamResponseContext).not.toHaveBeenCalled();
    expect(mocks.dispatchWorkFlow).not.toHaveBeenCalled();
  });

  it('keeps node usage accounting and streams the same responses that are persisted', async () => {
    mocks.assertAuthModels.mockResolvedValueOnce({
      handle: {
        findModelData: ({ model }: { model: string }) =>
          model === 'model-1' ? { modelId: model, inputPrice: 2, outputPrice: 4 } : undefined
      },
      models: [{ modelId: 'model-1' }]
    });
    const responses = [
      { nodeId: 'charged', totalPoints: 7 },
      { nodeId: 'recomputed', model: 'model-1', inputTokens: 1000, outputTokens: 500 },
      { nodeId: 'unknown', model: 'unknown', inputTokens: 1 },
      { nodeId: 'unpriced' }
    ];
    mocks.dispatchWorkFlow.mockResolvedValueOnce({
      flatNodeResponses: responses,
      assistantResponses: [{ text: { content: 'Done' } }],
      system_memories: {},
      durationSeconds: 1,
      workflowRuntimeSummary: {}
    });

    await runSkillDebugChat({ req, body, options: createTransport() });

    expect(mocks.finalizeChatRound).toHaveBeenCalledWith(
      expect.objectContaining({
        aiContent: expect.objectContaining({
          [DispatchNodeResponseKeyEnum.nodeResponse]: [
            responses[0],
            { ...responses[1], totalPoints: 4 },
            responses[2],
            responses[3]
          ]
        })
      })
    );
    expect(streamContext.responseWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nodeId: 'recomputed', totalPoints: 4 })
      })
    );
  });

  it('leaves errors before stream initialization to the calling adapter', async () => {
    const error = new Error('Permission denied');
    mocks.authSkill.mockRejectedValueOnce(error);

    await expect(runSkillDebugChat({ req, body, options: createTransport() })).rejects.toBe(error);

    expect(sseErrRes).not.toHaveBeenCalled();
    expect(streamContext.writeStreamError).not.toHaveBeenCalled();
  });

  it('records a prepared round failure when stream initialization rejects', async () => {
    const options = createTransport();
    const error = new Error('Stream initialization failed');
    options.createStreamResponseContext.mockRejectedValueOnce(error);

    await expect(runSkillDebugChat({ req, body, options })).rejects.toBe(error);

    expect(mocks.failChatRound).toHaveBeenCalledWith(expect.objectContaining({ error }));
    expect(mocks.dispatchWorkFlow).not.toHaveBeenCalled();
    expect(streamContext.writeStreamError).not.toHaveBeenCalled();
  });

  it('records a failed round and writes execution errors through the injected stream', async () => {
    const error = new Error('Workflow failed');
    mocks.dispatchWorkFlow.mockRejectedValueOnce(error);

    await runSkillDebugChat({ req, body, options: createTransport() });

    expect(mocks.failChatRound).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatId: 'chat-1',
        error
      })
    );
    expect(streamContext.writeStreamError).toHaveBeenCalledWith(error);
    expect(streamContext.flushResume).toHaveBeenCalledOnce();
    expect(sseErrRes).not.toHaveBeenCalled();
  });

  it('flushes the stream even when persisting interactive failure status rejects', async () => {
    const error = new Error('Failure status persistence failed');
    mocks.preChatRound.mockResolvedValueOnce({
      chatId: 'chat-1',
      responseChatItemId: 'response-1',
      shouldPersistChatRound: true,
      shouldFinalizePreparedRound: false
    });
    mocks.dispatchWorkFlow.mockRejectedValueOnce(new Error('Workflow failed'));
    mocks.updateChatGenerateStatus.mockRejectedValueOnce(error);

    await expect(runSkillDebugChat({ req, body, options: createTransport() })).rejects.toBe(error);

    expect(mocks.updateChatGenerateStatus).toHaveBeenCalledOnce();
    expect(streamContext.flushResume).toHaveBeenCalledOnce();
  });
});

describe('handleSkillDebugChat', () => {
  it('preserves Node rate limiting, SSE initialization and sandbox preparation actions', async () => {
    const res = { end: vi.fn() } as unknown as NodeApiResponse;
    const { agentSandboxPrepareActions } = createTransport();

    await expect(
      handleSkillDebugChat(req, res, body, { agentSandboxPrepareActions })
    ).resolves.toBe('');

    expect(mocks.teamFrequencyLimit).toHaveBeenCalledWith({
      teamId: 'team-1',
      type: LimitTypeEnum.chat,
      res
    });
    expect(mocks.createWorkflowStreamResponseContext).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        res,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatId: 'chat-1',
        responseId: 'chat-1'
      })
    );
    expect(mocks.dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({ res, agentSandboxPrepareActions })
    );
    expect(res.end).toHaveBeenCalledOnce();
  });

  it('ends a rate-limited response without starting a workflow stream', async () => {
    const response = { end: vi.fn(), writableEnded: false };
    const res = response as unknown as NodeApiResponse;
    mocks.teamFrequencyLimit.mockImplementationOnce(async () => {
      response.end();
      response.writableEnded = true;
      return false;
    });

    await expect(handleSkillDebugChat(req, res, body)).resolves.toBe('');

    expect(mocks.createWorkflowStreamResponseContext).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledOnce();
  });

  it('formats an error before stream initialization and ends the Node response', async () => {
    const res = { end: vi.fn() } as unknown as NodeApiResponse;
    const error = new Error('Permission denied');
    mocks.authSkill.mockRejectedValueOnce(error);

    await expect(handleSkillDebugChat(req, res, body)).resolves.toBe('');

    expect(sseErrRes).toHaveBeenCalledWith(res, error);
    expect(res.end).toHaveBeenCalledOnce();
  });

  it('ends the response when persisting a failed workflow also fails', async () => {
    const res = { end: vi.fn() } as unknown as NodeApiResponse;
    mocks.dispatchWorkFlow.mockRejectedValueOnce(new Error('Workflow failed'));
    const error = new Error('Failure persistence failed');
    mocks.failChatRound.mockRejectedValueOnce(error);

    await expect(handleSkillDebugChat(req, res, body)).resolves.toBe('');

    expect(sseErrRes).toHaveBeenCalledWith(res, error);
    expect(streamContext.flushResume).toHaveBeenCalledOnce();
    expect(res.end).toHaveBeenCalledOnce();
  });
});
