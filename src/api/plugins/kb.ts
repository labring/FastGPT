import { GET, POST, PUT, DELETE } from '../request';
import type { KbItemType } from '@/types/plugin';
import { RequestPaging } from '@/types/index';
import { SplitTextTypEnum } from '@/constants/plugin';
import { KbDataItemType } from '@/types/plugin';

export type KbUpdateParams = { id: string; name: string; tags: string; avatar: string };

/* knowledge base */
export const getKbList = () => GET<KbItemType[]>(`/plugins/kb/list`);

export const postCreateKb = (data: { name: string }) => POST<string>(`/plugins/kb/create`, data);

export const putKbById = (data: KbUpdateParams) => PUT(`/plugins/kb/update`, data);

export const delKbById = (id: string) => DELETE(`/plugins/kb/delete?id=${id}`);

/* kb data */
type GetKbDataListProps = RequestPaging & {
  kbId: string;
  searchText: string;
};
export const getKbDataList = (data: GetKbDataListProps) =>
  POST(`/plugins/kb/data/getDataList`, data);

/**
 * 获取导出数据（不分页）
 */
export const getExportDataList = (kbId: string) =>
  GET<[string, string][]>(`/plugins/kb/data/exportModelData?kbId=${kbId}`);

/**
 * 获取模型正在拆分数据的数量
 */
export const getTrainingData = (kbId: string) =>
  GET<{
    splitDataQueue: number;
    embeddingQueue: number;
  }>(`/plugins/kb/data/getTrainingData?kbId=${kbId}`);

/**
 * 获取 web 页面内容
 */
export const getWebContent = (url: string) => POST<string>(`/model/data/fetchingUrlData`, { url });

/**
 * 直接push数据
 */
export const postKbDataFromList = (data: {
  kbId: string;
  data: { a: KbDataItemType['a']; q: KbDataItemType['q'] }[];
}) => POST(`/openapi/kb/pushData`, data);

/**
 * 更新一条数据
 */
export const putKbDataById = (data: { dataId: string; a: string; q?: string }) =>
  PUT('/openapi/kb/updateData', data);
/**
 * 删除一条知识库数据
 */
export const delOneKbDataByDataId = (dataId: string) =>
  DELETE(`/openapi/kb/delDataById?dataId=${dataId}`);

/**
 * 拆分数据
 */
export const postSplitData = (data: {
  kbId: string;
  chunks: string[];
  prompt: string;
  mode: `${SplitTextTypEnum}`;
}) => POST(`/openapi/text/splitText`, data);
