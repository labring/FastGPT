import { buildDebugRuntimeNodes } from '@/pages/api/core/ai/skill/debugChat';
import * as debugChatApi from '@/pages/api/core/ai/skill/debugChat';
import { AgentSkillSourceEnum, SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/instance/schema';
import * as responseModule from '@fastgpt/service/common/response';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getEditDebugSandboxId } from '@fastgpt/service/core/ai/skill/edit/config';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

const debugChatMocks = vi.hoisted(() => ({
  dispatchWorkFlow: vi.fn(),
  preChatRound: vi.fn(),
  finalizeChatRound: vi.fn(),
  failChatRound: vi.fn(),
  updateInteractiveChat: vi.fn(),
  updateChatGenerateStatus: vi.fn(),
  getRunningUserInfoByTmbId: vi.fn(),
  responseWrite: vi.fn(),
  flushResume: vi.fn(),
  writeStreamError: vi.fn(),
  createWorkflowStreamResponseContext: vi.fn()
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

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: debugChatMocks.dispatchWorkFlow
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

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getRunningUserInfoByTmbId: debugChatMocks.getRunningUserInfoByTmbId
}));

vi.mock('@/service/core/workflow/streamResponseContext', () => ({
  createWorkflowStreamResponseContext: debugChatMocks.createWorkflowStreamResponseContext
}));

// ── Constants mirrored from the implementation ──
const START_NODE_ID = 'skill-debug-start';
const AGENT_NODE_ID = 'skill-debug-agent';

