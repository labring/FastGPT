export type LLMModelItemType = {
  model: string;
  name: string;
  maxContext: number;
  maxResponse: number;
  price: number;
};
export type ChatModelItemType = LLMModelItemType & {
  quoteMaxToken: number;
  maxTemperature: number;
  censor?: boolean;
  vision?: boolean;
  defaultSystemChatPrompt?: string;
};

export type FunctionModelItemType = LLMModelItemType & {
  functionCall: boolean;
  functionPrompt: string;
};

export type VectorModelItemType = {
  model: string;
  name: string;
  defaultToken: number;
  price: number;
  maxToken: number;
};

export type AudioSpeechModelType = {
  model: string;
  name: string;
  price: number;
  voices: { label: string; value: string; bufferId: string }[];
};

export type WhisperModelType = {
  model: string;
  name: string;
  price: number;
};
