import * as debugChatApi from '@/pages/api/core/ai/skill/debugChat';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  SKILL_EDIT_SANDBOX_SYSTEM_PROMPT,
  SandboxTypeEnum
} from '@fastgpt/global/core/ai/sandbox/constants';
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
import { getSkillEditAgentLoopMemoryKey } from '@fastgpt/service/core/ai/auxiliaryGeneration/skillEdit/utils';

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

vi.mock('@fastgpt/service/core/chat/controller', () => ({
  getChatItems: debugChatMocks.getChatItems
}));

// ═══════════════════════════════════════════════
// describe: debugChat API handler — parameter validation
// ═══════════════════════════════════════════════
describe('debugChat handler — parameter validation', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;

  // Error written via sseErrRes can be checked through the vi.mocked spy
  const getSseErrResMock = () => vi.mocked(responseModule.sseErrRes);

  const createRunningSandbox = () =>
    MongoSandboxInstance.create({
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

  beforeEach(async () => {
    testUser = await getUser(`debug-chat-user-${getNanoid(6)}`);
    vi.clearAllMocks();
    debugChatMocks.preChatRound.mockImplementation(async ({ userContent }) => {
      userContent.value.forEach((item: any) => {
        if (item.file?.key) {
          item.file.url = '';
        }
      });

      return {
        chatId: 'prepared-debug-chat-id',
        responseChatItemId: 'prepared-debug-response-id',
        shouldPersistChatRound: true,
        shouldFinalizePreparedRound: true
      };
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
    debugChatMocks.getChatItems.mockResolvedValue({ histories: [] });
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

    await createRunningSandbox();

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
    await createRunningSandbox();

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
              {
                type: 'file_url',
                name: 'demo.mp4',
                url: '',
                fileType: 'video',
                key: 'video-key-1'
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
        responseChatItemId: 'client-response-id'
      })
    );
    expect(debugChatMocks.runAuxiliaryGenerationAgentLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        userKey: {
          baseUrl: 'https://provider.example/v1',
          key: 'provider-key'
        },
        systemPrompt: expect.stringContaining(SKILL_EDIT_SANDBOX_SYSTEM_PROMPT)
      })
    );
    const loopInput = debugChatMocks.runAuxiliaryGenerationAgentLoop.mock.calls[0][0];
    const userMessage = loopInput.messages.find((message: any) => message.role === 'user');
    const userMessageContent = JSON.stringify(userMessage.content);
    expect(userMessageContent).toContain('prepared-debug-response-id-0');
    expect(userMessageContent).toContain('/preview/file-key-1');
    expect(userMessage.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'file_url',
          name: 'demo.mp4',
          url: '/preview/video-key-1',
          fileType: 'video'
        })
      ])
    );
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
  });

  it('should retain an uploaded video when resuming ask_agent', async () => {
    await createRunningSandbox();
    const pendingMainContext = {
      messages: [
        { role: 'user', content: 'Please review the media' },
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'call-ask',
              type: 'function',
              function: { name: 'ask_agent', arguments: '{}' }
            }
          ]
        }
      ],
      askToolCallId: 'call-ask'
    };
    debugChatMocks.getChatItems.mockResolvedValueOnce({
      histories: [
        {
          dataId: 'ask-response-id',
          obj: ChatRoleEnum.AI,
          value: [
            {
              interactive: {
                type: 'agentPlanAskQuery',
                planId: 'ask-plan-id',
                entryNodeIds: [],
                memoryEdges: [],
                nodeOutputs: [],
                params: {
                  content: 'Which clip should I inspect?',
                  reason: 'Need the source clip',
                  blockerType: 'missing_context'
                }
              }
            }
          ],
          memories: {
            [getSkillEditAgentLoopMemoryKey()]: { pendingMainContext }
          }
        }
      ]
    });

    await Call(debugChatApi.default, {
      auth: testUser,
      cookies: {},
      headers: { origin: 'http://test.local' },
      body: {
        skillId,
        chatId: 'resume-chat-id',
        responseChatItemId: 'resume-response-id',
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'file_url',
                name: 'answer.mp4',
                url: '',
                fileType: 'video',
                key: 'resume-video-key'
              },
              { type: 'text', text: 'Use this clip' }
            ]
          }
        ]
      }
    });

    expect(debugChatMocks.runAuxiliaryGenerationAgentLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingMainContext,
        userAnswer: 'Use this clip',
        resumeMessages: [
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'file_url',
                name: 'answer.mp4',
                url: '/preview/resume-video-key',
                fileType: 'video'
              })
            ])
          })
        ]
      })
    );
    const resumeMessages =
      debugChatMocks.runAuxiliaryGenerationAgentLoop.mock.calls.at(-1)?.[0].resumeMessages;
    expect(JSON.stringify(resumeMessages)).not.toContain('Use this clip');
  });

  it('should persist a visible error when the skill edit agent loop returns error', async () => {
    const loopError = new Error('llm failed');
    debugChatMocks.runAuxiliaryGenerationAgentLoop.mockResolvedValueOnce({
      status: 'error',
      error: loopError,
      answerText: ''
    });
    await createRunningSandbox();

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
