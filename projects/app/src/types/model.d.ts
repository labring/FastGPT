export type ChatModelItemType = {
  model: string;
  name: string;
  contextMaxToken: number;
  quoteMaxToken: number;
  maxTemperature: number;
  price: number;
  censor?: boolean;
  defaultSystem?: string;
};
export type QAModelItemType = {
  model: string;
  name: string;
  maxToken: number;
  price: number;
};
export type VectorModelItemType = {
  model: string;
  name: string;
  defaultToken: number;
  price: number;
  maxToken: number;
};
export type FunctionModelItemType = {
  model: string;
  name: string;
  maxToken: number;
  price: number;
  prompt: string;
  functionCall: boolean;
};
