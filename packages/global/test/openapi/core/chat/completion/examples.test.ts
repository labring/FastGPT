import { describe, expect, it } from 'vitest';
import { getChatCompletionResponseExamples } from '../../../../../openapi/core/chat/completion/examples';
import { openAPIDocument } from '../../../../../openapi/provider/devapi';
import { AgentPlanSchema, AgentPlanStatusSchema } from '../../../../../core/ai/agent/type';
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
    const content = openAPIDocument.paths![`/${version}/chat/completions`]!.post!.responses![200];
    if ('$ref' in content) throw new Error('Unexpected response reference');
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
      examples.events.map((item) => [item.name, parseFrames(item.value)[0].data])
    );
    expect(events.has('flowNodeResponse')).toBe(version === 'v2');
    expect(events.has('flowResponses')).toBe(version === 'v1');
    const trace = parseFrames(examples.sse.detailTrueStreamTrue.value);
    expect(
      trace.some(({ event }) => event === (version === 'v1' ? 'flowResponses' : 'flowNodeResponse'))
    ).toBe(true);
    expect(AgentPlanSchema.safeParse(events.get('plan').plan).success).toBe(true);
    expect(AgentPlanStatusSchema.safeParse(events.get('planStatus').planStatus).success).toBe(true);
    expect(ToolModuleResponseItemSchema.safeParse(events.get('toolCall').tool).success).toBe(true);
    expect(SkillModuleResponseItemSchema.safeParse(events.get('skillCall').skill).success).toBe(
      true
    );
    if (version === 'v2')
      expect(ChatHistoryItemResSchema.safeParse(events.get('flowNodeResponse')).success).toBe(true);
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
