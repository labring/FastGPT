import { describe, expect, it } from 'vitest';
import {
  isStreamCompletionResponse,
  normalizeCompletionFinishReason,
  normalizeNativeToolCalls
} from '@fastgpt/service/core/ai/llm/request/response/normalize';

describe('normalizeNativeToolCalls', () => {
  it('should normalize copies and keep only declared tools', () => {
    const toolCalls = [
      {
        id: 'a',
        type: 'function' as const,
        function: { name: 'functions.search', arguments: ' \t' }
      },
      { id: 'b', type: 'function' as const, function: { name: 'unknown', arguments: '{}' } }
    ];
    const result = normalizeNativeToolCalls({
      toolCalls,
      toolNames: new Set(['search'])
    });
    expect(result).toEqual([
      { id: 'a', type: 'function', function: { name: 'search', arguments: '{}' } }
    ]);
    expect(toolCalls[0].function).toEqual({ name: 'functions.search', arguments: ' \t' });
  });

  it('should tolerate non-string or missing name and arguments from raw provider responses', () => {
    const toolCalls = [
      { id: 'null_args', type: 'function', function: { name: 'search', arguments: null } },
      { id: 'missing_args', type: 'function', function: { name: 'search' } },
      { id: 'object_args', type: 'function', function: { name: 'search', arguments: { q: 1 } } },
      { id: 'number_args', type: 'function', function: { name: 'search', arguments: 1 } },
      { id: 'missing_function', type: 'function' },
      { id: 'null_name', type: 'function', function: { name: null, arguments: '{}' } }
    ] as any[];

    const result = normalizeNativeToolCalls({
      toolCalls,
      toolNames: new Set(['search'])
    });

    expect(result).toEqual([
      { id: 'null_args', type: 'function', function: { name: 'search', arguments: '{}' } },
      { id: 'missing_args', type: 'function', function: { name: 'search', arguments: '{}' } },
      { id: 'object_args', type: 'function', function: { name: 'search', arguments: '{"q":1}' } },
      { id: 'number_args', type: 'function', function: { name: 'search', arguments: '1' } }
    ]);
  });

  it('should filter malformed tools without modifying the raw calls', () => {
    const result = normalizeNativeToolCalls({
      toolCalls: [
        { id: 'broken', type: 'function', function: { name: null, arguments: null } }
      ] as any,
      toolNames: new Set(['search'])
    });

    expect(result).toEqual([]);
  });
});

describe('normalizeCompletionFinishReason', () => {
  it('should prefer error over raw finish reason', () => {
    expect(
      normalizeCompletionFinishReason({
        rawFinishReason: 'stop',
        isStreamResponse: true,
        hasResponse: true,
        error: new Error('failed')
      })
    ).toBe('error');
  });

  it('should keep raw finish reason when it exists', () => {
    expect(
      normalizeCompletionFinishReason({
        rawFinishReason: 'tool_calls',
        isStreamResponse: true,
        hasResponse: true
      })
    ).toBe('tool_calls');
  });

  it('should mark partial stream response without finish reason as abnormal close', () => {
    expect(
      normalizeCompletionFinishReason({
        rawFinishReason: null,
        isStreamResponse: true,
        hasResponse: true
      })
    ).toBe('abnormal_close');
  });

  it('should fill stop for non-stream or empty stream without finish reason', () => {
    expect(
      normalizeCompletionFinishReason({
        rawFinishReason: undefined,
        isStreamResponse: false,
        hasResponse: false
      })
    ).toBe('stop');
  });
});

describe('isStreamCompletionResponse', () => {
  it('should detect stream responses by iterator or controller fields', () => {
    expect(isStreamCompletionResponse({ iterator: () => undefined } as any)).toBe(true);
    expect(isStreamCompletionResponse({ controller: { abort: () => undefined } } as any)).toBe(
      true
    );
  });

  it('should reject non-object and normal completion responses', () => {
    expect(isStreamCompletionResponse(null as any)).toBe(false);
    expect(isStreamCompletionResponse({ choices: [] } as any)).toBe(false);
  });
});
