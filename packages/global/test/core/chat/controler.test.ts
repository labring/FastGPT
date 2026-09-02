import { describe, expect, it } from 'vitest';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import { StopV2ChatResponseSchema } from '@fastgpt/global/openapi/core/chat/controler/api';

describe('StopV2ChatResponseSchema', () => {
  it('parses immediate stop acknowledgement with conservative runtime status', () => {
    const result = StopV2ChatResponseSchema.parse({
      success: true,
      completed: false,
      chatGenerateStatus: ChatGenerateStatusEnum.generating
    });

    expect(result).toEqual({
      success: true,
      completed: false,
      chatGenerateStatus: ChatGenerateStatusEnum.generating
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