// ═══════════════════════════════════════════════
// describe: buildDebugRuntimeNodes
// ═══════════════════════════════════════════════
describe('buildDebugRuntimeNodes', () => {
  const SKILL_ID = '507f1f77bcf86cd799439011';
  const MODEL = 'gpt-4o';
  const SYSTEM_PROMPT = 'You are a helpful assistant.';

  it('should return exactly two nodes and one edge', () => {
    const { runtimeNodes, runtimeEdges } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
    expect(runtimeNodes).toHaveLength(2);
    expect(runtimeEdges).toHaveLength(1);
  });

  // ── Start node ──────────────────────────────
  describe('start node (workflowStart)', () => {
    it('should be the first node with correct type and isEntry=true', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const startNode = runtimeNodes[0];

      expect(startNode.nodeId).toBe(START_NODE_ID);
      expect(startNode.flowNodeType).toBe(FlowNodeTypeEnum.workflowStart);
      expect(startNode.isEntry).toBe(true);
      expect(startNode.showStatus).toBe(false);
    });

    it('should have exactly one userChatInput input with empty default value', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const startNode = runtimeNodes[0];

      expect(startNode.inputs).toHaveLength(1);
      const input = startNode.inputs[0];
      expect(input.key).toBe(NodeInputKeyEnum.userChatInput);
      expect(input.valueType).toBe(WorkflowIOValueTypeEnum.string);
      expect(input.required).toBe(true);
      expect(input.value).toBe('');
    });

    it('should have exactly one userChatInput output with static type', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const startNode = runtimeNodes[0];

      expect(startNode.outputs).toHaveLength(1);
      const output = startNode.outputs[0];
      expect(output.key).toBe(NodeOutputKeyEnum.userChatInput);
      expect(output.id).toBe(NodeOutputKeyEnum.userChatInput);
      expect(output.type).toBe(FlowNodeOutputTypeEnum.static);
      expect(output.valueType).toBe(WorkflowIOValueTypeEnum.string);
    });
  });

  // ── Agent node ──────────────────────────────
  describe('agent node', () => {
    it('should have correct type and isEntry=false with showStatus=true', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      expect(agentNode.nodeId).toBe(AGENT_NODE_ID);
      expect(agentNode.flowNodeType).toBe(FlowNodeTypeEnum.agent);
      expect(agentNode.isEntry).toBe(false);
      expect(agentNode.showStatus).toBe(true);
    });

    it('userChatInput input should reference start node output', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const userInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.userChatInput);
      expect(userInput).toBeDefined();
      // Reference format: [nodeId, outputKey]
      expect(userInput!.value).toEqual([START_NODE_ID, NodeOutputKeyEnum.userChatInput]);
      expect(userInput!.renderTypeList).toContain(FlowNodeInputTypeEnum.reference);
    });

    it('history input should be a number with value 20', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const historyInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.history);
      expect(historyInput).toBeDefined();
      expect(historyInput!.value).toBe(20);
      expect(historyInput!.valueType).toBe(WorkflowIOValueTypeEnum.chatHistory);
      expect(historyInput!.min).toBe(0);
      expect(historyInput!.max).toBe(50);
    });

    it('aiModel input should carry the provided model value', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const modelInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.aiModel);
      expect(modelInput).toBeDefined();
      expect(modelInput!.value).toBe(MODEL);
      expect(modelInput!.valueType).toBe(WorkflowIOValueTypeEnum.string);
      expect(modelInput!.required).toBe(true);
    });

    it('aiSystemPrompt input should carry the provided system prompt', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const promptInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.aiSystemPrompt);
      expect(promptInput).toBeDefined();
      expect(promptInput!.value).toBe(SYSTEM_PROMPT);
      expect(promptInput!.valueType).toBe(WorkflowIOValueTypeEnum.string);
    });

    it('editSkillId input should contain exactly the given skillId', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const editSkillInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.editSkillId);
      expect(editSkillInput).toBeDefined();
      expect(editSkillInput!.value).toBe(SKILL_ID);
      expect(editSkillInput!.valueType).toBe(WorkflowIOValueTypeEnum.string);
      expect(editSkillInput!.renderTypeList).toContain(FlowNodeInputTypeEnum.hidden);
    });

    it('should not pass session skills or edit debug boolean', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      expect(agentNode.inputs.some((i) => i.key === NodeInputKeyEnum.skills)).toBe(false);
      expect(agentNode.inputs.some((i) => i.key === 'useEditDebugSandbox')).toBe(false);
    });

    it('should have an answerText output with static type', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      expect(agentNode.outputs).toHaveLength(1);
      const output = agentNode.outputs[0];
      expect(output.key).toBe(NodeOutputKeyEnum.answerText);
      expect(output.id).toBe(NodeOutputKeyEnum.answerText);
      expect(output.type).toBe(FlowNodeOutputTypeEnum.static);
      expect(output.valueType).toBe(WorkflowIOValueTypeEnum.string);
    });
  });

  // ── Edge ────────────────────────────────────
  describe('edge (start -> agent)', () => {
    it('should connect start to agent with waiting status', () => {
      const { runtimeEdges } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const edge = runtimeEdges[0];

      expect(edge.source).toBe(START_NODE_ID);
      expect(edge.target).toBe(AGENT_NODE_ID);
      expect(edge.status).toBe('waiting');
    });

    it('should use correct handle IDs', () => {
      const { runtimeEdges } = buildDebugRuntimeNodes(SKILL_ID, MODEL, SYSTEM_PROMPT);
      const edge = runtimeEdges[0];

      expect(edge.sourceHandle).toBe(getHandleId(START_NODE_ID, 'source', 'right'));
      expect(edge.targetHandle).toBe(getHandleId(AGENT_NODE_ID, 'target', 'left'));
    });
  });

  // ── Dynamic input injection ─────────────────
  describe('dynamic value injection', () => {
    it('should inject different edit skill ids correctly', () => {
      const anotherSkillId = '507f1f77bcf86cd799439022';
      const { runtimeNodes } = buildDebugRuntimeNodes(anotherSkillId, MODEL, SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const editSkillInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.editSkillId);
      expect(editSkillInput!.value).toBe(anotherSkillId);
    });

    it('should inject different models correctly', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, 'claude-3-5-sonnet', SYSTEM_PROMPT);
      const agentNode = runtimeNodes[1];

      const modelInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.aiModel);
      expect(modelInput!.value).toBe('claude-3-5-sonnet');
    });

    it('should inject empty system prompt without error', () => {
      const { runtimeNodes } = buildDebugRuntimeNodes(SKILL_ID, MODEL, '');
      const agentNode = runtimeNodes[1];

      const promptInput = agentNode.inputs.find((i) => i.key === NodeInputKeyEnum.aiSystemPrompt);
      expect(promptInput!.value).toBe('');
    });
  });
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
    debugChatMocks.createWorkflowStreamResponseContext.mockResolvedValue({
      responseWrite: debugChatMocks.responseWrite,
      flushResume: debugChatMocks.flushResume,
      writeStreamError: debugChatMocks.writeStreamError
    });
    debugChatMocks.dispatchWorkFlow.mockResolvedValue({
      assistantResponses: [{ text: { content: 'debug answer' } }],
      system_memories: { memory: 'value' },
      durationSeconds: 1.2,
      customFeedbacks: ['feedback-id'],
      nodeResponseSummary: {
        citeCollectionIds: [],
        errorCount: 0,
        totalPoints: 0
      }
    });
    debugChatMocks.finalizeChatRound.mockResolvedValue(undefined);
    debugChatMocks.failChatRound.mockResolvedValue(undefined);
    debugChatMocks.updateInteractiveChat.mockResolvedValue(undefined);
    debugChatMocks.updateChatGenerateStatus.mockResolvedValue(undefined);
    debugChatMocks.getRunningUserInfoByTmbId.mockResolvedValue({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });

    const skill = await MongoAgentSkills.create({
      name: 'Test Debug Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId
    });
    skillId = String(skill._id);
  });

  it('should call sseErrRes when skillId is missing', async () => {
    await Call(debugChatApi.default, {
      auth: testUser,
      body: {
        chatId: getNanoid(),
        responseChatItemId: getNanoid(),
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hello' }]
      }
    });
    expect(getSseErrResMock()).toHaveBeenCalled();
    const err = getSseErrResMock().mock.calls[0][1];
    expect(err?.message ?? err).toMatch(/skillId/i);
  });

  it('should call sseErrRes when chatId is missing', async () => {
    await Call(debugChatApi.default, {
      auth: testUser,
      body: {
        skillId,
        responseChatItemId: getNanoid(),
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hello' }]
      }
    });
    expect(getSseErrResMock()).toHaveBeenCalled();
    const err = getSseErrResMock().mock.calls[0][1];
    expect(err?.message ?? err).toMatch(/chatId/i);
  });

  it('should call sseErrRes when messages array is empty', async () => {
    await Call(debugChatApi.default, {
      auth: testUser,
      cookies: {},
      body: {
        skillId,
        chatId: getNanoid(),
        responseChatItemId: getNanoid(),
        model: 'gpt-4o',
        messages: []
      }
    });
    expect(getSseErrResMock()).toHaveBeenCalled();
    const err = getSseErrResMock().mock.calls[0][1];
    expect(err?.message ?? err).toMatch(/messages/i);
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

  it('should NOT call sseErrRes with sandbox error when edit-debug sandbox exists', async () => {
    // Create sandbox instance
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: getEditDebugSandboxId(skillId),
      appId: skillId,
      chatId: 'edit-debug',
      userId: testUser.tmbId,
      type: SandboxTypeEnum.editDebug,
      status: 'running',
      metadata: {
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        skillId,
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
        chatId: getNanoid(),
        responseChatItemId: getNanoid(),
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }]
      }
    });

    // sseErrRes must NOT be called with a sandbox-not-found error
    const calls = getSseErrResMock().mock.calls;
    const hasSandboxError = calls.some(([, err]) => /sandbox/i.test(err?.message ?? ''));
    expect(hasSandboxError).toBe(false);
  });

  it('should prepare and finalize a skill debug chat round with prepared ids', async () => {
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: getEditDebugSandboxId(skillId),
      appId: skillId,
      chatId: 'edit-debug',
      userId: testUser.tmbId,
      type: SandboxTypeEnum.editDebug,
      status: 'running',
      metadata: {
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        skillId,
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
        appId: skillId,
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
    expect(debugChatMocks.dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'prepared-debug-chat-id',
        responseChatItemId: 'prepared-debug-response-id'
      })
    );
    expect(debugChatMocks.finalizeChatRound).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'prepared-debug-chat-id',
        appId: skillId,
        source: ChatSourceEnum.test,
        aiContent: expect.objectContaining({
          dataId: 'prepared-debug-response-id',
          value: [{ text: { content: 'debug answer' } }],
          memories: { memory: 'value' },
          customFeedbacks: ['feedback-id']
        })
      })
    );
  });
});
