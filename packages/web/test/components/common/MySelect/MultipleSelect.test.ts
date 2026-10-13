import { describe, expect, it } from 'vitest';
import { resolveMultipleSelectItems } from '../../../../components/common/MySelect/MultipleSelect';

describe('resolveMultipleSelectItems', () => {
  it('marks missing options as invalid without exposing their raw value', () => {
    expect(
      resolveMultipleSelectItems({
        values: ['available', 'removed'],
        list: [{ value: 'available', label: '可用选项' }],
        invalidLabel: '无效值'
      })
    ).toEqual([
      { value: 'available', label: '可用选项', isInvalid: false },
      { value: 'removed', label: '无效值', isInvalid: true }
    ]);
  });
});
