import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { describe, expect, it } from 'vitest';
import {
  AppListFilterSchema,
  AppListFiltersStoreSchema,
  defaultAppListFilters,
  hasAppListActiveFilter,
  resolveSceneListType,
  toListTmbIds
} from '@/pageComponents/dashboard/agent/filters/utils';

describe('app list filter helpers', () => {
  it('maps creator filter to list tmbIds', () => {
    expect(toListTmbIds({ mode: 'all', tmbIds: ['me'] })).toBeUndefined();
    expect(toListTmbIds({ mode: 'selected', tmbIds: [] })).toEqual([]);
    expect(toListTmbIds({ mode: 'selected', tmbIds: ['me'] })).toEqual(['me']);
  });

  it('treats search, type and creator as active filters, but not sort', () => {
    expect(
      hasAppListActiveFilter({
        searchKey: '  ',
        type: 'all',
        creatorMode: 'all',
        applyToolbarFilters: true
      })
    ).toBe(false);
    expect(
      hasAppListActiveFilter({
        searchKey: 'bot',
        type: 'all',
        creatorMode: 'all',
        applyToolbarFilters: false
      })
    ).toBe(true);
    expect(
      hasAppListActiveFilter({
        searchKey: '',
        type: AppTypeEnum.workflow,
        creatorMode: 'all',
        applyToolbarFilters: true
      })
    ).toBe(true);
    expect(
      hasAppListActiveFilter({
        searchKey: '',
        type: 'all',
        creatorMode: 'selected',
        applyToolbarFilters: true
      })
    ).toBe(true);
    expect(
      hasAppListActiveFilter({
        searchKey: '',
        type: AppTypeEnum.workflow,
        creatorMode: 'selected',
        applyToolbarFilters: false
      })
    ).toBe(false);
  });

  it('drops types that do not belong to the current page', () => {
    expect(resolveSceneListType(AppTypeEnum.workflow, 'agent')).toBe(AppTypeEnum.workflow);
    expect(resolveSceneListType(AppTypeEnum.workflowTool, 'agent')).toBe('all');
  });

  it('fills store defaults and rejects invalid persisted types', () => {
    expect(AppListFilterSchema.parse({})).toEqual(defaultAppListFilters);
    expect(AppListFilterSchema.safeParse({ type: 'not-an-app-type' }).success).toBe(false);
    expect(
      AppListFiltersStoreSchema.parse({
        agent: { type: AppTypeEnum.workflow }
      })
    ).toEqual({
      agent: { ...defaultAppListFilters, type: AppTypeEnum.workflow },
      tool: defaultAppListFilters,
      templateMarket: { mode: 'all', tagIds: [] }
    });
  });
});
