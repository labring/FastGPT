import { describe, expect, it } from 'vitest';
import {
  isStreamCompletionResponse,
  normalizeCompletionFinishReason
} from '@fastgpt/service/core/ai/llm/request/response/normalize';

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
