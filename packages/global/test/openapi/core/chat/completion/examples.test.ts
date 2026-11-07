import { describe, expect, it } from 'vitest';
import { getChatCompletionResponseExamples } from '../../../../../openapi/core/chat/completion/examples';
import { openAPIDocument } from '../../../../../openapi/provider/devapi';
import {
  AgentPlanSchema,
  AgentPlanStatusSchema,
  AgentPlanStepStatusSchema
} from '../../../../../core/ai/agent/type';
import { InteractiveNodeResponseTypeSchema } from '../../../../../core/workflow/template/system/interactive/type';
import { SseResponseEventEnum } from '../../../../../core/workflow/runtime/constants';
import {
  ChatHistoryItemResSchema,
  ToolModuleResponseItemSchema,
  SkillModuleResponseItemSchema
} from '../../../../../core/chat/type';

/** 按 SSE wire 规则解析示例，确保空行分帧，且每帧 data 都是有效 JSON 或 [DONE]。 */
const parseFrames = (value: string) => {
  expect(value.endsWith('\n\n')).toBe(true);
  return value
    .trim()
    .split('\n\n')
    .map((frame) => {
      const lines = frame.split('\n');
      const event = lines.find((line) => line.startsWith('event: '))?.slice(7);
      const data = lines
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      expect(data).not.toBe('');
      return { event, data: data === '[DONE]' ? data : JSON.parse(data) };
    });
};

describe.each(['v1', 'v2'] as const)('completion response examples %s', (version) => {
  const examples = getChatCompletionResponseExamples(version);

  it('publishes the same valid SSE examples in the OpenAPI response', () => {
    const operation = openAPIDocument.paths![`/${version}/chat/completions`]!.post!;
    const content = operation.responses![200];
    if ('$ref' in content) throw new Error('Unexpected response reference');
    const nodeEvent = version === 'v1' ? 'flowResponses' : 'flowNodeResponse';
    const otherVersionEvent = version === 'v1' ? 'flowNodeResponse' : 'flowResponses';
    expect(operation.description).not.toContain('**event 取值**');
    expect(operation.description).not.toContain(otherVersionEvent);
    expect(content.content!['text/event-stream'].schema).toHaveProperty(
      'description',
      expect.stringContaining(nodeEvent)
    );
    expect(JSON.stringify(content.content!['text/event-stream'])).not.toContain(otherVersionEvent);
    expect(content.content!['text/event-stream'].examples).toEqual({
      ...examples.sse,
      ...examples.eventExamples
    });
    for (const sample of [
      ...Object.values(examples.sse),
      ...Object.values(examples.eventExamples)
    ]) {
      expect(parseFrames(sample.value).length).toBeGreaterThan(0);
    }
  });

  it('keeps compact streams unnamed and ends each scenario with [DONE]', () => {
    const compact = parseFrames(examples.sse.detailFalseStreamTrue.value);
    expect(compact.every(({ event }) => event === undefined)).toBe(true);
    for (const sample of Object.values(examples.sse)) {
      expect(parseFrames(sample.value).at(-1)?.data).toBe('[DONE]');
    }
  });

  it('preserves the version-specific node response protocol and event payload shapes', () => {
    for (const event of examples.events) {
      expect(Object.values(SseResponseEventEnum)).toContain(event.name);
    }
    const events = new Map(
      examples.events.map((item) => [item.name, parseFrames(item.value).map(({ data }) => data)])
    );
    expect(events.has('flowNodeResponse')).toBe(version === 'v2');
    expect(events.has('flowResponses')).toBe(version === 'v1');
    const trace = parseFrames(examples.sse.detailTrueStreamTrue.value);
    expect(
      trace.some(({ event }) => event === (version === 'v1' ? 'flowResponses' : 'flowNodeResponse'))
    ).toBe(true);
    for (const data of events.get('plan')!)
      expect(AgentPlanSchema.safeParse(data.plan).success).toBe(true);
    for (const data of events.get('planStatus')!)
      expect(AgentPlanStatusSchema.safeParse(data.planStatus).success).toBe(true);
    for (const data of events.get('toolCall')!)
      expect(ToolModuleResponseItemSchema.safeParse(data.tool).success).toBe(true);
    for (const name of ['toolParams', 'toolResponse']) {
      for (const data of events.get(name)!)
        expect(
          ToolModuleResponseItemSchema.partial().required({ id: true }).safeParse(data.tool).success
        ).toBe(true);
    }
    for (const data of events.get('skillCall')!)
      expect(SkillModuleResponseItemSchema.safeParse(data.skill).success).toBe(true);
    for (const data of events.get('interactive')!)
      expect(InteractiveNodeResponseTypeSchema.safeParse(data.interactive).success).toBe(true);
    if (version === 'v2')
      for (const data of events.get('flowNodeResponse')!)
        expect(ChatHistoryItemResSchema.safeParse(data).success).toBe(true);
  });

  it('puts payload variants in one event block without mixing them into complete scenarios', () => {
    const frames = (name: string) =>
      parseFrames(examples.events.find((event) => event.name === name)!.value);
    for (const event of examples.events) {
      expect(parseFrames(event.value).every((frame) => frame.event === event.name)).toBe(true);
    }
    const answers = frames('answer').map(({ data }) => data);
    expect(answers).toContain('[DONE]');
    expect(answers.some((data) => data.choices?.[0].delta.content === '')).toBe(true);
    expect(answers.some((data) => data.choices?.[0].delta.reasoning_content)).toBe(true);
    expect(answers.some((data) => data.choices?.[0].finish_reason === 'stop')).toBe(true);
    expect(
      frames('interactive')
        .map(({ data }) => data.interactive.type)
        .sort()
    ).toEqual(
      [
        'userSelect',
        'userInput',
        'agentAsk',
        'paymentPause',
        'childrenInteractive',
        'toolChildrenInteractive',
        'loopInteractive',
        'loopRunInteractive'
      ].sort()
    );
    expect(
      frames('planStatus')
        .map(({ data }) => data.planStatus.status)
        .sort()
    ).toEqual([...AgentPlanStatusSchema.shape.status.options].sort());
    expect(
      frames('plan')
        .flatMap(({ data }) => data.plan.steps.map((step: { status: string }) => step.status))
        .sort()
    ).toEqual([...AgentPlanStepStatusSchema.options].sort());
    expect(new Set(frames('sandboxStatus').map(({ data }) => data.phase)).size).toBe(12);
    expect(frames('toolResponse').map(({ data }) => data.tool.response)).toEqual([
      '导演：新海诚',
      null
    ]);
    expect(frames('error').some(({ data }) => data.code === 510003 && data.statusText)).toBe(true);
    for (const key of ['interactiveUserSelect', 'interactiveUserInput'] as const) {
      expect(parseFrames(examples.sse[key].value)).toHaveLength(2);
    }
    const ordinary = parseFrames(examples.sse.detailTrueStreamTrue.value);
    expect(ordinary.filter(({ event }) => event === 'flowNodeStatus')).toHaveLength(1);
    expect(ordinary.filter(({ event }) => event === 'chatTitle')).toHaveLength(1);
  });

  it('shows both interaction types without internal runtime fields', () => {
    for (const key of ['interactiveUserSelect', 'interactiveUserInput'] as const) {
      const json = examples.json[key].value.choices[0].message.content[0];
      const interactive = parseFrames(examples.sse[key].value)[0].data.interactive;
      expect(interactive).toEqual(json.interactive);
      expect(Object.keys(interactive).sort()).toEqual(['params', 'type']);
      expect('type' in json).toBe(version === 'v1');
    }
  });
});
