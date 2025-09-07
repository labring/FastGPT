import type { HttpToolConfigType } from '../type';

export type PathDataType = {
  name: string;
  description: string;
  method: string;
  path: string;
  params: any[];
  request: any;
  response: any;
};

export type OpenApiJsonSchema = {
  pathData: PathDataType[];
  serverPath: string;
};

export type HttpToolDataType = HttpToolConfigType & {
  url: string;
  headerSecret?: StoreSecretValueType;
};
