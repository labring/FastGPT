import { describe, expect, it } from 'vitest';
import { formatEditorVariablePickerIcon } from '@fastgpt/web/core/workflow/utils';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';

describe('formatEditorVariablePickerIcon', () => {
  it('formats variable picker icons and preserves fields', () => {
    const variables = [
      {
        key: 'var1',
        label: 'Variable 1',
        type: VariableInputEnum.input as `${VariableInputEnum}`,
        required: true
      },
      { key: 'var2', label: 'Variable 2' }
    ];
    const result = formatEditorVariablePickerIcon(variables);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ key: 'var1', label: 'Variable 1', required: true });
    expect(result[0].icon).toBeDefined();
    expect(result[1]).toMatchObject({ key: 'var2', label: 'Variable 2' });
    expect(result[1].icon).toBeDefined();
  });

  it('handles empty array', () => {
    expect(formatEditorVariablePickerIcon([])).toEqual([]);
  });
});
