import { GET, POST, DELETE, PUT } from './request';
import type { ModelSchema, ModelDataSchema } from '@/types/mongoSchema';
import { ModelUpdateParams, ShareModelItem } from '@/types/model';
import { RequestPaging } from '../types/index';
import { Obj2Query } from '@/utils/tools';

/**
 * 获取模型列表
 */
export const getMyModels = () => GET<ModelSchema[]>('/model/list');

/**
 * 创建一个模型
 */
export const postCreateModel = (data: { name: string; serviceModelName: string }) =>
  POST<ModelSchema>('/model/create', data);

/**
 * 根据 ID 删除模型
 */
export const delModelById = (id: string) => DELETE(`/model/del?modelId=${id}`);

/**
 * 根据 ID 获取模型
 */
export const getModelById = (id: string) => GET<ModelSchema>(`/model/detail?modelId=${id}`);

/**
 * 根据 ID 更新模型
 */
export const putModelById = (id: string, data: ModelUpdateParams) =>
  PUT(`/model/update?modelId=${id}`, data);

/* 模型 data */
type GetModelDataListProps = RequestPaging & {
  modelId: string;
  searchText: string;
};
/**
 * 获取模型的知识库数据
 */
export const getModelDataList = (props: GetModelDataListProps) =>
  GET(`/model/data/getModelData?${Obj2Query(props)}`);

/**
 * 获取导出数据（不分页）
 */
export const getExportDataList = (modelId: string) =>
  GET<[string, string][]>(`/model/data/exportModelData?modelId=${modelId}`);

/**
 * 获取模型正在拆分数据的数量
 */
export const getModelSplitDataListLen = (modelId: string) =>
  GET<number>(`/model/data/getSplitData?modelId=${modelId}`);

/**
 * 获取 web 页面内容
 */
export const getWebContent = (url: string) => POST<string>(`/model/data/fetchingUrlData`, { url });

/**
 * 手动输入数据
 */
export const postModelDataInput = (data: {
  modelId: string;
  data: { a: ModelDataSchema['a']; q: ModelDataSchema['q'] }[];
}) => POST<number>(`/model/data/pushModelDataInput`, data);

/**
 * 拆分数据
 */
export const postModelDataSplitData = (data: {
  modelId: string;
  chunks: string[];
  prompt: string;
  mode: 'qa' | 'subsection';
}) => POST(`/model/data/splitData`, data);

/**
 * json导入数据
 */
export const postModelDataCsvData = (modelId: string, data: string[][]) =>
  POST<number>(`/model/data/pushModelDataCsv`, { modelId, data: data });

/**
 * 更新模型数据
 */
export const putModelDataById = (data: { dataId: string; a: string; q?: string }) =>
  PUT('/model/data/putModelData', data);
/**
 * 删除一条模型数据
 */
export const delOneModelData = (dataId: string) =>
  DELETE(`/model/data/delModelDataById?dataId=${dataId}`);

/* 共享市场 */
/**
 * 获取共享市场模型
 */
export const getShareModelList = (data: { searchText?: string } & RequestPaging) =>
  POST(`/model/share/getModels`, data);
/**
 * 获取收藏的模型
 */
export const getCollectionModels = () => GET<ShareModelItem[]>(`/model/share/getCollection`);
/**
 * 收藏/取消收藏模型
 */
export const triggerModelCollection = (modelId: string) =>
  POST<number>(`/model/share/collection?modelId=${modelId}`);
