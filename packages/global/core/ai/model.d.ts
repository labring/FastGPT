export type LLMModelItemType = {
  model: string;
  name: string;
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
};

export type VectorModelItemType = {
  model: string;
  name: string;
  defaultToken: number;
  charsPointsPrice: number;
  maxToken: number;
  weight: number;
  hidden?: boolean;
  defaultConfig?: Record<string, any>;
};

export type ReRankModelItemType = {
  model: string;
  name: string;
  charsPointsPrice: number;
  requestUrl?: string;
  requestAuth?: string;
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
