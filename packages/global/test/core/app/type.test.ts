import { describe, expect, it } from 'vitest';
import { AppChatConfigTypeSchema } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';

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
