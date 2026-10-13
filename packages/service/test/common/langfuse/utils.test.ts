import { describe, expect, it } from 'vitest';
import {
  getLangfuseAssistantOutput,
  getLangfuseStepStartAttributes,
  getLangfuseTraceAttributes,
  serializeLangfuseValue
} from '@fastgpt/service/common/langfuse/utils';

describe('getLangfuseAssistantOutput', () => {
  it('extracts text content without internal reasoning', () => {
    expect(
      getLangfuseAssistantOutput([
        { reasoning: { content: 'internal reasoning' } },
        { text: { content: 'Hello' } },
        { text: { content: ', world' } }
      ])
    ).toBe('Hello, world');
  });

  it('returns an empty string when the response has no text', () => {
    expect(getLangfuseAssistantOutput([{ reasoning: { content: 'internal reasoning' } }])).toBe('');
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
      'langfuse.trace.metadata.app_id': 'app-1'
    });
    expect(getLangfuseStepStartAttributes('app-1')).toEqual({
      'langfuse.observation.metadata.app_id': 'app-1'
    });
  });
});
