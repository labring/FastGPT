export type LLMModelItemType = {
  model: string;
  name: string;
  maxContext: number;
  maxResponse: number;
  quoteMaxToken: number;
  maxTemperature: number;

  inputPrice: number;
  outputPrice: number;

  censor?: boolean;
  vision?: boolean;
  datasetProcess?: boolean;

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
  inputPrice: number;
  outputPrice: number;
  maxToken: number;
  weight: number;
  hidden?: boolean;
  defaultConfig?: Record<string, any>;
};

export type ReRankModelItemType = {
  model: string;
  name: string;
  inputPrice: number;
  outputPrice?: number;
  requestUrl?: string;
  requestAuth?: string;
};

export type AudioSpeechModelType = {
  model: string;
  name: string;
  inputPrice: number;
  outputPrice?: number;
  voices: { label: string; value: string; bufferId: string }[];
};

export type WhisperModelType = {
  model: string;
  name: string;
  inputPrice: number;
  outputPrice?: number;
};
