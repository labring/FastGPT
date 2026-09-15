import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Span } from '@opentelemetry/api';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { createLangfuseWorkflowTracing } from '@fastgpt/service/common/langfuse/workflow';

const mocks = vi.hoisted(() => ({ enabled: true }));
vi.mock('@fastgpt/service/common/langfuse/index', () => ({
  isLangfuseEnabled: () => mocks.enabled
}));

describe('createLangfuseWorkflowTracing', () => {
  const traceProps = {
    sessionId: 'session',
    userId: 'user',
    appId: 'app',
    appName: 'Assistant',
    input: 'hello'
  };
  const createSpan = () => ({ setAttribute: vi.fn() }) as unknown as Span;
  beforeEach(() => {
    mocks.enabled = true;
  });

  it.each([
    { isRootRuntime: false, mode: 'chat', configured: true },
    { isRootRuntime: true, mode: 'test', configured: true },
    { isRootRuntime: true, mode: 'chat', configured: false }
  ])('skips non-root, debug and unconfigured runs: %j', ({ configured, ...props }) => {
    mocks.enabled = configured;
    const tracing = createLangfuseWorkflowTracing(props);
    const span = createSpan();
    expect(tracing.getTraceAttributes(traceProps)).toEqual({});
    expect(tracing.getStepAttributes('app')).toEqual({});
    tracing.recordStep({
      span,
      nodeType: FlowNodeTypeEnum.chatNode,
      input: 'hello',
      output: 'world'
    });
    tracing.recordOutput(span, [{ text: { content: 'world' } }]);
    expect(span.setAttribute).not.toHaveBeenCalled();
  });

  it('preserves initial markers and the enablement snapshot', () => {
    const tracing = createLangfuseWorkflowTracing({ isRootRuntime: true, mode: 'chat' });
    mocks.enabled = false;
    expect(tracing.getTraceAttributes(traceProps)).toMatchObject({
      'langfuse.trace.name': 'message'
    });
    expect(tracing.getStepAttributes('app')).toEqual({
      'langfuse.observation.metadata.app_id': 'app'
    });
    const span = createSpan();
    tracing.recordOutput(span, [
      { reasoning: { content: 'private' } },
      { text: { content: 'world' } }
    ]);
    expect(span.setAttribute).toHaveBeenCalledWith('langfuse.trace.output', '"world"');
  });

  it('records filtered input/output and generation usage including zero tokens', () => {
    const tracing = createLangfuseWorkflowTracing({ isRootRuntime: true, mode: 'chat' });
    const span = createSpan();
    tracing.recordStep({
      span,
      nodeType: FlowNodeTypeEnum.chatNode,
      input: { text: 'hello', history: ['private'] },
      output: { answer: 'world', reasoning: 'private' },
      response: { model: 'gpt-4', inputTokens: 0, outputTokens: 10 }
    });
    expect(span.setAttribute).toHaveBeenCalledWith(
      'langfuse.observation.input',
      '{"text":"hello"}'
    );
    expect(span.setAttribute).toHaveBeenCalledWith(
      'langfuse.observation.output',
      '{"answer":"world"}'
    );
    expect(span.setAttribute).toHaveBeenCalledWith('langfuse.observation.type', 'generation');
    expect(span.setAttribute).toHaveBeenCalledWith('langfuse.observation.model.name', 'gpt-4');
    expect(span.setAttribute).toHaveBeenCalledWith(
      'langfuse.observation.usage_details',
      '{"input":0,"output":10}'
    );
  });

  it('handles absent spans, unsupported values and absent model usage', () => {
    const tracing = createLangfuseWorkflowTracing({ isRootRuntime: true, mode: 'chat' });
    const span = createSpan();
    const props = { nodeType: FlowNodeTypeEnum.chatNode, input: Symbol(), output: Symbol() };
    tracing.recordStep(props);
    tracing.recordStep({ ...props, span });
    expect(span.setAttribute).not.toHaveBeenCalled();
    tracing.recordStep({ ...props, span, output: undefined, response: { model: 'gpt-4' } });
    expect(span.setAttribute).toHaveBeenCalledWith('langfuse.observation.output', '{}');
    expect(span.setAttribute).not.toHaveBeenCalledWith(
      'langfuse.observation.usage_details',
      expect.anything()
    );
  });

  it('does not mark non-LLM nodes as generations', () => {
    const tracing = createLangfuseWorkflowTracing({ isRootRuntime: true, mode: 'chat' });
    const span = createSpan();
    tracing.recordStep({
      span,
      nodeType: FlowNodeTypeEnum.httpRequest468,
      input: {},
      output: {},
      response: { model: 'gpt-4' }
    });
    expect(span.setAttribute).toHaveBeenCalledTimes(2);
  });
});
