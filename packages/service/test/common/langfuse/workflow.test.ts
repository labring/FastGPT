import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  onWorkflowEnd,
  onWorkflowNodeEnd,
  onWorkflowNodeStart,
  onWorkflowStart
} from '@fastgpt/service/common/langfuse/workflow';

const mocks = vi.hoisted(() => ({
  enabled: true,
  prepareSpan: vi.fn(),
  setAttributes: vi.fn(),
  setTraceAttributes: vi.fn()
}));
vi.mock('@fastgpt/service/common/langfuse/index', () => ({
  isLangfuseEnabled: () => mocks.enabled,
  prepareLangfuseSpan: mocks.prepareSpan,
  setActiveLangfuseAttributes: mocks.setAttributes,
  setActiveLangfuseTraceAttributes: mocks.setTraceAttributes
}));

describe('Langfuse workflow lifecycle callbacks', () => {
  const lifecycle = { isRootRuntime: true, mode: 'chat' };
  const traceProps = {
    ...lifecycle,
    sessionId: 'session',
    userId: 'user',
    appId: 'app',
    appName: 'Assistant',
    input: 'hello'
  };
  beforeEach(() => {
    mocks.enabled = true;
    vi.clearAllMocks();
  });

  it.each([
    { isRootRuntime: false, mode: 'chat', configured: true },
    { isRootRuntime: true, mode: 'test', configured: true },
    { isRootRuntime: true, mode: 'chat', configured: false }
  ])('skips non-root, debug and unconfigured runs: %j', ({ configured, ...props }) => {
    mocks.enabled = configured;
    onWorkflowStart({ ...traceProps, ...props });
    onWorkflowNodeStart({ ...props, appId: 'app' });
    onWorkflowNodeEnd({
      ...props,
      nodeType: FlowNodeTypeEnum.chatNode,
      input: 'hello',
      output: 'world'
    });
    onWorkflowEnd({ ...props, output: [{ text: { content: 'world' } }] });
    expect(mocks.prepareSpan).toHaveBeenNthCalledWith(1, undefined, 'trace');
    expect(mocks.prepareSpan).toHaveBeenNthCalledWith(2, undefined, 'observation');
    expect(mocks.setAttributes).not.toHaveBeenCalled();
    expect(mocks.setTraceAttributes).not.toHaveBeenCalled();
  });

  it('returns root and node attributes at span creation time', () => {
    onWorkflowStart(traceProps);
    onWorkflowNodeStart({ ...lifecycle, appId: 'app' });
    expect(mocks.prepareSpan).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ 'langfuse.trace.name': 'message' }),
      'trace'
    );
    expect(mocks.prepareSpan).toHaveBeenNthCalledWith(
      2,
      { 'langfuse.observation.metadata.app_id': 'app' },
      'observation'
    );
  });

  it('records visible workflow output without reasoning', () => {
    onWorkflowEnd({
      ...lifecycle,
      output: [{ reasoning: { content: 'private' } }, { text: { content: 'world' } }]
    });
    expect(mocks.setTraceAttributes).toHaveBeenCalledWith({
      'langfuse.trace.output': '"world"'
    });
    expect(mocks.setAttributes).not.toHaveBeenCalled();
  });

  it('records filtered node data and generation usage including zero tokens', () => {
    onWorkflowNodeEnd({
      ...lifecycle,
      nodeType: FlowNodeTypeEnum.chatNode,
      input: { text: 'hello', history: ['private'] },
      output: { answer: 'world', reasoning: 'private' },
      response: { model: 'gpt-4', inputTokens: 0, outputTokens: 10 }
    });
    expect(mocks.setAttributes).toHaveBeenCalledWith({
      'langfuse.observation.input': '{"text":"hello"}',
      'langfuse.observation.output': '{"answer":"world"}',
      'langfuse.observation.type': 'generation',
      'langfuse.observation.model.name': 'gpt-4',
      'langfuse.observation.usage_details': '{"input":0,"output":10}'
    });
  });

  it('handles absent spans, unsupported values and absent model usage', () => {
    const props = {
      ...lifecycle,
      nodeType: FlowNodeTypeEnum.chatNode,
      input: Symbol(),
      output: Symbol()
    };
    onWorkflowNodeEnd(props);
    expect(mocks.setAttributes).toHaveBeenCalledWith({});

    onWorkflowNodeEnd({ ...props, output: undefined, response: { model: 'gpt-4' } });
    expect(mocks.setAttributes).toHaveBeenLastCalledWith({
      'langfuse.observation.output': '{}',
      'langfuse.observation.type': 'generation',
      'langfuse.observation.model.name': 'gpt-4'
    });
  });

  it('marks agent nodes as generations using input model and summary usage', () => {
    onWorkflowNodeEnd({
      ...lifecycle,
      nodeType: FlowNodeTypeEnum.agent,
      input: { model: 'agent-model', userChatInput: 'hello' },
      output: { answerText: 'world' },
      usage: { inputTokens: 100, outputTokens: 200 }
    });
    expect(mocks.setAttributes).toHaveBeenCalledWith({
      'langfuse.observation.input': '{"model":"agent-model","userChatInput":"hello"}',
      'langfuse.observation.output': '{"answerText":"world"}',
      'langfuse.observation.type': 'generation',
      'langfuse.observation.model.name': 'agent-model',
      'langfuse.observation.usage_details': '{"input":100,"output":200}'
    });
  });

  it('prefers node response model and tokens over fallbacks', () => {
    onWorkflowNodeEnd({
      ...lifecycle,
      nodeType: FlowNodeTypeEnum.agent,
      input: { model: 'input-model' },
      output: { answerText: 'world' },
      response: { model: 'response-model', inputTokens: 1, outputTokens: 2 },
      usage: { inputTokens: 100, outputTokens: 200 }
    });
    expect(mocks.setAttributes).toHaveBeenCalledWith({
      'langfuse.observation.input': '{"model":"input-model"}',
      'langfuse.observation.output': '{"answerText":"world"}',
      'langfuse.observation.type': 'generation',
      'langfuse.observation.model.name': 'response-model',
      'langfuse.observation.usage_details': '{"input":1,"output":2}'
    });
  });

  it('omits usage details when fallback usage is zero', () => {
    onWorkflowNodeEnd({
      ...lifecycle,
      nodeType: FlowNodeTypeEnum.agent,
      input: { model: 'agent-model' },
      output: { answerText: 'world' },
      usage: { inputTokens: 0, outputTokens: 0 }
    });
    expect(mocks.setAttributes).toHaveBeenCalledWith({
      'langfuse.observation.input': '{"model":"agent-model"}',
      'langfuse.observation.output': '{"answerText":"world"}',
      'langfuse.observation.type': 'generation',
      'langfuse.observation.model.name': 'agent-model'
    });
  });

  it('does not mark non-LLM nodes as generations', () => {
    onWorkflowNodeEnd({
      ...lifecycle,
      nodeType: FlowNodeTypeEnum.httpRequest468,
      input: {},
      output: {},
      response: { model: 'gpt-4' }
    });
    expect(mocks.setAttributes).toHaveBeenCalledWith({
      'langfuse.observation.input': '{}',
      'langfuse.observation.output': '{}'
    });
  });
});
