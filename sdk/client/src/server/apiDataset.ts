export type ApiDatasetFileItem = {
  /** 文件或目录唯一 ID */
  id: string;
  /** 父目录 ID（根目录传 null 或空串） */
  parentId: string | null;
  /** 文件或目录展示名称 */
  name: string;
  /** 节点类型 */
  type: 'file' | 'folder';
  /** 最近更新时间 */
  updateTime: Date | string;
  /** 创建时间 */
  createTime: Date | string;
  /** 是否包含子节点（省略时按 type === 'folder' 推导） */
  hasChild?: boolean;
};

export type ApiDatasetFileContent =
  | {
      title?: string;
      /** 直接返回文本/Markdown 正文内容 */
      content: string;
      previewUrl?: never;
    }
  | {
      title?: string;
      /** 返回可供 FastGPT 拉取解析的临时下载链接 */
      previewUrl: string;
      content?: never;
    };

export type ApiDatasetListParams = {
  parentId?: string;
  searchKey?: string;
  request: Request;
};

export type ApiDatasetItemParams = {
  id: string;
  request: Request;
};

export type ApiDatasetProvider = {
  /** 响应 POST /v1/file/list：列出指定目录下的文件与子目录 */
  listFiles: (params: ApiDatasetListParams) => ApiDatasetFileItem[] | Promise<ApiDatasetFileItem[]>;
  /** 响应 GET /v1/file/content?id=...：返回文件正文内容或可拉取下载 URL */
  getFileContent: (
    params: ApiDatasetItemParams
  ) => ApiDatasetFileContent | null | undefined | Promise<ApiDatasetFileContent | null | undefined>;
  /** 响应 GET /v1/file/detail?id=...：返回单个文件/目录元信息（不存在返回 null 触发 404） */
  getFileDetail: (
    params: ApiDatasetItemParams
  ) => ApiDatasetFileItem | null | undefined | Promise<ApiDatasetFileItem | null | undefined>;
  /** 响应 GET /v1/file/read?id=...（可选）：返回源文件跳转/预览链接 */
  getFileReadUrl?: (
    params: ApiDatasetItemParams
  ) =>
    | string
    | { url: string }
    | null
    | undefined
    | Promise<string | { url: string } | null | undefined>;
};

export type CreateApiDatasetHandlerOptions = {
  /** 业务侧数据源实现 */
  provider: ApiDatasetProvider;
  /** 静态 Bearer 鉴权令牌（与 FastGPT 自定义 API 知识库配置的 authorization 一致） */
  authorization?: string;
  /** 自定义异步令牌校验回调（优先于或可替代静态 authorization） */
  verifyToken?: (token: string, request: Request) => boolean | Promise<boolean>;
  /** 路由挂载前缀，例如 "/api/fastgpt-dataset"，匹配前自动剥离 */
  basePath?: string;
  /** 服务端未捕获异常回调 */
  onError?: (error: unknown, request: Request) => void;
};

export type WebFetchHandler = (request: Request) => Promise<Response>;

/**
 * 供 ApiDatasetProvider 显式抛出指定 HTTP 状态码（如 403 / 404 / 400）的结构化异常。
 */
export class ApiDatasetHttpError extends Error {
  readonly status: number;

  constructor({ status, message }: { status: number; message: string }) {
    super(message);
    this.name = 'ApiDatasetHttpError';
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const isRecord = (val: unknown): val is Record<string, unknown> =>
  val !== null && typeof val === 'object' && !Array.isArray(val);

const jsonResponse = ({
  body,
  status = 200,
  headers = {}
}: {
  body: unknown;
  status?: number;
  headers?: Record<string, string>;
}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers
    }
  });

/**
 * 常量时间字符串比对（基于 UTF-8 字节异或），避免静态令牌校验产生时序侧信道且不依赖 node:crypto。
 */
const constantTimeEqual = (left: string, right: string): boolean => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLen = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let i = 0; i < maxLen; i += 1) {
    diff |= (leftBytes[i] ?? 0) ^ (rightBytes[i] ?? 0);
  }

  return diff === 0;
};

