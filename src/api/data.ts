import { GET, POST, DELETE, PUT } from './request';
import { RequestPaging } from '../types/index';
import { Obj2Query } from '@/utils/tools';
import type { DataListItem } from '@/types/data';
import type { PagingData } from '../types/index';

export const getDataList = (data: RequestPaging) =>
  GET<PagingData<DataListItem>>(`/data/getDataList?${Obj2Query(data)}`);

export const postData = (name: string) => POST<string>(`/data/postData?name=${name}`);

export const postSplitData = (dataId: string, text: string) =>
  POST(`/data/splitData`, { dataId, text });
