import { VectorModelItemType } from '../ai/model.d';

export type SelectedDatasetType = { datasetId: string; vectorModel: VectorModelItemType }[];

export type HttpBodyType<T = any> = {
  appId: string;
  chatId?: string;
  responseChatItemId?: string;
  variables: Record<string, any>;
  data: T;
};
export type HttpQueryType = {
  appId: string;
  chatId?: string;
  responseChatItemId?: string;
  variables: Record<string, any>;
  [key: string]: any;
};