const normalizeBasePath = (basePath?: string): string => {
  if (basePath === undefined || basePath.trim().length === 0) {
    return '';
  }
  const trimmed = basePath.trim().replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const normalizeRoutePathname = (pathname: string, basePath: string): string | null => {
  const cleanPathname = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (basePath === '') {
    return cleanPathname;
  }
  if (cleanPathname === basePath) {
    return '/';
  }
  if (cleanPathname.startsWith(`${basePath}/`)) {
    return cleanPathname.slice(basePath.length);
  }
  return null;
};

const serializeFileItem = (item: ApiDatasetFileItem) => ({
  id: item.id,
  parentId: item.parentId,
  name: item.name,
  type: item.type,
  updateTime: item.updateTime instanceof Date ? item.updateTime.toISOString() : item.updateTime,
  createTime: item.createTime instanceof Date ? item.createTime.toISOString() : item.createTime,
  hasChild: item.hasChild ?? item.type === 'folder'
});

const extractBearerToken = (request: Request): string | null => {
  const header = request.headers.get('authorization');
  if (header === null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match !== null && match[1] !== undefined ? match[1].trim() : null;
};

/**
 * 创建符合 FastGPT 自定义 API 知识库反向回调协议（/v1/file/{list,content,detail,read}）的
 * 标准 Web Fetch Handler，可直接挂载到 Next.js App Router、Hono、Bun、Deno、Cloudflare Workers，
 * 或配合 `toNodeHttpHandler` 挂载到 Express / Fastify / Node 原生 HTTP 服务。
 */
export const createApiDatasetHandler = (
  options: CreateApiDatasetHandlerOptions
): WebFetchHandler => {
  const { provider, authorization, verifyToken, onError } = options;
  const basePath = normalizeBasePath(options.basePath);
  const requiresAuth = authorization !== undefined || verifyToken !== undefined;

  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const routePath = normalizeRoutePathname(url.pathname, basePath);
      if (routePath === null) {
        return jsonResponse({
          status: 404,
          body: { success: false, message: 'Not found' }
        });
      }

      // 1. 鉴权校验：对齐 FastGPT 发起的 Authorization: Bearer <token> 请求头
      if (requiresAuth) {
        const token = extractBearerToken(request);
        if (token === null || token.length === 0) {
          return jsonResponse({
            status: 401,
            body: { success: false, message: 'Missing or invalid Authorization Bearer token' }
          });
        }

        const isAuthorized = await (async () => {
          if (verifyToken !== undefined) {
            return await verifyToken(token, request);
          }
          return authorization !== undefined && constantTimeEqual(token, authorization);
        })();

        if (!isAuthorized) {
          return jsonResponse({
            status: 401,
            body: { success: false, message: 'Unauthorized' }
          });
        }
      }

      const method = request.method.toUpperCase();

      // 2. POST /v1/file/list
      if (routePath === '/v1/file/list') {
        if (method !== 'POST') {
          return jsonResponse({
            status: 405,
            headers: { allow: 'POST' },
            body: { success: false, message: 'Method not allowed' }
          });
        }

        const rawBody = await request.text();
        const bodyObj = (() => {
          if (rawBody.trim().length === 0) return {};
          try {
            const parsed = JSON.parse(rawBody) as unknown;
            if (!isRecord(parsed)) {
              throw new ApiDatasetHttpError({
                status: 400,
                message: 'Request body must be a JSON object'
              });
            }
            return parsed;
          } catch (err) {
            if (err instanceof ApiDatasetHttpError) throw err;
            throw new ApiDatasetHttpError({
              status: 400,
              message: 'Invalid JSON request body'
            });
          }
        })();

        const parentId =
          typeof bodyObj.parentId === 'string' && bodyObj.parentId.length > 0
            ? bodyObj.parentId
            : undefined;
        const searchKey =
          typeof bodyObj.searchKey === 'string' && bodyObj.searchKey.length > 0
            ? bodyObj.searchKey
            : undefined;

        const items = await provider.listFiles({
          ...(parentId !== undefined ? { parentId } : {}),
          ...(searchKey !== undefined ? { searchKey } : {}),
          request
        });

        return jsonResponse({
          body: {
            success: true,
            message: '',
            data: items.map(serializeFileItem)
          }
        });
      }

      // 3. GET /v1/file/content?id=...
      if (routePath === '/v1/file/content') {
        if (method !== 'GET') {
          return jsonResponse({
            status: 405,
            headers: { allow: 'GET' },
            body: { success: false, message: 'Method not allowed' }
          });
        }

        const id = url.searchParams.get('id')?.trim() ?? '';
        if (id.length === 0) {
          return jsonResponse({
            status: 400,
            body: { success: false, message: 'Missing required query parameter: id' }
          });
        }

        const content = await provider.getFileContent({ id, request });
        if (content === null || content === undefined) {
          return jsonResponse({
            status: 404,
            body: { success: false, message: 'File not found' }
          });
        }

        return jsonResponse({
          body: {
            success: true,
            message: '',
            data: content
          }
        });
      }

      // 4. GET /v1/file/detail?id=...
      if (routePath === '/v1/file/detail') {
        if (method !== 'GET') {
          return jsonResponse({
            status: 405,
            headers: { allow: 'GET' },
            body: { success: false, message: 'Method not allowed' }
          });
        }

        const id = url.searchParams.get('id')?.trim() ?? '';
        if (id.length === 0) {
          return jsonResponse({
            status: 400,
            body: { success: false, message: 'Missing required query parameter: id' }
          });
        }

        const detail = await provider.getFileDetail({ id, request });
        if (detail === null || detail === undefined) {
          return jsonResponse({
            status: 404,
            body: { success: false, message: 'File not found' }
          });
        }

        return jsonResponse({
          body: {
            success: true,
            message: '',
            data: serializeFileItem(detail)
          }
        });
      }

      // 5. GET /v1/file/read?id=...
      if (routePath === '/v1/file/read') {
        if (method !== 'GET') {
          return jsonResponse({
            status: 405,
            headers: { allow: 'GET' },
            body: { success: false, message: 'Method not allowed' }
          });
        }

        if (provider.getFileReadUrl === undefined) {
          return jsonResponse({
            status: 404,
            body: { success: false, message: 'File preview URL endpoint is not enabled' }
          });
        }

        const id = url.searchParams.get('id')?.trim() ?? '';
        if (id.length === 0) {
          return jsonResponse({
            status: 400,
            body: { success: false, message: 'Missing required query parameter: id' }
          });
        }

        const readResult = await provider.getFileReadUrl({ id, request });
        if (readResult === null || readResult === undefined) {
          return jsonResponse({
            status: 404,
            body: { success: false, message: 'File not found' }
          });
        }

        const resolvedUrl = typeof readResult === 'string' ? readResult : readResult.url;
        return jsonResponse({
          body: {
            success: true,
            message: '',
            data: { url: resolvedUrl }
          }
        });
      }

      return jsonResponse({
        status: 404,
        body: { success: false, message: 'Not found' }
      });
    } catch (error) {
      if (error instanceof ApiDatasetHttpError) {
        return jsonResponse({
          status: error.status,
          body: {
            success: false,
            message: error.message
          }
        });
      }

      onError?.(error, request);
      return jsonResponse({
        status: 500,
        body: {
          success: false,
          message: error instanceof Error ? error.message : 'Internal server error'
        }
      });
    }
  };
};
