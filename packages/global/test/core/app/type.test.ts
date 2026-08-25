import { describe, expect, it } from 'vitest';
import { AppChatConfigTypeSchema } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';

describe('AppChatConfigTypeSchema', () => {
  it('should reject old boolean questionGuide format', () => {
    expect(AppChatConfigTypeSchema.safeParse({ questionGuide: true }).success).toBe(false);
    expect(AppChatConfigTypeSchema.safeParse({ questionGuide: false }).success).toBe(false);
  });

  it('should keep questionGuide object format', () => {
    const questionGuide = {
      open: true,
      modelId: 'gpt-5',
      customPrompt: 'test prompt'
    };

    expect(AppChatConfigTypeSchema.parse({ questionGuide }).questionGuide).toEqual(questionGuide);
  });

  it('should keep welcomeConfig fields', () => {
    const result = AppChatConfigTypeSchema.parse({
      welcomeConfig: {
        welcomeText: 'hello',
        welcomeQuestions: ['question one']
      }
    });

    expect(result.welcomeConfig).toEqual({
      welcomeText: 'hello',
      welcomeQuestions: ['question one']
    });
  });

  it('should fill option label with value when variable option label is missing', () => {
    const result = AppChatConfigTypeSchema.parse({
      variables: [
        {
          key: 'newSelect',
          label: 'New Select',
          type: VariableInputEnum.select,
          description: '',
          list: [{ value: 'option-a' }]
        },
        {
          key: 'legacySelect',
          label: 'Legacy Select',
          type: VariableInputEnum.select,
          description: '',
          enums: [{ value: 'legacy-option' }]
        }
      ]
    });

    expect(result.variables?.[0].list).toEqual([{ label: 'option-a', value: 'option-a' }]);
    expect(result.variables?.[1].enums).toEqual([
      { label: 'legacy-option', value: 'legacy-option' }
    ]);
  });

  // ⚠️ 热升级兼容：legacy `model` 字段必须被 schema 保留（防止 zod strip 丢弃，热升级分析 §6.1/§6.8）
  it('should keep legacy questionGuide.model field', () => {
    const questionGuide = {
      open: true,
      model: 'gpt-4o',
      customPrompt: 'test prompt'
    };

    const result = AppChatConfigTypeSchema.parse({ questionGuide });
    expect(result.questionGuide).toEqual(questionGuide);
  });

  it('should keep legacy ttsConfig.model field', () => {
    const ttsConfig = {
      type: 'model',
      model: 'tts-1',
      voice: 'alloy',
      speed: 1
    };

    const result = AppChatConfigTypeSchema.parse({ ttsConfig });
    expect(result.ttsConfig).toEqual(ttsConfig);
  });
});
