import type { McpToolConfigType } from '../type';

export type McpToolSetDataType = {
  url: string;
  headerSecret?: StoreSecretValueType;
  toolList: McpToolConfigType[];
};

export type McpToolDataType = McpToolConfigType & {
  url: string;
  headerSecret?: StoreSecretValueType;
};
