export type LLMModelItemType = {
  model: string;
  name: string;
  avatar?: string;
  maxContext: number;
  maxResponse: number;
  quoteMaxToken: number;
  maxTemperature: number;

  charsPointsPrice: number; // 1k chars=n points

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

export type VectorModelItemType = {
  model: string; // model name
  name: string; // show name
  avatar?: string;
  defaultToken: number; // split text default token
  charsPointsPrice: number; // 1k tokens=n points
  maxToken: number; // model max token
  weight: number; // training weight
  hidden?: boolean; // Disallow creation
  defaultConfig?: Record<string, any>; // post request config
  dbConfig?: Record<string, any>; // Custom parameters for storage
  queryConfig?: Record<string, any>; // Custom parameters for query
};

export type ReRankModelItemType = {
  model: string;
  name: string;
  charsPointsPrice: number;
  requestUrl: string;
  requestAuth: string;
};

export type AudioSpeechModelType = {
  model: string;
  name: string;
  charsPointsPrice: number;
  voices: { label: string; value: string; bufferId: string }[];
};

export type WhisperModelType = {
  model: string;
  name: string;
  charsPointsPrice: number; // 60s = n points
};
