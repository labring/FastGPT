import { GET, POST, DELETE, PUT } from './request';
import type { ModelSchema } from '@/types/mongoSchema';
import { ModelUpdateParams } from '@/types/model';
import { TrainingItemType } from '../types/training';
import { PagingData } from '@/types';
import { RequestPaging } from '../types/index';
import { Obj2Query } from '@/utils/tools';

export const getMyModels = () => GET<ModelSchema[]>('/model/list');

export const postCreateModel = (data: { name: string; serviceModelName: string }) =>
  POST<ModelSchema>('/model/create', data);

export const delModelById = (id: string) => DELETE(`/model/del?modelId=${id}`);

export const getModelById = (id: string) => GET<ModelSchema>(`/model/detail?modelId=${id}`);

export const putModelById = (id: string, data: ModelUpdateParams) =>
  PUT(`/model/update?modelId=${id}`, data);

export const postTrainModel = (id: string, form: FormData) =>
  POST(`/model/train/train?modelId=${id}`, form, {
    headers: {
      'content-type': 'multipart/form-data'
    }
  });

export const putModelTrainingStatus = (id: string) =>
  PUT(`/model/train/putTrainStatus?modelId=${id}`);

export const getModelTrainings = (id: string) =>
  GET<TrainingItemType[]>(`/model/train/getTrainings?modelId=${id}`);

/* 模型 data */

type GetModelDataListProps = RequestPaging & {
  modelId: string;
};
export const getModelDataList = (props: GetModelDataListProps) =>
  GET(`/model/data/getModelData?${Obj2Query(props)}`);

export const postModelData = (data: { modelId: string; data: { q: string; a: string }[] }) =>
  POST(`/model/data/pushModelData`, data);

export const putModelDataById = (data: { modelId: string; answer: string }) =>
  PUT('/model/data/putModelData', data);
export const DelOneModelData = (modelId: string) =>
  DELETE(`/model/data/delModelDataById?modelId=${modelId}`);
