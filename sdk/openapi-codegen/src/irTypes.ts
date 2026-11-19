/**
 * 语言无关的 FastGPT SDK 中间表示（SDK IR）类型契约。
 *
 * 将 OpenAPI 3.1 的动态 JSON Schema 收敛为严格可判别的代数数据类型（IrSchema），
 * 并固化请求参数拆分位置、身份上下文载体、流式成对方法与响应解包策略，供 TS / Python / Go 等发射器同构消费。
 */

export type IrPrimitiveType = 'string' | 'number' | 'integer' | 'boolean' | 'null';

export type IrProperty = {
  name: string;
  schema: IrSchema;
  required: boolean;
  description?: string;
  deprecated?: boolean;
};

export type IrSchema =
  | {
      kind: 'primitive';
      type: IrPrimitiveType;
      format?: string;
      description?: string;
      deprecated?: boolean;
    }
  | {
      kind: 'literal';
      value: string | number | boolean;
      description?: string;
      deprecated?: boolean;
    }
  | {
      kind: 'enum';
      values: Array<string | number | boolean>;
      description?: string;
      deprecated?: boolean;
    }
  | {
      kind: 'binary';
      multiple?: boolean;
      description?: string;
      deprecated?: boolean;
    }
  | {
      kind: 'array';
      items: IrSchema;
      description?: string;
      deprecated?: boolean;
    }
  | {
      kind: 'tuple';
      items: IrSchema[];
      description?: string;
      deprecated?: boolean;
    }
  | {
      kind: 'record';
      valueType: IrSchema;
      description?: string;
      deprecated?: boolean;
    }
  | {
      kind: 'object';
      properties: IrProperty[];
      additionalProperties?: boolean | IrSchema;
      description?: string;
      deprecated?: boolean;
    }
  | {
      kind: 'union';
      variants: IrSchema[];
      description?: string;
      deprecated?: boolean;
    }
  | {
      kind: 'unknown';
      description?: string;
      deprecated?: boolean;
    };

export type IrHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type IrRequestContentType = 'none' | 'json' | 'multipart' | 'octet-stream';

export type IrMultipartMode = 'fileAndJsonData' | 'flatFields';

export type IrResponseMode = 'envelope' | 'rawJson' | 'void' | 'text' | 'binary';

export type IrContextCarrier = 'query' | 'body' | 'multipartData' | null;

export type IrOperation = {
  /** 全局唯一操作标识，例如 datasets.collections.list */
  id: string;
  /** 点分领域资源路径，例如 datasets.collections */
  resource: string;
  /** 主方法名，例如 list 或 completionsV2 */
  method: string;
  /** 双模态流式方法名，例如 completionsV2Stream 或 resumeStream */
  streamMethod?: string;
  httpMethod: IrHttpMethod;
  /** 相对于 /api 的路由路径，例如 /core/dataset/collection/listV2 */
  path: string;
  summary: string;
  description?: string;
  requestContentType: IrRequestContentType;
  multipartMode?: IrMultipartMode;
  responseMode: IrResponseMode;
  /** defaultAppId 自动补齐的目标位置 */
  appIdCarrier: IrContextCarrier;
  /** customUid / authProxy 自动注入的目标位置 */
  identityCarrier: IrContextCarrier;
  pathParams: string[];
  queryParams: string[];
  bodyParams: string[];
  /** application/octet-stream 请求体在扁平入参对象中的字段名 */
  binaryBodyField?: string;
  /** 是否至少存在一个必填入参字段 */
  hasRequiredInput: boolean;
  requestTypeName?: string;
  requestSchema?: Extract<IrSchema, { kind: 'object' }>;
  responseTypeName?: string;
  responseSchema?: IrSchema;
};

export type IrResourceNode = {
  /** 当前节点段名，例如 collections */
  name: string;
  /** 完整点分路径，例如 datasets.collections */
  fullPath: string;
  operations: IrOperation[];
  children: IrResourceNode[];
};

export type SdkIrDocument = {
  irVersion: '1.0.0';
  title: string;
  openApiVersion: string;
  operationCount: number;
  resources: IrResourceNode[];
  operations: IrOperation[];
};
