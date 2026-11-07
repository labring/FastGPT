export type FastGPTOptions = {
  /** FastGPT 实例地址，可包含 /api 和反向代理路径前缀。 */
  baseURL: string;
  apiKey: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

export type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type UploadFile = {
  file: Blob;
  filename: string;
};

export type WaitOptions = RequestOptions & {
  /** 整个等待过程的上限，默认五分钟，独立于单次 HTTP 请求超时。 */
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
  onProgress?: (status: { activeTrainingAmount: number; finalErrorAmount: number }) => void;
};
