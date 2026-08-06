import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runAgentLoop: vi.fn(),
  prepareRuntime: vi.fn(),
  buildUserContext: vi.fn(),
  emitEvent: vi.fn(),
  buildAssistantResponses: vi.fn(),
  nodeResponses: [
    {
      id: 'node-1',
      nodeId: 'node-1',
      moduleType: 'agent',
      moduleName: 'Agent'
    }
  ]
}));

vi.mock('@fastgpt/service/core/ai/llm/agentLoop/interface', () => ({
  runAgentLoop: mocks.runAgentLoop
}));

vi.mock('@fastgpt/service/core/ai/skill/debugChat/runtime', () => ({
  prepareSkillDebugRuntime: mocks.prepareRuntime
}));

vi.mock('@fastgpt/service/core/ai/skill/debugChat/userContext', () => ({
  SKILL_DEBUG_MAX_FILES: 10,
  buildSkillDebugUserContext: mocks.buildUserContext
}));

vi.mock('@fastgpt/service/core/ai/skill/debugChat/eventAdapter', () => ({
  createSkillDebugEventAdapter: () => ({
    nodeResponses: mocks.nodeResponses,
    emitEvent: mocks.emitEvent,
    buildAssistantResponses: mocks.buildAssistantResponses
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  getRunningSandboxId: vi.fn(() => 'skill-debug-sandbox-id')
}));

import { createSkillDebugProcessor } from '@fastgpt/service/core/ai/skill/debugChat/processor';
import { getSkillDebugAgentLoopMemoryKey } from '@fastgpt/service/core/ai/skill/debugChat/memory';

const unfinishedPlan = {
  planId: 'plan-1',
  name: 'Edit skill',
  steps: [{ id: 'step-1', name: 'Inspect files', status: 'in_progress' as const }]
};

describe('createSkillDebugProcessor', () => {
  const streamWriter = vi.fn();
  const usageSink = vi.fn();
  const providerState = { pendingMainContext: { askToolCallId: 'ask-1' } };
  const histories = [
    {
      obj: ChatRoleEnum.AI,
      value: [{ plan: unfinishedPlan }],
      memories: {
        [getSkillDebugAgentLoopMemoryKey()]: { providerState }
      }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareRuntime.mockResolvedValue({
      sandboxClient: { id: 'sandbox-client' },
      currentWorkingDirectory: '/workspace',
      skillInfos: []
    });
    mocks.buildUserContext.mockReturnValue({
      messages: [{ role: 'user', content: 'answer plus file' }],
      askContinuationMessages: [
        {
          role: 'user',
          content: [{ type: 'file_url', name: 'clip.mp4', url: '/clip.mp4' }]
        }
      ],
      readableFileUrls: ['https://files.example.com/guide.pdf']
    });
    mocks.buildAssistantResponses.mockReturnValue([{ text: { content: 'partial answer' } }]);
  });

  const runProcessor = (isInteractiveResume: boolean) =>
    createSkillDebugProcessor({
      skillId: 'skill-id',
      responseChatItemId: 'response-id',
      isInteractiveResume
    })({
      query: 'Use this file',
      files: [],
      data: {
        model: 'gpt-5',
        systemPrompt: 'Use {{@sandbox_read_file@}} carefully.',
        currentUserValue: [{ text: { content: 'Use this file' } }],
        timezone: 'Asia/Shanghai',
        userKey: { baseUrl: 'https://provider.example/v1', key: 'provider-key' },
        modelCapabilities: { vision: true, audio: true, video: true }
      },
      histories,
      streamWriter,
      requestOrigin: 'https://app.example.com',
      maxFiles: 10,
      customPdfParse: false,
      checkIsStopping: () => false,
      usageSink,
      usageId: 'usage-id',
      user: {
        teamId: 'team-id',
        tmbId: 'tmb-id',
        userId: 'user-id',
        isRoot: false,
        lang: 'en'
      }
    });

  it('resumes ask directly through Agent Loop and keeps new attachments after the tool answer', async () => {
    const nextProviderState = { pendingMainContext: { askToolCallId: 'ask-2' } };
    mocks.runAgentLoop.mockResolvedValue({
      status: 'paused',
      pause: {
        type: 'ask',
        askId: 'ask-2',
        ask: {
          reason: 'Need an output choice',
          blockerType: 'user_choice',
          questions: [
            {
              question: 'Which format?',
              options: [
                { summary: 'Markdown', value: 'Markdown' },
                { summary: 'JSON', value: 'JSON' }
              ]
            }
          ]
        }
      },
      providerState: nextProviderState,
      activePlan: unfinishedPlan,
      completeMessages: [],
      assistantMessages: [{ role: 'assistant', content: 'partial answer' }],
      requestIds: ['request-1'],
      finishReason: 'stop',
      usages: []
    });

    const result = await runProcessor(true);

    expect(mocks.runAgentLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({
          teamId: 'team-id',
          llmParams: expect.objectContaining({
            model: 'gpt-5',
            userKey: { baseUrl: 'https://provider.example/v1', key: 'provider-key' },
            useVision: true,
            useAudio: true,
            useVideo: true
          }),
          systemTools: expect.objectContaining({
            plan: { enabled: true },
            ask: { enabled: true },
            sandbox: expect.objectContaining({ enabled: true }),
            readFile: expect.objectContaining({ enabled: true, maxFileAmount: 10 })
          }),
          toolCatalog: { runtimeTools: [] },
          usagePush: usageSink,
          emitEvent: mocks.emitEvent
        }),
        input: expect.objectContaining({
          activePlan: unfinishedPlan,
          providerState,
          continuation: {
            type: 'ask',
            answer: 'Use this file',
            additionalMessages: [
              {
                role: 'user',
                content: [{ type: 'file_url', name: 'clip.mp4', url: '/clip.mp4' }]
              }
            ]
          }
        })
      })
    );
    const loopInput = mocks.runAgentLoop.mock.calls[0][0].input;
    expect(loopInput.systemPrompt).toContain('{{Sandbox/Read File}}');
    expect(loopInput.systemPrompt).not.toContain('用户对话上传的文件存储在');
    expect(result.aiResponse).toEqual([
      { text: { content: 'partial answer' } },
      expect.objectContaining({
        interactive: expect.objectContaining({
          type: 'agentAsk',
          askId: 'ask-2',
          usageId: 'usage-id'
        })
      })
    ]);
    expect(result.memories).toEqual({
      [getSkillDebugAgentLoopMemoryKey()]: { providerState: nextProviderState }
    });
    expect(result.nodeResponses).toBe(mocks.nodeResponses);
  });

  it('persists a visible error and clears provider state when the loop fails', async () => {
    mocks.runAgentLoop.mockResolvedValue({
      status: 'error',
      error: new Error('model unavailable'),
      activePlan: unfinishedPlan,
      providerState: undefined,
      completeMessages: [],
      assistantMessages: [],
      requestIds: [],
      finishReason: 'error',
      usages: []
    });
    mocks.buildAssistantResponses.mockReturnValueOnce([]);

    const result = await runProcessor(false);

    expect(mocks.runAgentLoop.mock.calls[0][0].input).toEqual(
      expect.objectContaining({
        providerState: undefined,
        continuation: undefined
      })
    );
    expect(result.aiResponse).toEqual([{ text: { content: 'model unavailable' } }]);
    expect(result.memories).toEqual({
      [getSkillDebugAgentLoopMemoryKey()]: undefined
    });
  });
});
