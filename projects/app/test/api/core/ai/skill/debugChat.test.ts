import * as debugChatApi from '@/pages/api/core/ai/skill/debugChat';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SANDBOX_SYSTEM_PROMPT, SandboxTypeEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import * as responseModule from '@fastgpt/service/common/response';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
import { SseResponseEventEnum } from '@fastgpt/global/core/chat/stream/constants';

const debugChatMocks = vi.hoisted(() => ({
  runAuxiliaryGeneration: vi.fn(),
  runAuxiliaryGenerationAgentLoop: vi.fn(),
  prepareSkillEditRuntime: vi.fn(),
  preChatRound: vi.fn(),
  finalizeChatRound: vi.fn(),
  failChatRound: vi.fn(),
  updateInteractiveChat: vi.fn(),
  updateChatGenerateStatus: vi.fn(),
  responseWrite: vi.fn(),
  flushResume: vi.fn(),
  writeStreamError: vi.fn(),
  recordNodeResponses: vi.fn(),
  closeNodeResponseWriter: vi.fn(),
  getNodeResponseSummary: vi.fn(),
  getPreviewUrl: vi.fn(),
  getUserChatInfo: vi.fn()
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
      AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: 'runtime-image',
      AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: 'test',
      AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY: false
    }
  };
});

vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/auxiliaryGeneration')>();

  return {
    ...actual,
    runAuxiliaryGeneration: debugChatMocks.runAuxiliaryGeneration,
    runAuxiliaryGenerationAgentLoop: debugChatMocks.runAuxiliaryGenerationAgentLoop
  };
});

vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration/skillEdit/runtime', () => ({
  prepareSkillEditRuntime: debugChatMocks.prepareSkillEditRuntime
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

