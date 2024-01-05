export type LLMModelItemType = {
  model: string;
  name: string;
  maxContext: number;
  maxResponse: number;
  inputPrice: number;
  outputPrice: number;
};
export type ChatModelItemType = LLMModelItemType & {
  quoteMaxToken: number;
  maxTemperature: number;
  censor?: boolean;
  vision?: boolean;
  defaultSystemChatPrompt?: string;
};

export type FunctionModelItemType = LLMModelItemType & {
  toolChoice: boolean;
  functionPrompt: string;
};

export type VectorModelItemType = {
  model: string;
  name: string;
  defaultToken: number;
  inputPrice: number;
  outputPrice: number;
  maxToken: number;
  weight: number;
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
