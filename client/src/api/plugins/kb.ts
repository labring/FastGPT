import { GET, POST, PUT, DELETE } from '../request';
import type { KbItemType } from '@/types/plugin';
import { RequestPaging } from '@/types/index';
import { TrainingModeEnum } from '@/constants/plugin';
import { type QuoteItemType } from '@/pages/api/openapi/kb/appKbSearch';
import {
  Props as PushDataProps,
  Response as PushDateResponse
} from '@/pages/api/openapi/kb/pushData';
import {
  Props as SearchTestProps,
  Response as SearchTestResponse
} from '@/pages/api/openapi/kb/searchTest';

export type KbUpdateParams = {
  id: string;
  name: string;
  tags: string;
  avatar: string;
};

/* knowledge base */
export const getKbList = () => GET<KbItemType[]>(`/plugins/kb/list`);

export const getKbById = (id: string) => GET<KbItemType>(`/plugins/kb/detail?id=${id}`);

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
  GET<[string, string, string][]>(
    `/plugins/kb/data/exportModelData`,
    { kbId },
    {
      timeout: 600000
    }
  );

/**
 * 获取模型正在拆分数据的数量
 */
export const getTrainingData = (data: { kbId: string; init: boolean }) =>
  POST<{
    qaListLen: number;
    vectorListLen: number;
  }>(`/plugins/kb/data/getTrainingData`, data);

export const getKbDataItemById = (dataId: string) =>
  GET<QuoteItemType>(`/plugins/kb/data/getDataById`, { dataId });

/**
 * 直接push数据
 */
export const postKbDataFromList = (data: PushDataProps) =>
  POST<PushDateResponse>(`/openapi/kb/pushData`, data);

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
  mode: `${TrainingModeEnum}`;
}) => POST(`/openapi/text/pushData`, data);

export const searchText = (data: SearchTestProps) =>
  POST<SearchTestResponse>(`/openapi/kb/searchTest`, data);
