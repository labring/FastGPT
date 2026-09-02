import { describe, expect, it } from 'vitest';
import { resolveSingleSelectOption } from '../../../../components/common/TagFilter/SingleSelectFilter';

describe('resolveSingleSelectOption', () => {
  it('returns the matched option and falls back to the first', () => {
    const options = [
      { value: 'all', label: '全部' },
      { value: 'workflow', label: '工作流' }
    ];

    expect(resolveSingleSelectOption(options, 'workflow')?.label).toBe('工作流');
    expect(resolveSingleSelectOption(options, 'missing')?.value).toBe('all');
    expect(resolveSingleSelectOption([], 'all')).toBeUndefined();
  });
});
