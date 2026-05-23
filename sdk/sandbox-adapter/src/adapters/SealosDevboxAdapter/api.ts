import {
  type DevboxApiConfig,
  type DevboxApiResponse,
  type DevboxCreateRequest,
  type DevboxInfoData,
  type DevboxMutationData,
  type DownloadFileParams,
  type ExecRequest,
  type ExecResponseData,
  type UploadFileParams,
  type UploadResponseData
} from './type';

export class DevboxApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly rawBody: string,
    public readonly url: string
  ) {
    super(message);
    this.name = 'DevboxApiError';
    Object.setPrototypeOf(this, DevboxApiError.prototype);
  }
}

/**
 * HTTP client for the Sealos Devbox REST API.
 *
 * @see https://devbox-server.staging-usw-1.sealos.io
 */
export class DevboxApi {
  private baseUrl: string;
  private token: string;

  constructor(config: DevboxApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
  }

  private url(path: string, params?: Record<string, string>): string {
    const u = new URL(path, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        u.searchParams.set(k, v);
      }
    }
    return u.toString();
  }

  private async request<T>(input: string, init?: RequestInit): Promise<DevboxApiResponse<T>> {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(input, { ...init, headers });
    const rawBody =
      typeof res.text === 'function'
        ? await res.text()
        : JSON.stringify(await (res as unknown as { json: () => Promise<unknown> }).json());
    let result: DevboxApiResponse<T>;
    try {
      result = JSON.parse(rawBody) as DevboxApiResponse<T>;
    } catch {
      throw new DevboxApiError(
        `Devbox API returned non-JSON response (${res.status}): ${rawBody || res.statusText || res.status}`,
        res.status,
        rawBody,
        input
      );
    }
    return {
      ...result,
      code: result.code ?? res.status
    };
  }

  /** POST /api/v1/devbox — create a devbox */
  async create(req: DevboxCreateRequest): Promise<DevboxApiResponse<DevboxMutationData>> {
    return this.request(this.url('/api/v1/devbox'), {
      method: 'POST',
      body: JSON.stringify(req)
    });
  }

  /** GET /api/v1/devbox/{name} — query devbox info (state + SSH) */
  async info(name: string): Promise<DevboxApiResponse<DevboxInfoData>> {
    return this.request<DevboxInfoData>(this.url(`/api/v1/devbox/${name}`), {
      method: 'GET'
    });
  }

  /** POST /api/v1/devbox/{name}/pause */
  async pause(name: string): Promise<DevboxApiResponse<DevboxMutationData>> {
    return this.request(this.url(`/api/v1/devbox/${name}/pause`), {
      method: 'POST'
    });
  }

  /** POST /api/v1/devbox/{name}/stop */
  async stop(name: string): Promise<DevboxApiResponse<DevboxMutationData>> {
    return this.request(this.url(`/api/v1/devbox/${name}/stop`), {
      method: 'POST'
    });
  }

  /** POST /api/v1/devbox/{name}/resume */
  async resume(name: string): Promise<DevboxApiResponse<DevboxMutationData>> {
    return this.request(this.url(`/api/v1/devbox/${name}/resume`), {
      method: 'POST'
    });
  }

  /** DELETE /api/v1/devbox/{name} */
  async delete(name: string): Promise<DevboxApiResponse<DevboxMutationData>> {
    return this.request(this.url(`/api/v1/devbox/${name}`), {
      method: 'DELETE'
    });
  }

  /** POST /api/v1/devbox/{name}/exec */
  async exec(name: string, req: ExecRequest): Promise<DevboxApiResponse<ExecResponseData>> {
    return this.request(this.url(`/api/v1/devbox/${name}/exec`), {
      method: 'POST',
      body: JSON.stringify(req)
    });
  }

  /** POST /api/v1/devbox/{name}/files/upload */
  async uploadFile(
    name: string,
    params: UploadFileParams,
    content: BodyInit
  ): Promise<DevboxApiResponse<UploadResponseData>> {
    const queryParams: Record<string, string> = { path: params.path };
    if (params.mode) queryParams.mode = params.mode;
    if (params.timeoutSeconds != null) queryParams.timeoutSeconds = String(params.timeoutSeconds);
    if (params.container) queryParams.container = params.container;

    return this.request(this.url(`/api/v1/devbox/${name}/files/upload`, queryParams), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: content
    });
  }

  /** GET /api/v1/devbox/{name}/files/download */
  async downloadFile(name: string, params: DownloadFileParams): Promise<ArrayBuffer> {
    const queryParams: Record<string, string> = { path: params.path };
    if (params.filename) queryParams.filename = params.filename;
    if (params.timeoutSeconds != null) queryParams.timeoutSeconds = String(params.timeoutSeconds);
    if (params.container) queryParams.container = params.container;

    const res = await fetch(this.url(`/api/v1/devbox/${name}/files/download`, queryParams), {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    return res.arrayBuffer();
  }
}
