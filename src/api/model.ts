import { GET, POST, DELETE, PUT } from './request';
import type { ModelSchema, ModelDataSchema, ModelSplitDataSchema } from '@/types/mongoSchema';
import { ModelUpdateParams } from '@/types/model';
import { TrainingItemType } from '../types/training';
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

export const getModelSplitDataList = (modelId: string) =>
  GET<ModelSplitDataSchema[]>(`/model/data/getSplitData?modelId=${modelId}`);

export const postModelDataInput = (data: {
  modelId: string;
  data: { text: ModelDataSchema['text']; q: ModelDataSchema['q'] }[];
}) => POST<number>(`/model/data/pushModelDataInput`, data);

export const postModelDataFileText = (modelId: string, text: string) =>
  POST(`/model/data/splitData`, { modelId, text });

export const postModelDataJsonData = (
  modelId: string,
  jsonData: { prompt: string; completion: string; vector?: number[] }[]
) => POST(`/model/data/pushModelDataJson`, { modelId, data: jsonData });

export const putModelDataById = (data: { dataId: string; text: string }) =>
  PUT('/model/data/putModelData', data);
export const delOneModelData = (dataId: string) =>
  DELETE(`/model/data/delModelDataById?dataId=${dataId}`);
