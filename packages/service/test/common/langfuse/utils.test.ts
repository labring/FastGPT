import { describe, expect, it } from 'vitest';
import type {
  AIChatItemValueItemType,
  ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  getLangfuseStepStartAttributes,
  getLangfuseTraceAttributes,
  getLangfuseTraceOutput,
  langfuseTraceOutputAllowedKeys,
  serializeLangfuseTraceOutput,
  serializeLangfuseValue
} from '@fastgpt/service/common/langfuse/utils';

const buildToolItem = (
  overrides: Partial<ToolModuleResponseItemType> = {}
): ToolModuleResponseItemType => ({
  id: 'tool-1',
  toolName: 'get_weather',
  toolAvatar: 'core/app/type/plugin',
  params: '{"city":"北京"}',
  response: '晴',
  functionName: 'get_weather',
  ...overrides
});

describe('getLangfuseTraceOutput', () => {
  it('merges consecutive pure text and reasoning items like 1.5.0', () => {
    expect(
      getLangfuseTraceOutput([
        { reasoning: { content: 'think-1' } },
        { reasoning: { content: 'think-2' } },
        { text: { content: 'answer-1' } },
        { text: { content: 'answer-2' } }
      ])
    ).toEqual([
      { reasoning: { content: 'think-1think-2' } },
      { text: { content: 'answer-1answer-2' } }
    ]);
  });

  it('keeps boundaries of items that carry tools or interactive fields', () => {
    const tool = buildToolItem();
    const items: AIChatItemValueItemType[] = [
      { text: { content: 'before' } },
      { text: { content: 'with-tool' }, tools: [tool] },
      { text: { content: 'after' } }
    ];

    expect(getLangfuseTraceOutput(items)).toEqual(items);
  });

  it('does not merge text into a previous reasoning item', () => {
    const items: AIChatItemValueItemType[] = [
      { reasoning: { content: 'think' } },
      { text: { content: 'answer' } }
    ];

    expect(getLangfuseTraceOutput(items)).toEqual(items);
  });

  it('does not mutate the caller items', () => {
    const values: AIChatItemValueItemType[] = [
      { text: { content: 'A' } },
      { text: { content: 'B' } }
    ];
    getLangfuseTraceOutput(values);
    expect(values[0].text?.content).toBe('A');
    expect(values[1].text?.content).toBe('B');
  });

  it('falls back to an empty text item when output is empty', () => {
    expect(getLangfuseTraceOutput([])).toEqual([{ text: { content: '' } }]);
  });
});

describe('serializeLangfuseTraceOutput', () => {
  it('drops input context, recovery state and internal fields', () => {
    const item: AIChatItemValueItemType = {
      inputContext: { content: 'full rewritten user input' },
      contextCheckpoint: 'checkpoint-snapshot',
      userMessage: { content: 'hidden instruction', source: 'server' },
      toolResponses: [{ id: 'tool-1', response: 'private' }],
      text: { content: 'answer' }
    };

    expect(JSON.parse(serializeLangfuseTraceOutput([item]))).toEqual([
      { text: { content: 'answer' } }
    ]);
  });

  it('drops interactive resume snapshots but keeps display fields', () => {
    const interactive: WorkflowInteractiveResponseType = {
      type: 'userInput',
      entryNodeIds: ['workflowStartNodeId'],
      memoryEdges: [],
      nodeOutputs: [
        {
          nodeId: 'workflowStartNodeId',
          key: NodeOutputKeyEnum.userChatInput,
          value: 'full user input'
        }
      ],
      params: {
        description: '请补充信息',
        inputForm: []
      }
    };

    expect(JSON.parse(serializeLangfuseTraceOutput([{ interactive }]))).toEqual([
      {
        interactive: {
          type: 'userInput',
          params: { description: '请补充信息', inputForm: [] }
        }
      }
    ]);
  });

  it('keeps recent complete items when the count exceeds the array limit', () => {
    const tool = buildToolItem();
    const items: AIChatItemValueItemType[] = Array.from({ length: 120 }, (_, index) =>
      index === 119 ? { text: { content: 'final-answer' } } : { tools: [tool] }
    );

    const parsed = JSON.parse(serializeLangfuseTraceOutput(items));

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeLessThanOrEqual(100);
    expect(
      parsed.every((item: unknown) => !!item && typeof item === 'object' && !Array.isArray(item))
    ).toBe(true);
    expect(parsed[parsed.length - 1]).toEqual({ text: { content: 'final-answer' } });
  });

  it('keeps a JSON object array when the serialized output exceeds the size limit', () => {
    const items: AIChatItemValueItemType[] = Array.from({ length: 12 }, (_, index) => ({
      tools: [buildToolItem({ id: `tool-${index}`, response: 'x'.repeat(10000) })]
    }));

    const serialized = serializeLangfuseTraceOutput(items);
    const parsed = JSON.parse(serialized);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.every((item: unknown) => !!item && typeof item === 'object')).toBe(true);
    expect(serialized.length).toBeLessThanOrEqual(100000);
  });

  it('keeps an empty output as an array with an empty text item', () => {
    expect(JSON.parse(serializeLangfuseTraceOutput([]))).toEqual([{ text: { content: '' } }]);
  });
});

