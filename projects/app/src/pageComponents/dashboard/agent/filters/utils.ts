import { AppListSortEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ListAppV2BodyType } from '@fastgpt/global/openapi/core/app/common/api';
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

export const ResourceListFilterSchema = z.object({
  sort: z.enum(AppListSortEnum).default(AppListSortEnum.updateTimeDesc),
  creator: CreatorFilterSchema
});
export type ResourceListFilterType = z.infer<typeof ResourceListFilterSchema>;

export const defaultResourceListFilters: ResourceListFilterType = {
  sort: AppListSortEnum.updateTimeDesc,
  creator: defaultCreatorFilter
};

export const DatasetListFilterSchema = ResourceListFilterSchema.extend({
  type: z.union([z.literal('all'), z.enum(DatasetTypeEnum)]).default('all')
});
export type DatasetListFilterType = z.infer<typeof DatasetListFilterSchema>;
export const defaultDatasetListFilters: DatasetListFilterType = {
  ...defaultResourceListFilters,
  type: 'all'
};

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
  skill: ResourceListFilterSchema.default(defaultResourceListFilters),
  dataset: DatasetListFilterSchema.default(defaultDatasetListFilters),
  templateMarket: TemplateMarketFilterSchema
});

export type AppListFiltersStoreType = z.infer<typeof AppListFiltersStoreSchema>;

export const defaultAppListFiltersStore: AppListFiltersStoreType = {
  agent: defaultAppListFilters,
  tool: defaultAppListFilters,
  skill: defaultResourceListFilters,
  dataset: defaultDatasetListFilters,
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

/** Preserve the creator selection when building the paginated app list request. */
export const buildAppListRequest = ({
  parentId,
  type,
  searchKey,
  offset,
  pageSize,
  sort,
  tmbIds
}: Pick<
  ListAppV2BodyType,
  'parentId' | 'type' | 'searchKey' | 'offset' | 'pageSize' | 'sort' | 'tmbIds'
>) => ({
  parentId,
  type,
  searchKey,
  offset,
  pageSize,
  ...(sort ? { sort } : {}),
  ...(tmbIds !== undefined ? { tmbIds } : {})
});

/** 卡片时间与排序依据保持一致：最近更新显示更新时间，创建时间排序显示创建时间。 */
export const getResourceListDisplayTime = ({
  sort,
  createTime,
  updateTime
}: {
  sort: AppListSortEnum;
  createTime: Date;
  updateTime: Date;
}) => (sort === AppListSortEnum.updateTimeDesc ? updateTime : createTime);

type ResourceListActiveFilterProps = {
  searchKey: string;
  type?: string;
  creatorMode: AppListFilterType['creator']['mode'];
  applyToolbarFilters: boolean;
};

/**
 * 判断资源列表是否存在会改变结果集的筛选条件。
 * 排序只改变顺序，不影响空结果状态；移动端未展示的筛选条件也不参与判断。
 */
export const hasResourceListActiveFilter = ({
  searchKey,
  type,
  creatorMode,
  applyToolbarFilters
}: ResourceListActiveFilterProps) => {
  if (searchKey.trim()) return true;
  if (!applyToolbarFilters) return false;
  return type !== undefined && type !== 'all' ? true : creatorMode === 'selected';
};

/** 判断 Agent 列表是否处于可能返回空结果的筛选状态。 */
export const hasAppListActiveFilter = (props: {
  searchKey: string;
  type: AppListFilterType['type'];
  creatorMode: AppListFilterType['creator']['mode'];
  applyToolbarFilters: boolean;
}) => hasResourceListActiveFilter(props);
