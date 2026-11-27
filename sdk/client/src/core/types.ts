/**
 * @fastgpt/sdk 核心运行时公共类型定义。
 *
 * 仅依赖标准 Web Fetch / Blob / ReadableStream 类型，零 Node 专有或内部包运行时依赖。
 */

export type CredentialProvider = string | (() => string | Promise<string>);

export type AuthProxyIdentity =
  | { tmbId: string; username?: never }
  | { username: string; tmbId?: never };

export type FastGptIdentity = {
  /** 业务侧终端用户标识（与 authProxy 互斥，最长 1024 字符） */
  customUid?: string;
  /** 团队成员身份代理（仅开启代理权限的个人密钥可用，与 customUid 互斥） */
  authProxy?: AuthProxyIdentity;
};

export type FastGptLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export type FastGptLogger = {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
};

export type RequestHookContext = {
  operationId: string;
  method: HttpMethod;
  /** 已脱敏的请求 URL */
  url: string;
  /** 已脱敏的请求头快照 */
  headers: Record<string, string>;
  /** 重试次数（首次请求为 0） */
  attempt: number;
};

export type ResponseHookContext = {
  operationId: string;
  method: HttpMethod;
  /** 已脱敏的请求 URL */
  url: string;
  status: number;
  requestId: string | null;
  durationMs: number;
  attempt: number;
};

export type ErrorHookContext = {
  operationId: string;
  method: HttpMethod;
  /** 已脱敏的请求 URL */
  url: string;
  durationMs: number;
  attempt: number;
  error: Error;
};

export type FastGptHooks = {
  onRequest?: (context: RequestHookContext) => void | Promise<void>;
  onResponse?: (context: ResponseHookContext) => void | Promise<void>;
  onError?: (context: ErrorHookContext) => void | Promise<void>;
};

export type FastGptClientOptions = {
  /** FastGPT 服务地址，例如 https://cloud.fastgpt.cn（自动兼容是否带 /api 后缀） */
  baseUrl?: string;
  /** 应用 API Key、个人 API Key 或异步密钥提供函数 */
  apiKey?: CredentialProvider;
  /** 默认应用 ID（个人密钥调用对话与日志接口时自动补齐 appId） */
  defaultAppId?: string;
  /** 默认调用者身份上下文（可通过 client.withIdentity 派生隔离实例） */
  identity?: FastGptIdentity;
  /** 默认单次请求超时毫秒数（普通请求覆盖至响应体读取完成，SSE 流式请求用于握手超时；默认 60000ms） */
  timeoutMs?: number;
  /** 默认幂等请求最大重试次数（默认 GET 重试 2 次，非幂等请求不自动重试） */
  maxRetries?: number;
  /** 自定义附加请求头 */
  defaultHeaders?: Record<string, string>;
  /** 自定义底层 fetch 实现（便于代理、测试桩或特殊运行时注入） */
  fetch?: typeof globalThis.fetch;
  /** 显式允许在浏览器环境实例化（默认阻断，防止将 API Key 打包泄漏至前端） */
  dangerouslyAllowBrowser?: boolean;
  /** 可观测性钩子（请求、响应、异常均自动脱敏后再回调） */
  hooks?: FastGptHooks;
  /** 调试日志器或内置日志级别（所有敏感凭证自动脱敏） */
  logger?: FastGptLogger | FastGptLogLevel;
};

export type RequestOptions = {
  /** 覆盖当前请求的 API Key */
  apiKey?: string;
  /** 覆盖当前请求的外部使用者 ID（与 authProxy 互斥） */
  customUid?: string;
  /** 覆盖当前请求的成员代理身份（与 customUid 互斥） */
  authProxy?: AuthProxyIdentity;
  /** 覆盖当前请求超时时间（普通请求覆盖至响应体读取完成，SSE 流式请求用于握手超时） */
  timeoutMs?: number;
  /** 覆盖当前请求的最大重试次数 */
  maxRetries?: number;
  /** 外部取消信号（普通请求覆盖至响应体读取完成，SSE 流式请求覆盖整个流生命周期） */
  signal?: AbortSignal;
  /** 单次请求附加 Header */
  headers?: Record<string, string>;
};

export type UploadableFileObject = {
  data: Blob | ArrayBuffer | Uint8Array | string;
  filename: string;
  contentType?: string;
};

export type Uploadable = Blob | File | ArrayBuffer | Uint8Array | UploadableFileObject;

export type BinaryInput = Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>;

export type RawResponseInfo = {
  status: number;
  headers: Headers;
  requestId: string | null;
  url: string;
};

export type WithRawResponseResult<T> = {
  data: T;
  response: RawResponseInfo;
};

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type RequestContentType = 'none' | 'json' | 'multipart' | 'octet-stream';

export type MultipartMode = 'fileAndJsonData' | 'flatFields';

export type ResponseMode = 'envelope' | 'rawJson' | 'void' | 'text' | 'binary';

export type ContextCarrier = 'query' | 'body' | 'multipartData' | null;

export type OperationSpec = {
  id: string;
  httpMethod: HttpMethod;
  path: string;
  requestContentType: RequestContentType;
  multipartMode?: MultipartMode;
  responseMode: ResponseMode;
  appIdCarrier: ContextCarrier;
  identityCarrier: ContextCarrier;
  pathParams: string[];
  queryParams: string[];
  bodyParams: string[];
  binaryBodyField?: string;
  retryable?: boolean;
};
