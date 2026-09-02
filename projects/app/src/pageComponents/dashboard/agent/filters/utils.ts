import { AppListSortEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { toMultiSelectFilterQuery } from '@fastgpt/web/components/common/TagFilter';
import z from 'zod';

/** 创建者缺省就是「全部」：不传 tmbIds，列表不过滤创建者。 */
export const defaultCreatorFilter = {
  mode: 'all' as const,
  tmbIds: [] as string[]
};

const CreatorFilterSchema = z
  .object({
    mode: z.enum(['all', 'selected']).default('all'),
    tmbIds: z.array(z.string()).default([])
  })
  .default(defaultCreatorFilter);

/**
 * Agent / Tool 单页筛选。存在团队筛选 store 的二级字段里。搜索不在这里，刷新后清空。
 */
export const AppListFilterSchema = z.object({
  type: z.union([z.literal('all'), z.enum(AppTypeEnum)]).default('all'),
  sort: z.enum(AppListSortEnum).default(AppListSortEnum.updateTimeDesc),
  creator: CreatorFilterSchema
});

export type AppListFilterType = z.infer<typeof AppListFilterSchema>;
export type AppListFilterScene = 'agent' | 'tool';

export const defaultAppListFilters: AppListFilterType = {
  type: 'all',
  sort: AppListSortEnum.updateTimeDesc,
  creator: defaultCreatorFilter
};

/** 模板市场分类缺省就是「全部」，列表按标签分组全展示。 */
export const defaultTemplateMarketFilter = {
  mode: 'all' as const,
  tagIds: [] as string[]
};

const TemplateMarketFilterSchema = z
  .object({
    mode: z.enum(['all', 'selected']).default('all'),
    tagIds: z.array(z.string()).default([])
  })
  .default(defaultTemplateMarketFilter);

export type TemplateMarketFilterType = z.infer<typeof TemplateMarketFilterSchema>;

/** Agent / Tool / 模板市场共用一份团队筛选 store，用二级字段区分页面。 */
export const AppListFiltersStoreSchema = z.object({
  agent: AppListFilterSchema.default(defaultAppListFilters),
  tool: AppListFilterSchema.default(defaultAppListFilters),
  templateMarket: TemplateMarketFilterSchema
});

export type AppListFiltersStoreType = z.infer<typeof AppListFiltersStoreSchema>;

export const defaultAppListFiltersStore: AppListFiltersStoreType = {
  agent: defaultAppListFilters,
  tool: defaultAppListFilters,
  templateMarket: defaultTemplateMarketFilter
};

export const agentListTypeValues = [
  AppTypeEnum.workflow,
  AppTypeEnum.simple,
  AppTypeEnum.chatAgent
] as const;
export const toolListTypeValues = [
  AppTypeEnum.workflowTool,
  AppTypeEnum.httpToolSet,
  AppTypeEnum.mcpToolSet
] as const;

/** 当前页没有的类型当成全部，避免脏数据把列表筛空。 */
export const resolveSceneListType = (
  type: AppListFilterType['type'],
  scene: AppListFilterScene
): AppListFilterType['type'] => {
  if (type === 'all') return 'all';
  const allowed = scene === 'tool' ? toolListTypeValues : agentListTypeValues;
  return allowed.some((item) => item === type) ? type : 'all';
};

/** 转成列表接口的 tmbIds：全部不传，已选含空数组。 */
export const toListTmbIds = (creator?: AppListFilterType['creator']): string[] | undefined =>
  toMultiSelectFilterQuery(creator ? { mode: creator.mode, values: creator.tmbIds } : undefined);

/**
 * 工作台列表是否处于「筛选后可能为空」的状态。
 * 排序不算筛选：改排序不会把列表筛空，空态仍应走首次创建。
 * 移动端工具栏筛选项不可见时，只看搜索。
 */
export const hasAppListActiveFilter = ({
  searchKey,
  type,
  creatorMode,
  applyToolbarFilters
}: {
  searchKey: string;
  type: AppListFilterType['type'];
  creatorMode: AppListFilterType['creator']['mode'];
  applyToolbarFilters: boolean;
}) => {
  if (searchKey.trim()) return true;
  if (!applyToolbarFilters) return false;
  return type !== 'all' || creatorMode === 'selected';
};
