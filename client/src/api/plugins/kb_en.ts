import { GET, POST, PUT, DELETE } from '../request';
import type { KbItemType, KbListItemType } from '@/types/plugin';
import { RequestPaging } from '@/types/index';
import { TrainingModeEnum } from '@/constants/plugin';
import {
  Props as PushDataProps,
  Response as PushDateResponse
} from '@/pages/api/openapi/kb/pushData';
import {
  Props as SearchTestProps,
  Response as SearchTestResponse
} from '@/pages/api/openapi/kb/searchTest';
import { Response as KbDataItemType } from '@/pages/api/plugins/kb/data/getDataById';
import { Props as UpdateDataProps } from '@/pages/api/openapi/kb/updateData';

export type KbUpdateParams = {
  id: string;
  name: string;
  tags: string;
  avatar: string;
};

/* knowledge base */
export const getKbList = () => GET<KbListItemType[]>(`/plugins/kb/list`);

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
 * Get export data (without pagination)
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
 * Get the number of data being split by the model
 */
export const getTrainingData = (data: { kbId: string; init: boolean }) =>
  POST<{
    qaListLen: number;
    vectorListLen: number;
  }>(`/plugins/kb/data/getTrainingData`, data);

export const getKbDataItemById = (dataId: string) =>
  GET<KbDataItemType>(`/plugins/kb/data/getDataById`, { dataId });

/**
 * Push data directly
 */
export const postKbDataFromList = (data: PushDataProps) =>
  POST<PushDateResponse>(`/openapi/kb/pushData`, data);

/**
 * Update a data item
 */
export const putKbDataById = (data: UpdateDataProps) => PUT('/openapi/kb/updateData', data);

/**
 * Delete a knowledge base data item
 */
export const delOneKbDataByDataId = (dataId: string) =>
  DELETE(`/openapi/kb/delDataById?dataId=${dataId}`);

/**
 * Split data
 */
export const postSplitData = (data: {
  kbId: string;
  chunks: string[];
  prompt: string;
  mode: `${TrainingModeEnum}`;
}) => POST(`/openapi/text/pushData`, data);

export const searchText = (data: SearchTestProps) =>
  POST<SearchTestResponse>(`/openapi/kb/searchTest`, data);
