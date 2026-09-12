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
      model: 'gpt-5',
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

  it('should validate and keep entry point fields', () => {
    const entryPoints = [
      { id: 'knowledge', name: 'Knowledge Q&A', icon: '/icons/knowledge.svg' },
      { id: 'writing', name: 'Writing' }
    ];

    expect(AppChatConfigTypeSchema.parse({ entryPoints }).entryPoints).toEqual(entryPoints);
    expect(
      AppChatConfigTypeSchema.safeParse({
        entryPoints: [{ id: 'invalid', name: 'Invalid', icon: 1 }]
      }).success
    ).toBe(false);
    expect(
      AppChatConfigTypeSchema.safeParse({
        entryPoints: [
          { id: 'first', name: 'Same name' },
          { id: 'second', name: ' Same name ' }
        ]
      }).success
    ).toBe(false);
  });

  it('should normalize null optional chat config fields to undefined', () => {
    const result = AppChatConfigTypeSchema.parse({
      welcomeText: null,
      welcomeConfig: null,
      variables: null,
      autoExecute: null,
      questionGuide: null,
      ttsConfig: null,
      whisperConfig: null,
      scheduledTriggerConfig: null,
      chatInputGuide: null,
      fileSelectConfig: null,
      entryPoints: null,
      instruction: null
    });

    expect(result.welcomeText).toBeUndefined();
    expect(result.welcomeConfig).toBeUndefined();
    expect(result.variables).toBeUndefined();
    expect(result.autoExecute).toBeUndefined();
    expect(result.questionGuide).toBeUndefined();
    expect(result.ttsConfig).toBeUndefined();
    expect(result.whisperConfig).toBeUndefined();
    expect(result.scheduledTriggerConfig).toBeUndefined();
    expect(result.chatInputGuide).toBeUndefined();
    expect(result.fileSelectConfig).toBeUndefined();
    expect(result.entryPoints).toBeUndefined();
    expect(result.instruction).toBeUndefined();
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
});
