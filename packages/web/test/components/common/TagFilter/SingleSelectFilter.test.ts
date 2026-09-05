import { describe, expect, it } from 'vitest';
import { filterSelectOptionsBySearch } from '../../../../components/common/TagFilter/FilterSearchInput';
import {
  getCenteredOptionScrollTop,
  resolveSingleSelectOption
} from '../../../../components/common/TagFilter/SingleSelectFilter';
import {
  createMultiSelectFilter,
  getMultiSelectFilterSummary,
  mergeRememberedFilterOptions,
  syncSelectedFilterValues,
  toggleMultiSelectFilterValue,
  toMultiSelectFilterQuery
} from '../../../../components/common/TagFilter/multiSelectFilterUtils';

describe('resolveSingleSelectOption', () => {
  it('returns the matched option and exposes an invalid value', () => {
    const options = [
      { value: 'all', label: '全部' },
      { value: 'workflow', label: '工作流' }
    ];

    expect(resolveSingleSelectOption(options, 'workflow')?.label).toBe('工作流');
    expect(resolveSingleSelectOption(options, 'missing')).toBeUndefined();
    expect(resolveSingleSelectOption([], 'all')).toBeUndefined();
  });
});

describe('getCenteredOptionScrollTop', () => {
  it('centers the selected option in the list', () => {
    expect(
      getCenteredOptionScrollTop({
        optionOffsetTop: 240,
        optionHeight: 32,
        listHeight: 160,
        scrollHeight: 640
      })
    ).toBe(176);
  });

  it('clamps the scroll position at the top and bottom boundaries', () => {
    expect(
      getCenteredOptionScrollTop({
        optionOffsetTop: 8,
        optionHeight: 32,
        listHeight: 160,
        scrollHeight: 640
      })
    ).toBe(0);
    expect(
      getCenteredOptionScrollTop({
        optionOffsetTop: 620,
        optionHeight: 32,
        listHeight: 160,
        scrollHeight: 640
      })
    ).toBe(480);
  });
});

describe('filterSelectOptionsBySearch', () => {
  it('filters by label or searchText and keeps all items when the key is empty', () => {
    const options = [
      { value: 'a', label: '工作流' },
      { value: 'b', label: 'node', searchText: 'HTTP 工具' },
      { value: 'c', label: { not: 'string' } }
    ];

    expect(filterSelectOptionsBySearch(options, '  ')).toEqual(options);
    expect(filterSelectOptionsBySearch(options, 'http').map((item) => item.value)).toEqual(['b']);
    expect(filterSelectOptionsBySearch(options, 'hidden')).toEqual([]);
  });
});

describe('multiSelectFilter helpers', () => {
  const labels = { all: '全部', unselected: '未选择', selectedSelf: '我创建的' };
  const options = [
    { value: 'me', label: '张延' },
    { value: 'u2', label: '一二三' }
  ];

  it('summarizes trigger text for all, empty, self and chips', () => {
    const base = { options, currentValue: 'me', labels };

    expect(getMultiSelectFilterSummary({ ...base, mode: 'all', values: ['me'] })).toEqual({
      text: '全部',
      extraCount: 0,
      chip: false
    });
    expect(getMultiSelectFilterSummary({ ...base, mode: 'selected', values: [] })).toEqual({
      text: '未选择',
      extraCount: 0,
      chip: false
    });
    expect(getMultiSelectFilterSummary({ ...base, mode: 'selected', values: ['me'] })).toEqual({
      text: '我创建的',
      extraCount: 0,
      chip: false
    });
    expect(
      getMultiSelectFilterSummary({ ...base, mode: 'selected', values: ['me', 'u2'] })
    ).toEqual({
      text: '张延',
      extraCount: 1,
      chip: true
    });
  });

  it('toggles from all into selected and maps query values', () => {
    const selected = toggleMultiSelectFilterValue(createMultiSelectFilter(), 'me');
    expect(selected).toEqual({ mode: 'selected', values: ['me'] });
    expect(toggleMultiSelectFilterValue(selected, 'me')).toEqual({ mode: 'selected', values: [] });
    expect(toMultiSelectFilterQuery({ mode: 'all', values: ['me'] })).toBeUndefined();
    expect(toMultiSelectFilterQuery({ mode: 'selected', values: [] })).toEqual([]);
    expect(syncSelectedFilterValues({ mode: 'all', values: ['me'] }, ['me'])).toBeNull();
    expect(syncSelectedFilterValues({ mode: 'selected', values: ['me'] }, ['me', 'u2'])).toBeNull();
    expect(
      syncSelectedFilterValues({ mode: 'selected', values: ['me', 'left'] }, ['me', 'u2'])
    ).toEqual({
      mode: 'selected',
      values: ['me']
    });
    expect(syncSelectedFilterValues({ mode: 'selected', values: ['left'] }, ['me'])).toEqual({
      mode: 'all',
      values: []
    });
  });

  it('keeps selected options that disappeared from the current list', () => {
    const current = [{ value: 'u2', label: '一二三' }];
    const remembered = [
      { value: 'me', label: '张延' },
      { value: 'u2', label: '一二三' }
    ];

    expect(mergeRememberedFilterOptions(current, ['me'], remembered)).toEqual([
      { value: 'me', label: '张延' },
      { value: 'u2', label: '一二三' }
    ]);
    expect(mergeRememberedFilterOptions(current, [], remembered)).toEqual(current);
  });
});
