import { describe, expect, it } from 'vitest';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import { StopV2ChatResponseSchema } from '@fastgpt/global/openapi/core/chat/controler/api';

describe('StopV2ChatResponseSchema', () => {
  it('parses completed stop response with chat generate status', () => {
    const result = StopV2ChatResponseSchema.parse({
      success: true,
      completed: true,
      chatGenerateStatus: ChatGenerateStatusEnum.done
    });

    expect(result).toEqual({
      success: true,
      completed: true,
      chatGenerateStatus: ChatGenerateStatusEnum.done
    });
  });

  it('requires completed flag', () => {
    expect(() =>
      StopV2ChatResponseSchema.parse({
        success: true
      })
    ).toThrow();
  });
});
