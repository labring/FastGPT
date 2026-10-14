import { describe, expect, it } from 'vitest';
import { formatEditorVariablePickerIcon } from '@fastgpt/web/core/workflow/utils';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';

describe('formatEditorVariablePickerIcon', () => {
  it('should add icon based on variable type', () => {
    const variables = [
      { key: 'var1', label: 'Variable 1', type: VariableInputEnum.input as `${VariableInputEnum}` }
    ];
    const result = formatEditorVariablePickerIcon(variables);
    expect(result[0].icon).toBeDefined();
    expect(result[0].key).toBe('var1');
    expect(result[0].label).toBe('Variable 1');
  });

  it('should use default input icon when type is undefined', () => {
    const variables = [{ key: 'var1', label: 'Variable 1' }];
    const result = formatEditorVariablePickerIcon(variables);
    expect(result[0].icon).toBeDefined();
  });

  it('should preserve required field', () => {
    const variables = [
      {
        key: 'var1',
        label: 'Variable 1',
        type: VariableInputEnum.input as `${VariableInputEnum}`,
        required: true
      }
    ];
    const result = formatEditorVariablePickerIcon(variables);
    expect(result[0].required).toBe(true);
  });

  it('should handle empty array', () => {
    const result = formatEditorVariablePickerIcon([]);
    expect(result).toEqual([]);
  });
});
