import * as debugChatApi from '@/pages/api/core/ai/skill/debugChat';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import * as responseModule from '@fastgpt/service/common/response';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getEditDebugSandboxId } from '@fastgpt/service/core/ai/skill/edit/config';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';

const debugChatMocks = vi.hoisted(() => ({
  runAuxiliaryGeneration: vi.fn(),
  createSkillDebugProcessor: vi.fn(),
  skillDebugProcessor: vi.fn(),
  preChatRound: vi.fn(),
  finalizeChatRound: vi.fn(),
  failChatRound: vi.fn(),
  updateInteractiveChat: vi.fn(),
  updateChatGenerateStatus: vi.fn(),
  responseWrite: vi.fn(),
  flushResume: vi.fn(),
  writeError: vi.fn(),
  recordNodeResponses: vi.fn(),
  closeNodeResponseWriter: vi.fn(),
  getNodeResponseSummary: vi.fn(),
  getPreviewUrl: vi.fn(),
  getUserChatInfo: vi.fn(),
  getChatItems: vi.fn()
}));

vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/env')>();

  return {
    ...actual,
    serviceEnv: {
      ...actual.serviceEnv,
      AGENT_SANDBOX_PROVIDER: 'opensandbox',
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://mock-opensandbox.local',
      AGENT_SANDBOX_OPENSANDBOX_API_KEY: 'mock-opensandbox-api-key',
      AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker',
      AGENT_SANDBOX_OPENSANDBOX_IMAGE: 'runtime-image:test',
      AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY: false
    }
  };
});

vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/auxiliaryGeneration')>();
  return {
    ...actual,
    runAuxiliaryGeneration: debugChatMocks.runAuxiliaryGeneration
  };
});

vi.mock('@fastgpt/service/core/ai/skill/debugChat/processor', () => ({
  createSkillDebugProcessor: debugChatMocks.createSkillDebugProcessor
}));

vi.mock('@fastgpt/service/core/chat/utils/prepare', () => ({
  preChatRound: debugChatMocks.preChatRound
}));

vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  finalizeChatRound: debugChatMocks.finalizeChatRound,
  failChatRound: debugChatMocks.failChatRound,
  updateInteractiveChat: debugChatMocks.updateInteractiveChat
}));

vi.mock('@fastgpt/service/core/chat/chatGenerateStatus', () => ({
  updateChatGenerateStatus: debugChatMocks.updateChatGenerateStatus
}));

vi.mock('@fastgpt/service/core/chat/nodeResponseStorage', () => ({
  WorkflowNodeResponseWriter: vi.fn().mockImplementation(function () {
    return {
      record: debugChatMocks.recordNodeResponses,
      close: debugChatMocks.closeNodeResponseWriter,
      getSummary: debugChatMocks.getNodeResponseSummary
    };
  })
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  createChatFilePreviewUrlGetter: () => debugChatMocks.getPreviewUrl
}));

vi.mock('@fastgpt/service/support/user/team/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/support/user/team/utils')>();
  return {
    ...actual,
    getUserChatInfo: debugChatMocks.getUserChatInfo
  };
});

vi.mock('@fastgpt/service/core/chat/controller', () => ({
  getChatItems: debugChatMocks.getChatItems
}));

