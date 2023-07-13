export type ChatModelItemType = {
  model: string;
  name: string;
  contextMaxToken: number;
  systemMaxToken: number;
  maxTemperature: number;
  price: number;
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
  price: number;
};
