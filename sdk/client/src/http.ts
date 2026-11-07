import { FastGPTError } from './error';
import type { FastGPTOptions, RequestOptions } from './type';

type RequestSpec = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  input?: unknown;
  form?: FormData;
};

/** 统一 API Key 传输与错误边界；不自动重试，避免导入和创建操作重复执行。 */
export class HttpClient {
  private readonly baseURL: URL;
  private readonly apiKey: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: FastGPTOptions) {
    const url = new URL(options.baseURL);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new TypeError('baseURL must be an HTTP(S) URL without credentials, query or fragment');
    }
    url.pathname = `${url.pathname.replace(/\/+$/, '').replace(/\/api$/, '')}/api/`;
    this.baseURL = url;
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey || /\s/.test(this.apiKey))
      throw new TypeError('apiKey must be a nonempty API key');
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 60000;
    this.assertTimeout(this.timeoutMs);
  }

  private assertTimeout(value: number) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
      throw new TypeError('timeoutMs must be a positive integer');
  }

  /** 返回流式响应供下载方处理；认证错误仍通过统一业务错误暴露。 */
  async download(spec: RequestSpec, options: RequestOptions = {}): Promise<Response> {
    const response = await this.send(spec, options);
    if (!response.ok || response.headers.get('content-type')?.includes('application/json')) {
      await this.readEnvelope(response, options);
      throw new FastGPTError('Expected a file response', {
        kind: 'protocol',
        status: response.status
      });
    }
    return response;
  }

  async request<T>(spec: RequestSpec, options: RequestOptions = {}): Promise<T> {
    return (await this.readEnvelope(await this.send(spec, options), options)) as T;
  }

  private async send(spec: RequestSpec, options: RequestOptions): Promise<Response> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    this.assertTimeout(timeoutMs);
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const url = new URL(spec.path.replace(/^\//, ''), this.baseURL);
    const query = spec.method === 'GET' || spec.method === 'DELETE';
    if (query && spec.input !== undefined) {
      for (const [key, value] of Object.entries(spec.input as Record<string, unknown>)) {
        if (value !== undefined)
          url.searchParams.set(
            key,
            typeof value === 'object' ? JSON.stringify(value) : String(value)
          );
      }
    }
    // 序列化错误属于调用参数错误，不应被归类成网络故障。
    const body =
      spec.form ?? (!query && spec.input !== undefined ? JSON.stringify(spec.input) : undefined);
    try {
      return await this.fetch(url, {
        method: spec.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(!spec.form && !query ? { 'Content-Type': 'application/json' } : {})
        },
        body,
        signal,
        redirect: 'error'
      });
    } catch {
      const kind = options.signal?.aborted ? 'aborted' : timeout.aborted ? 'timeout' : 'network';
      throw new FastGPTError(
        kind === 'aborted'
          ? 'Request aborted'
          : kind === 'timeout'
            ? 'Request timed out'
            : 'Unable to connect to FastGPT',
        { kind }
      );
    }
  }

  private async readEnvelope(response: Response, options: RequestOptions): Promise<unknown> {
    if (response.status === 204) return undefined;
    const requestId = response.headers.get('x-request-id') ?? undefined;
    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch (error) {
      if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
        const kind = options.signal?.aborted ? 'aborted' : 'timeout';
        throw new FastGPTError(kind === 'aborted' ? 'Request aborted' : 'Request timed out', {
          kind,
          requestId
        });
      }
      throw new FastGPTError('FastGPT returned an invalid JSON response', {
        kind: 'protocol',
        status: response.status,
        requestId
      });
    }
    if (
      !envelope ||
      typeof envelope !== 'object' ||
      !('code' in envelope) ||
      typeof envelope.code !== 'number'
    ) {
      throw new FastGPTError('FastGPT returned an invalid API envelope', {
        kind: 'protocol',
        status: response.status,
        requestId
      });
    }
    if (!response.ok || envelope.code !== 200) {
      const message =
        'message' in envelope && typeof envelope.message === 'string' && envelope.message
          ? envelope.message
          : `FastGPT request failed (${envelope.code})`;
      throw new FastGPTError(message.replaceAll(this.apiKey, '[REDACTED]'), {
        kind: 'api',
        status: response.status,
        code: envelope.code,
        requestId
      });
    }
    return 'data' in envelope ? envelope.data : undefined;
  }
}
