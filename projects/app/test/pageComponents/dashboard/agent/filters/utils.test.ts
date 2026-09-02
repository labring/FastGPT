import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { describe, expect, it } from 'vitest';
import {
  AppListFilterSchema,
  AppListFiltersStoreSchema,
  defaultAppListFilters,
  getCreatorFilterSummary,
  resolveSceneListType,
  sanitizeCreatorTmbIds,
  toListTmbIds
} from '@/pageComponents/dashboard/agent/filters/utils';

const labels = { all: '全部', createdByMe: '我创建的', unselected: '未选择' };
const members = [
  { tmbId: 'me', memberName: '张延' },
  { tmbId: 'u2', memberName: '一二三' }
];

describe('app list filter helpers', () => {
  it('summarizes creator trigger text', () => {
    const base = { members, currentTmbId: 'me', labels };

    expect(getCreatorFilterSummary({ ...base, mode: 'all', tmbIds: ['me'] })).toEqual({
      text: '全部',
      extraCount: 0,
      chip: false
    });
    expect(getCreatorFilterSummary({ ...base, mode: 'selected', tmbIds: [] })).toEqual({
      text: '未选择',
      extraCount: 0,
      chip: false
    });
    expect(getCreatorFilterSummary({ ...base, mode: 'selected', tmbIds: ['me'] })).toEqual({
      text: '我创建的',
      extraCount: 0,
      chip: false
    });
    expect(getCreatorFilterSummary({ ...base, mode: 'selected', tmbIds: ['me', 'u2'] })).toEqual({
      text: '张延',
      extraCount: 1,
      chip: true
    });
  });

  it('maps creator filter to list tmbIds', () => {
    expect(toListTmbIds({ mode: 'all', tmbIds: ['me'] })).toBeUndefined();
    expect(toListTmbIds({ mode: 'selected', tmbIds: [] })).toEqual([]);
    expect(toListTmbIds({ mode: 'selected', tmbIds: ['me'] })).toEqual(['me']);
  });

  it('drops types and members that do not belong to the current page', () => {
    expect(resolveSceneListType(AppTypeEnum.workflow, 'agent')).toBe(AppTypeEnum.workflow);
    expect(resolveSceneListType(AppTypeEnum.workflowTool, 'agent')).toBe('all');
    expect(sanitizeCreatorTmbIds(['me', 'left'], ['me', 'u2'])).toEqual(['me']);
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
