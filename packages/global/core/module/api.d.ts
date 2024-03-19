import { VectorModelItemType } from '../ai/model.d';
import { DYNAMIC_INPUT_KEY } from './constants';

export type SelectedDatasetType = { datasetId: string; vectorModel: VectorModelItemType }[];

export type HttpBodyType<T = any> = {
  [DYNAMIC_INPUT_KEY]: Record<string, any>;
} & T;
export type HttpQueryType = {
  appId: string;
  chatId?: string;
  responseChatItemId?: string;
  variables: Record<string, any>;
  [key: string]: any;
};

/* http node */
export type HttpParamAndHeaderItemType = {
  key: string;
  type: string;
  value: string;
};