describe('skill debug chat API', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;

  const getSseErrResMock = () => vi.mocked(responseModule.sseErrRes);
  const createRunningSandbox = () =>
    MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: getEditDebugSandboxId(skillId),
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      userId: ChatSourceTypeEnum.skillEdit,
      status: 'running',
      teamId: testUser.teamId,
      image: { repository: 'test-image', tag: 'latest' }
    });

  beforeEach(async () => {
    testUser = await getUser(`debug-chat-user-${getNanoid(6)}`);
    vi.clearAllMocks();

    debugChatMocks.preChatRound.mockImplementation(async ({ userContent }) => {
      userContent.value.forEach((item: any) => {
        if (item.file?.key) item.file.url = '';
      });
      return {
        chatId: 'prepared-debug-chat-id',
        responseChatItemId: 'prepared-debug-response-id',
        shouldPersistChatRound: true,
        shouldFinalizePreparedRound: true
      };
    });
    debugChatMocks.createSkillDebugProcessor.mockReturnValue(debugChatMocks.skillDebugProcessor);
    debugChatMocks.getUserChatInfo.mockResolvedValue({
      timezone: 'America/New_York',
      externalProvider: {
        openaiAccount: {
          baseUrl: 'https://provider.example/v1',
          key: 'provider-key'
        }
      }
    });
    debugChatMocks.getChatItems.mockResolvedValue({ histories: [] });
    debugChatMocks.getPreviewUrl.mockImplementation(async (key: string) => `/preview/${key}`);
    debugChatMocks.getNodeResponseSummary.mockReturnValue({
      citeCollectionIds: [],
      errorCount: 0,
      totalPoints: 2
    });
    debugChatMocks.runAuxiliaryGeneration.mockImplementation(
      async ({ onStreamContextReady, onBeforeStreamDone }) => {
        const streamContext = {
          write: debugChatMocks.responseWrite,
          writeDone: () => debugChatMocks.responseWrite({ data: '[DONE]' }),
          writeError: debugChatMocks.writeError,
          flushResume: debugChatMocks.flushResume
        };
        onStreamContextReady?.(streamContext);
        const result = {
          aiResponse: [{ text: { content: 'debug answer' } }],
          nodeResponses: [{ id: 'node-1', nodeId: 'node-1' }],
          memories: { 'agentLoopMemory-skill-debug-agent': { providerState: 'state' } }
        };
        await onBeforeStreamDone?.({ result, durationSeconds: 1.2 });
        streamContext.writeDone();
        return { ...result, durationSeconds: 1.2, streamContext };
      }
    );

    const skill = await MongoAgentSkills.create({
      name: 'Test Debug Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    skillId = String(skill._id);
  });

  it('rejects a missing edit-debug sandbox', async () => {
    await Call(debugChatApi.default, {
      auth: testUser,
      cookies: {},
      headers: { origin: 'http://test.local' },
      body: {
        skillId,
        chatId: getNanoid(),
        responseChatItemId: getNanoid(),
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }]
      }
    });

    expect(getSseErrResMock()).toHaveBeenCalled();
    expect(getSseErrResMock().mock.calls[0][1]?.message).toMatch(/sandbox/i);
    expect(debugChatMocks.runAuxiliaryGeneration).not.toHaveBeenCalled();
  });

  it('rejects read-only collaborators before generation', async () => {
    const reader = await getUser(`debug-chat-reader-${getNanoid(6)}`, testUser.teamId);
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: testUser.teamId,
      resourceId: skillId,
      tmbId: reader.tmbId,
      permission: ReadPermissionVal
    });
    await createRunningSandbox();

    await Call(debugChatApi.default, {
      auth: reader,
      cookies: {},
      headers: { origin: 'http://test.local' },
      body: {
        skillId,
        chatId: getNanoid(),
        responseChatItemId: getNanoid(),
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }]
      }
    });

    const permissionError = getSseErrResMock().mock.calls[0][1];
    expect(permissionError?.message ?? permissionError).toBe(SkillErrEnum.unAuthSkill);
    expect(debugChatMocks.preChatRound).not.toHaveBeenCalled();
    expect(debugChatMocks.runAuxiliaryGeneration).not.toHaveBeenCalled();
  });

  it('runs the auxiliary lifecycle and persists before the done event', async () => {
    await createRunningSandbox();

    await Call(debugChatApi.default, {
      auth: testUser,
      cookies: {},
      headers: { origin: 'http://test.local' },
      body: {
        skillId,
        chatId: 'debug-chat-id',
        responseChatItemId: 'client-response-id',
        model: 'gpt-4o',
        systemPrompt: 'Use {{@sandbox_read_file@}}.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'file_url',
                name: 'guide.pdf',
                url: '',
                key: 'file-key-1'
              },
              { type: 'text', text: 'summarize this' }
            ]
          }
        ]
      }
    });

    expect(debugChatMocks.preChatRound).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatId: 'debug-chat-id',
        source: ChatSourceEnum.test,
        responseChatItemId: 'client-response-id'
      })
    );
    expect(debugChatMocks.createSkillDebugProcessor).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId,
        responseChatItemId: 'prepared-debug-response-id',
        isInteractiveResume: false,
        prepareActions: undefined
      })
    );
    expect(debugChatMocks.runAuxiliaryGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatId: 'prepared-debug-chat-id',
        query: 'summarize this',
        histories: [],
        processor: debugChatMocks.skillDebugProcessor,
        data: expect.objectContaining({
          currentUserValue: expect.arrayContaining([
            expect.objectContaining({
              file: expect.objectContaining({ url: '/preview/file-key-1' })
            })
          ]),
          userKey: {
            baseUrl: 'https://provider.example/v1',
            key: 'provider-key'
          }
        })
      })
    );
    expect(debugChatMocks.recordNodeResponses).toHaveBeenCalledWith([
      { id: 'node-1', nodeId: 'node-1' }
    ]);
    expect(debugChatMocks.finalizeChatRound).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'prepared-debug-chat-id',
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        aiContent: expect.objectContaining({
          dataId: 'prepared-debug-response-id',
          obj: ChatRoleEnum.AI,
          value: [{ text: { content: 'debug answer' } }]
        })
      })
    );
    const doneCall = debugChatMocks.responseWrite.mock.calls.find(
      ([payload]) => payload.data === '[DONE]'
    );
    expect(doneCall).toBeDefined();
    expect(debugChatMocks.finalizeChatRound.mock.invocationCallOrder[0]).toBeLessThan(
      debugChatMocks.responseWrite.mock.invocationCallOrder.at(-1)!
    );
  });

  it('reuses an ask interactive usage and updates the existing chat', async () => {
    const interactive = {
      type: 'agentAsk' as const,
      askId: 'ask-1',
      usageId: 'usage-1',
      entryNodeIds: [],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        description: 'Need a choice',
        questions: [
          {
            question: 'Choose one',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' }
            ],
            answer: ''
          }
        ]
      }
    };
    debugChatMocks.getChatItems.mockResolvedValueOnce({
      histories: [
        {
          dataId: 'previous-ai',
          obj: ChatRoleEnum.AI,
          value: [{ interactive }]
        }
      ]
    });
    await createRunningSandbox();

    await Call(debugChatApi.default, {
      auth: testUser,
      cookies: {},
      headers: { origin: 'http://test.local' },
      body: {
        skillId,
        chatId: 'debug-chat-id',
        responseChatItemId: 'client-response-id',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'A' }]
      }
    });

    expect(debugChatMocks.createSkillDebugProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ isInteractiveResume: true })
    );
    expect(debugChatMocks.runAuxiliaryGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ usageId: 'usage-1' })
    );
    expect(debugChatMocks.updateInteractiveChat).toHaveBeenCalledWith(
      expect.objectContaining({ interactive })
    );
    expect(debugChatMocks.finalizeChatRound).not.toHaveBeenCalled();
  });

  it('marks the prepared chat round failed when generation throws', async () => {
    debugChatMocks.runAuxiliaryGeneration.mockImplementationOnce(
      async ({ onStreamContextReady }) => {
        onStreamContextReady?.({
          write: debugChatMocks.responseWrite,
          writeDone: vi.fn(),
          writeError: debugChatMocks.writeError,
          flushResume: debugChatMocks.flushResume
        });
        throw new Error('generation failed');
      }
    );
    await createRunningSandbox();

    await Call(debugChatApi.default, {
      auth: testUser,
      cookies: {},
      headers: { origin: 'http://test.local' },
      body: {
        skillId,
        chatId: 'debug-chat-id',
        responseChatItemId: 'client-response-id',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }]
      }
    });

    expect(debugChatMocks.failChatRound).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'prepared-debug-chat-id',
      responseChatItemId: 'prepared-debug-response-id',
      error: expect.objectContaining({ message: 'generation failed' })
    });
    expect(debugChatMocks.writeError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'generation failed' })
    );
    expect(debugChatMocks.flushResume).toHaveBeenCalled();
  });
});
