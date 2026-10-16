import { describe, expect, it } from 'vitest';
import {
  isStreamCompletionResponse,
  normalizeCompletionFinishReason,
  normalizeNativeToolCalls
} from '@fastgpt/service/core/ai/llm/request/response/normalize';

describe('normalizeNativeToolCalls', () => {
  it('should normalize copies and keep only declared tools without hiding an upstream error', () => {
    const toolCalls = [
      {
        id: 'a',
        type: 'function' as const,
        function: { name: 'functions.search', arguments: ' \t' }
      },
      { id: 'b', type: 'function' as const, function: { name: 'unknown', arguments: '{}' } }
    ];
    const error = new Error('upstream failed');
    const result = normalizeNativeToolCalls({
      toolCalls,
      toolNames: new Set(['search']),
      finish_reason: 'length',
      error,
      protocolError: { message: 'identity conflict', toolCall: toolCalls[1] }
    });
    expect(result.error).toBe(error);
    expect(result.finish_reason).toBe('length');
    expect(result.toolCalls).toEqual([
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
      toolNames: new Set(['search']),
      finish_reason: 'tool_calls'
    });

    expect(result.error).toBeUndefined();
    expect(result.finish_reason).toBe('tool_calls');
    expect(result.toolCalls).toEqual([
      { id: 'null_args', type: 'function', function: { name: 'search', arguments: '{}' } },
      { id: 'missing_args', type: 'function', function: { name: 'search', arguments: '{}' } },
      { id: 'object_args', type: 'function', function: { name: 'search', arguments: '{"q":1}' } },
      { id: 'number_args', type: 'function', function: { name: 'search', arguments: '1' } }
    ]);
  });

  it('should report an invalid-tool error instead of crashing when every raw call is malformed', () => {
    const result = normalizeNativeToolCalls({
      toolCalls: [
        { id: 'broken', type: 'function', function: { name: null, arguments: null } }
      ] as any,
      toolNames: new Set(['search']),
      finish_reason: 'tool_calls'
    });

    expect(result).toMatchObject({
      finish_reason: 'error',
      toolCalls: [],
      error: { code: 'LLM_TOOL_CALL_ERROR' }
    });
  });

  it.each(
    [
      { kind: 'Error instance', error: new Error('upstream quota exhausted') },
      {
        kind: 'API object',
        error: { message: 'upstream quota exhausted', code: 'quota_exceeded' }
      },
      { kind: 'API string', error: 'upstream quota exhausted' }
    ].flatMap((scenario) => [false, true].map((conflict) => ({ ...scenario, conflict })))
  )(
    'should prefer $kind over missing tools with protocol conflict=$conflict',
    ({ error, conflict }) => {
      const result = normalizeNativeToolCalls({
        toolCalls: [
          { id: 'invalid', type: 'function', function: { name: 'unknown', arguments: '{}' } }
        ],
        toolNames: new Set(['search']),
        finish_reason: 'tool_calls',
        error,
        protocolError: conflict ? { message: 'tool identity conflict', toolCall: {} } : undefined
      });

      expect(result.error).toBe(error);
      expect(result.toolCalls).toEqual([]);
    }
  );

  it.each([undefined, 'tool name changed from search to private_provider_tool.'])(
    'should return the same public error while keeping diagnostic=%s in the context',
    (reason) => {
      const toolCalls = [
        { id: 'raw_call', type: 'function' as const, function: { name: 'unknown', arguments: '' } }
      ];
      const result = normalizeNativeToolCalls({
        toolCalls,
        toolNames: new Set(['search']),
        finish_reason: 'tool_calls',
        protocolError: reason ? { message: reason, toolCall: toolCalls[0] } : undefined
      });

      expect(result.finish_reason).toBe('error');
      expect(result.error.message).toBe(
        'LLM tool call error: no valid tool calls matched the requested tools.'
      );
      expect(result.error.cause).toMatchObject({
        finish_reason: 'tool_calls',
        receivedToolCalls: toolCalls
      });
      expect(result.error.cause.reason).toBe(reason);
      expect(toolCalls[0].function.arguments).toBe('');
    }
  );
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
