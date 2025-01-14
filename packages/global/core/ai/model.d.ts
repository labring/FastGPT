import type { ModelProviderIdType } from './provider';

type PriceType = {
  charsPointsPrice?: number; // 1k chars=n points; 60s=n points;

  // If inputPrice is set, the input-output charging scheme is adopted
  inputPrice?: number; // 1k tokens=n points
  outputPrice?: number; // 1k tokens=n points
};
export type LLMModelItemType = PriceType & {
  provider: ModelProviderIdType;
  model: string;
  name: string;
  avatar?: string; // model icon, from provider
  maxContext: number;
  maxResponse: number;
  quoteMaxToken: number;
  maxTemperature: number;

  censor?: boolean;
  vision?: boolean;

  // diff function model
  datasetProcess?: boolean; // dataset
  usedInClassify?: boolean; // classify
  usedInExtractFields?: boolean; // extract fields
  usedInToolCall?: boolean; // tool call
  usedInQueryExtension?: boolean; // query extension

  functionCall: boolean;
  toolChoice: boolean;

  customCQPrompt: string;
  customExtractPrompt: string;

  defaultSystemChatPrompt?: string;
  defaultConfig?: Record<string, any>;
  fieldMap?: Record<string, string>;
};

export type VectorModelItemType = PriceType & {
  provider: ModelProviderIdType;
  model: string; // model name
  name: string; // show name
  avatar?: string;
  defaultToken: number; // split text default token
  maxToken: number; // model max token
  weight: number; // training weight
  hidden?: boolean; // Disallow creation
  defaultConfig?: Record<string, any>; // post request config
  dbConfig?: Record<string, any>; // Custom parameters for storage
  queryConfig?: Record<string, any>; // Custom parameters for query
};

export type ReRankModelItemType = PriceType & {
  provider: ModelProviderIdType;
  model: string;
  name: string;
  requestUrl: string;
  requestAuth: string;
};

export type AudioSpeechModelType = PriceType & {
  provider: ModelProviderIdType;
  model: string;
  name: string;
  voices: { label: string; value: string; bufferId: string }[];
};

export type STTModelType = PriceType & {
  provider: ModelProviderIdType;
  model: string;
  name: string;
};