describe('langfuseTraceOutputAllowedKeys', () => {
  it('allows reasoning items in trace.output and keeps other exclusions', () => {
    expect(langfuseTraceOutputAllowedKeys.has('reasoning')).toBe(true);
    expect(
      JSON.parse(
        serializeLangfuseValue(
          [{ reasoning: { content: 'think' } }, { text: { content: 'Hello' } }],
          { keepExcludedKeys: langfuseTraceOutputAllowedKeys }
        ) ?? ''
      )
    ).toEqual([{ reasoning: { content: 'think' } }, { text: { content: 'Hello' } }]);
  });
});

describe('serializeLangfuseValue', () => {
  it('removes sensitive workflow fields recursively and supports bigint', () => {
    expect(
      JSON.parse(
        serializeLangfuseValue({
          answer: 1n,
          history: ['private'],
          nested: { reasoningText: 'private', value: 'visible' }
        }) ?? ''
      )
    ).toEqual({ answer: '1', nested: { value: 'visible' } });
  });

  it('keeps explicitly allowed excluded keys only where the caller opts in', () => {
    expect(
      JSON.parse(
        serializeLangfuseValue(
          { reasoningText: 'think', history: ['private'] },
          { keepExcludedKeys: new Set(['reasoningText']) }
        ) ?? ''
      )
    ).toEqual({ reasoningText: 'think' });
  });

  it('bounds strings, arrays, object keys and nesting depth', () => {
    const serialized = serializeLangfuseValue({
      longText: 'a'.repeat(10001),
      items: Array.from({ length: 101 }, (_, index) => index),
      values: Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`key${index}`, index])),
      nested: {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    level7: { level8: 'too deep' }
                  }
                }
              }
            }
          }
        }
      }
    });
    const parsed = JSON.parse(serialized ?? '');

    expect(parsed.longText).toBe(`${'a'.repeat(10000)}...[truncated]`);
    expect(parsed.items).toHaveLength(101);
    expect(parsed.items.at(-1)).toBe('[Truncated]');
    expect(parsed.values.__truncated).toBe(true);
    expect(parsed.nested.level1.level2.level3.level4.level5.level6.level7).toBe('[MaxDepth]');
  });

  it('handles circular, binary and unsupported values without throwing', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(
      JSON.parse(
        serializeLangfuseValue({
          circular,
          binary: new Uint8Array([1, 2]),
          ignored: undefined
        }) ?? ''
      )
    ).toEqual({
      circular: { self: '[Circular]' },
      binary: '[Uint8Array length=2]'
    });
    expect(serializeLangfuseValue(Symbol('ignored'))).toBeUndefined();
  });

  it('caps the total payload and ignores objects that throw during inspection', () => {
    const oversized = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [`key${index}`, 'a'.repeat(10000)])
    );
    const serialized = serializeLangfuseValue(oversized);
    expect(JSON.parse(serialized ?? '')).toMatch(/\.\.\.\[truncated\]$/);

    const invalid = Object.create(null);
    Object.defineProperty(invalid, 'value', {
      enumerable: true,
      get() {
        throw new Error('cannot read');
      }
    });
    expect(serializeLangfuseValue(invalid)).toBeUndefined();
  });
});

describe('Langfuse initial attributes', () => {
  it('adds a Langfuse marker to root and step spans at creation time', () => {
    expect(
      getLangfuseTraceAttributes({
        sessionId: 'chat-1',
        userId: 'user-1',
        appId: 'app-1',
        appName: 'Assistant',
        input: [{ text: 'hello' }]
      })
    ).toMatchObject({
      'langfuse.trace.name': 'message',
      'langfuse.session.id': 'chat-1',
      'langfuse.user.id': 'user-1',
      'langfuse.trace.metadata.app_id': 'app-1',
      'langfuse.observation.metadata.app_id': 'app-1'
    });
    expect(
      getLangfuseStepStartAttributes({ appId: 'app-1', nodeId: 'node-1', nodeName: 'Node' })
    ).toEqual({
      'langfuse.observation.metadata.app_id': 'app-1',
      'langfuse.observation.metadata.nodeId': 'node-1',
      'langfuse.observation.metadata.nodeName': 'Node',
      'langfuse.trace.name': 'message'
    });
    expect(getLangfuseStepStartAttributes({ appId: 'app-1', nodeId: 'node-1' })).toEqual({
      'langfuse.observation.metadata.app_id': 'app-1',
      'langfuse.observation.metadata.nodeId': 'node-1',
      'langfuse.trace.name': 'message'
    });
  });
});
