import type { StoreSecretValueType } from '../../../../common/secret/type';
import type { JSONSchemaInputType } from '../../jsonschema';

export type McpToolConfigType = {
  name: string;
  description: string;
  inputSchema: JSONSchemaInputType;
};

export type McpToolSetDataType = {
  url: string;
  headerSecret?: StoreSecretValueType;
  toolList: McpToolConfigType[];
};

export type McpToolDataType = McpToolConfigType & {
  url: string;
  headerSecret?: StoreSecretValueType;
};