// ═══════════════════════════════════════════════
// describe: debugChat API handler — parameter validation
// ═══════════════════════════════════════════════
describe('debugChat handler — parameter validation', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;

  // Error written via sseErrRes can be checked through the vi.mocked spy
  const getSseErrResMock = () => vi.mocked(responseModule.sseErrRes);

  beforeEach(async () => {
    testUser = await getUser(`debug-chat-user-${getNanoid(6)}`);
    vi.clearAllMocks();
    debugChatMocks.preChatRound.mockResolvedValue({
      chatId: 'prepared-debug-chat-id',
      responseChatItemId: 'prepared-debug-response-id',
      shouldPersistChatRound: true,
      shouldFinalizePreparedRound: true
    });
    debugChatMocks.prepareSkillEditRuntime.mockResolvedValue({
      sandboxClient: {},
      currentWorkingDirectory: '/workspace',
      skillInfos: []
    });
    debugChatMocks.runAuxiliaryGenerationAgentLoop.mockResolvedValue({
      status: 'done',
      answerText: 'debug answer'
    });
    debugChatMocks.getUserChatInfo.mockResolvedValue({
      timezone: 'America/New_York',
      externalProvider: {
        openaiAccount: {
          baseUrl: 'https://provider.example/v1',
          key: 'provider-key'
        }
      }
    });
    debugChatMocks.runAuxiliaryGeneration.mockImplementation(
      async ({
        req,
        onStreamContextReady,
        onBeforeStreamDone,
        processor,
        data,
        histories,
        query,
        maxFiles,
        customPdfParse
      }) => {
        const streamContext = {
          write: debugChatMocks.responseWrite,
          writeDone: () => debugChatMocks.responseWrite({ data: '[DONE]' }),
          writeError: debugChatMocks.writeStreamError,
          flushResume: debugChatMocks.flushResume
        };
        onStreamContextReady?.(streamContext);

        const processorResult = await processor({
          query,
          files: [],
          data,
          histories,
          requestOrigin: req.headers.origin,
          maxFiles,
          customPdfParse,
          usageId: 'usage-id',
          streamWriter: debugChatMocks.responseWrite,
          checkIsStopping: () => false,
          usageSink: vi.fn(),
          user: {
            teamId: testUser.teamId,
            tmbId: testUser.tmbId,
            userId: testUser.userId,
            isRoot: false,
            lang: 'zh'
          }
        });
        const durationSeconds = 1.2;

        await onBeforeStreamDone?.({
          result: processorResult,
          durationSeconds
        });
        streamContext.writeDone();

        return {
          streamContext,
          ...processorResult
        };
      }
    );
    debugChatMocks.getNodeResponseSummary.mockReturnValue({
      citeCollectionIds: [],
      errorCount: 0,
      totalPoints: 0
    });
    debugChatMocks.getPreviewUrl.mockImplementation(async (key: string) => `/preview/${key}`);
    debugChatMocks.recordNodeResponses.mockResolvedValue(undefined);
    debugChatMocks.closeNodeResponseWriter.mockResolvedValue(undefined);
    debugChatMocks.finalizeChatRound.mockResolvedValue(undefined);
    debugChatMocks.failChatRound.mockResolvedValue(undefined);
    debugChatMocks.updateInteractiveChat.mockResolvedValue(undefined);
    debugChatMocks.updateChatGenerateStatus.mockResolvedValue(undefined);

    const skill = await MongoAgentSkills.create({
      name: 'Test Debug Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    skillId = String(skill._id);
  });

  it.each(['skillId', 'chatId', 'messages'] as const)('rejects invalid %s', async (field) => {
    const body: Record<string, unknown> = {
      skillId,
      chatId: getNanoid(),
      responseChatItemId: getNanoid(),
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hello' }]
    };
    if (field === 'messages') {
      body.messages = [];
    } else {
      delete body[field];
    }

    await Call(debugChatApi.default, {
      auth: testUser,
      cookies: {},
      body
    });
    expect(getSseErrResMock()).toHaveBeenCalled();
    const err = getSseErrResMock().mock.calls[0][1];
    expect(err?.message ?? err).toMatch(new RegExp(field, 'i'));
  });

  it('should call sseErrRes when edit-debug sandbox does not exist', async () => {
    await Call(debugChatApi.default, {
      auth: testUser,
      cookies: {},
      headers: {
        origin: 'http://test.local'
      },
      body: {
        skillId,
        chatId: getNanoid(),
        responseChatItemId: getNanoid(),
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }]
      }
    });
    expect(getSseErrResMock()).toHaveBeenCalled();
    const err = getSseErrResMock().mock.calls[0][1];
    expect(err?.message ?? err).toMatch(/sandbox/i);
  });

  it('should reject read-only collaborators before running edit-debug sandbox', async () => {
    const reader = await getUser(`debug-chat-reader-${getNanoid(6)}`, testUser.teamId);

    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: testUser.teamId,
      resourceId: skillId,
      tmbId: reader.tmbId,
      permission: ReadPermissionVal
    });

    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: getEditDebugSandboxId(skillId),
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'edit-debug',
      userId: testUser.tmbId,
      type: SandboxTypeEnum.editDebug,
      status: 'running',
      metadata: {
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        provider: 'opensandbox',
        image: { repository: 'test-image', tag: 'latest' },
        providerCreatedAt: new Date()
      }
    });

    await Call(debugChatApi.default, {
      auth: reader,
      cookies: {},
      headers: {
        origin: 'http://test.local'
      },
      body: {
        skillId,
        chatId: getNanoid(),
        responseChatItemId: getNanoid(),
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }]
      }
    });

    expect(getSseErrResMock()).toHaveBeenCalled();
    const err = getSseErrResMock().mock.calls[0][1];
    expect(err?.message ?? err).toBe(SkillErrEnum.unAuthSkill);
    expect(debugChatMocks.preChatRound).not.toHaveBeenCalled();
    expect(debugChatMocks.runAuxiliaryGeneration).not.toHaveBeenCalled();
    expect(debugChatMocks.prepareSkillEditRuntime).not.toHaveBeenCalled();
  });

  it('should prepare and finalize a skill debug chat round with prepared ids', async () => {
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: getEditDebugSandboxId(skillId),
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'edit-debug',
      userId: testUser.tmbId,
      type: SandboxTypeEnum.editDebug,
      status: 'running',
      metadata: {
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        provider: 'opensandbox',
        image: { repository: 'test-image', tag: 'latest' },
        providerCreatedAt: new Date()
      }
    });

    await Call(debugChatApi.default, {
      auth: testUser,
      cookies: {},
      headers: {
        origin: 'http://test.local'
      },
      body: {
        skillId,
        chatId: 'debug-chat-id',
        responseChatItemId: 'client-response-id',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }]
      }
    });

    expect(debugChatMocks.preChatRound).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatId: 'debug-chat-id',
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        source: ChatSourceEnum.test,
        responseChatItemId: 'client-response-id',
        userContent: expect.objectContaining({
          obj: ChatRoleEnum.Human
        })
      })
    );
    expect(debugChatMocks.prepareSkillEditRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId,
        userId: testUser.userId,
        teamId: testUser.teamId
      })
    );
    expect(debugChatMocks.runAuxiliaryGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatId: 'prepared-debug-chat-id',
        query: 'hi',
        data: expect.objectContaining({
          model: expect.any(String),
          contextMessages: [],
          timezone: 'America/New_York',
          userKey: {
            baseUrl: 'https://provider.example/v1',
            key: 'provider-key'
          }
        }),
        files: []
      })
    );
    expect(debugChatMocks.runAuxiliaryGenerationAgentLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        userKey: {
          baseUrl: 'https://provider.example/v1',
          key: 'provider-key'
        },
        systemPrompt: expect.stringContaining(SANDBOX_SYSTEM_PROMPT)
      })
    );
    expect(debugChatMocks.responseWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        event: SseResponseEventEnum.sandboxStatus,
        data: expect.objectContaining({
          phase: 'lazyInit'
        })
      })
    );
    const sandboxStatusCallIndex = debugChatMocks.responseWrite.mock.calls.findIndex(
      ([payload]) => payload?.event === SseResponseEventEnum.sandboxStatus
    );
    const sandboxStatusOrder =
      debugChatMocks.responseWrite.mock.invocationCallOrder[sandboxStatusCallIndex];
    expect(sandboxStatusOrder).toBeLessThan(
      debugChatMocks.prepareSkillEditRuntime.mock.invocationCallOrder[0]
    );
    expect(debugChatMocks.recordNodeResponses).toHaveBeenCalledWith([]);
    expect(debugChatMocks.finalizeChatRound).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'prepared-debug-chat-id',
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        source: ChatSourceEnum.test,
        aiContent: expect.objectContaining({
          dataId: 'prepared-debug-response-id',
          value: [{ text: { content: 'debug answer' } }]
        })
      })
    );

    const doneWriteIndex = debugChatMocks.responseWrite.mock.calls.findIndex(
      ([payload]) => payload.data === '[DONE]'
    );
    expect(doneWriteIndex).toBeGreaterThanOrEqual(0);
    expect(debugChatMocks.finalizeChatRound.mock.invocationCallOrder[0]).toBeLessThan(
      debugChatMocks.responseWrite.mock.invocationCallOrder[doneWriteIndex]
    );
  });

  it('should hydrate uploaded file preview urls before building agent loop messages', async () => {
    debugChatMocks.runAuxiliaryGeneration.mockImplementationOnce(
      async ({
        req,
        onStreamContextReady,
        processor,
        data,
        histories,
        query,
        maxFiles,
        customPdfParse
      }) => {
        const streamContext = {
          write: debugChatMocks.responseWrite,
          writeDone: () => debugChatMocks.responseWrite({ data: '[DONE]' }),
          writeError: debugChatMocks.writeStreamError,
          flushResume: debugChatMocks.flushResume
        };
        onStreamContextReady?.(streamContext);

        const result = await processor({
          query,
          files: [],
          data,
          histories,
          requestOrigin: req.headers.origin,
          maxFiles,
          customPdfParse,
          usageId: 'usage-id',
          streamWriter: debugChatMocks.responseWrite,
          checkIsStopping: () => false,
          usageSink: vi.fn(),
          user: {
            teamId: testUser.teamId,
            tmbId: testUser.tmbId,
            userId: testUser.userId,
            isRoot: false,
            lang: 'zh'
          }
        });

        return {
          ...result,
          streamContext
        };
      }
    );
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: getEditDebugSandboxId(skillId),
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'edit-debug',
      userId: testUser.tmbId,
      type: SandboxTypeEnum.editDebug,
      status: 'running',
      metadata: {
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        provider: 'opensandbox',
        image: { repository: 'test-image', tag: 'latest' },
        providerCreatedAt: new Date()
      }
    });

    await Call(debugChatApi.default, {
      auth: testUser,
      cookies: {},
      headers: {
        origin: 'http://test.local'
      },
      body: {
        skillId,
        chatId: 'debug-chat-id',
        responseChatItemId: 'client-response-id',
        model: 'gpt-4o',
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

    const loopInput = debugChatMocks.runAuxiliaryGenerationAgentLoop.mock.calls[0][0];
    const userMessage = loopInput.messages.find((message: any) => message.role === 'user');
    expect(userMessage.content).toEqual(expect.stringContaining('prepared-debug-response-id-0'));
    expect(userMessage.content).toContain('guide.pdf');
    expect(userMessage.content).toContain('/preview/file-key-1');
    expect(userMessage.content).toContain('read_files');
    expect(loopInput.toolCatalog.runtimeTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: 'read_files' })
        })
      ])
    );
  });

  it('should persist a visible error when the skill edit agent loop returns error', async () => {
    const loopError = new Error('llm failed');
    debugChatMocks.runAuxiliaryGenerationAgentLoop.mockResolvedValueOnce({
      status: 'error',
      error: loopError,
      answerText: ''
    });
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: getEditDebugSandboxId(skillId),
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'edit-debug',
      userId: testUser.tmbId,
      type: SandboxTypeEnum.editDebug,
      status: 'running',
      metadata: {
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        provider: 'opensandbox',
        image: { repository: 'test-image', tag: 'latest' },
        providerCreatedAt: new Date()
      }
    });

    await Call(debugChatApi.default, {
      auth: testUser,
      cookies: {},
      headers: {
        origin: 'http://test.local'
      },
      body: {
        skillId,
        chatId: 'debug-chat-id',
        responseChatItemId: 'client-response-id',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }]
      }
    });

    expect(debugChatMocks.finalizeChatRound).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'prepared-debug-chat-id',
        aiContent: expect.objectContaining({
          dataId: 'prepared-debug-response-id',
          value: [{ text: { content: 'llm failed' } }]
        })
      })
    );
    expect(debugChatMocks.recordNodeResponses).toHaveBeenCalledWith([]);
    expect(debugChatMocks.failChatRound).not.toHaveBeenCalled();
    expect(debugChatMocks.writeStreamError).not.toHaveBeenCalled();
  });
});
