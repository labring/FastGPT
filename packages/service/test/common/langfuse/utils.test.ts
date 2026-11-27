import { describe, expect, it } from 'vitest';
import {
  getLangfuseStepStartAttributes,
  getLangfuseTraceAttributes,
  getLangfuseTraceOutput,
  langfuseTraceOutputAllowedKeys,
  serializeLangfuseValue
} from '@fastgpt/service/common/langfuse/utils';

describe('getLangfuseTraceOutput', () => {
  it('merges consecutive text and reasoning items like 1.5.0', () => {
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

  it('keeps item boundaries of other value types', () => {
    const tools = [{ id: 'tool-1', response: 'ok' }];
    expect(
      getLangfuseTraceOutput([
        { text: { content: 'before' } },
        { tools } as any,
        { text: { content: 'after' } }
      ])
    ).toEqual([{ text: { content: 'before' } }, { tools }, { text: { content: 'after' } }]);
  });

  it('does not mutate the caller items', () => {
    const values: any[] = [{ text: { content: 'A' } }, { text: { content: 'B' } }];
    getLangfuseTraceOutput(values);
    expect(values[0].text.content).toBe('A');
    expect(values[1].text.content).toBe('B');
  });

  it('falls back to an empty text item when output is empty', () => {
    expect(getLangfuseTraceOutput([])).toEqual([{ text: { content: '' } }]);
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
