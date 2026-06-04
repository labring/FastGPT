import { describe, expect, it } from 'vitest';
import { AppChatConfigTypeSchema } from '@fastgpt/global/core/app/type';

describe('AppChatConfigTypeSchema', () => {
  it('should adapt old boolean questionGuide format', () => {
    expect(AppChatConfigTypeSchema.parse({ questionGuide: true }).questionGuide).toEqual({
      open: true
    });
    expect(AppChatConfigTypeSchema.parse({ questionGuide: false }).questionGuide).toEqual({
      open: false
    });
  });

  it('should keep questionGuide object format', () => {
    const questionGuide = {
      open: true,
      model: 'gpt-5',
      customPrompt: 'test prompt'
    };

    expect(AppChatConfigTypeSchema.parse({ questionGuide }).questionGuide).toEqual(questionGuide);
  });
});
