import { GET, POST, PUT, DELETE } from '@/api/request';
import type { DatasetDataItemType } from '@/types/core/dataset/data';
import type {
  PushDataProps,
  PushDataResponse,
  UpdateDataPrams,
  GetDatasetDataListProps
} from './data.d';
import { QuoteItemType } from '@/types/chat';
import { getToken } from '@/utils/user';
import download from 'downloadjs';

/* kb data */
export const getDatasetDataList = (data: GetDatasetDataListProps) =>
  POST(`/core/dataset/data/getDataList`, data);

/**
 * export and download data
 */
export const exportDatasetData = (data: { kbId: string }) =>
  fetch(`/api/core/dataset/data/exportAll?kbId=${data.kbId}`, {
    method: 'GET',
    headers: {
      token: getToken()
    }
  })
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.message || 'Export failed');
      }
      return res.blob();
    })
    .then((blob) => download(blob, 'dataset.csv', 'text/csv'));

/**
 * 获取模型正在拆分数据的数量
 */
export const getTrainingData = (data: { kbId: string; init: boolean }) =>
  POST<{
    qaListLen: number;
    vectorListLen: number;
  }>(`/core/dataset/data/getTrainingData`, data);

/* get length of system training queue */
export const getTrainingQueueLen = () => GET<number>(`/core/dataset/data/getQueueLen`);

export const getDatasetDataItemById = (dataId: string) =>
  GET<QuoteItemType>(`/core/dataset/data/getDataById`, { dataId });

/**
 * push data to training queue
 */
export const postChunks2Dataset = (data: PushDataProps) =>
  POST<PushDataResponse>(`/core/dataset/data/pushData`, data);

/**
 * insert one data to dataset (immediately insert)
 */
export const postData2Dataset = (data: { kbId: string; data: DatasetDataItemType }) =>
  POST<string>(`/core/dataset/data/insertData`, data);

/**
 * 更新一条数据
 */
export const putDatasetDataById = (data: UpdateDataPrams) =>
  PUT('/core/dataset/data/updateData', data);
/**
 * 删除一条知识库数据
 */
export const delOneDatasetDataById = (dataId: string) =>
  DELETE(`/core/dataset/data/delDataById?dataId=${dataId}`);
