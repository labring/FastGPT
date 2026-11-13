import path from 'node:path';
import mime from 'mime';
import {
  SANDBOX_INTERNAL_RUNTIME_DIR_NAME,
  SANDBOX_PREVIEW_SESSION_ID_REGEX
} from '@fastgpt/global/core/ai/sandbox/constants';
import {
  AppVerifyError,
  type AppAuthClient,
  type FetchLike,
  type VerifiedPreviewSession
} from './auth';
import type { KeepaliveTracker } from './keepalive';

const UPSTREAM_FETCH_TIMEOUT_MS = 60_000;

/**
 * 需要显式追加 `; charset=utf-8` 的非 `text/*` 文本协议 MIME 集合，
 * 避免在 `X-Content-Type-Options: nosniff` 下将 UTF-8 中文 JSON/XML 按 Latin-1 乱码解析。
 */
const UTF8_APPLICATION_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/manifest+json',
  'application/xml',
  'application/xhtml+xml',
  'application/javascript'
]);

type CachedPreviewEntry = {
  session: VerifiedPreviewSession;
  expiresAt: number;
};

/**
 * 预览会话有界内存缓存（默认 30s TTL / 5000 条上限）：
 * - 利用 `Map` 插入顺序实现轻量 FIFO/LRU 更新淘汰，防止异常流量撑爆进程内存；
 * - 通过 `inFlight` Map 对同一 `sessionId` 的并发冷启动请求做 Singleflight 合并（例如 HTML 页面同时拉取十几个静态资源时只向主站发起 1 次 `verifyTicket`）。
 */
export class PreviewSessionCache {
  private readonly entries = new Map<string, CachedPreviewEntry>();
  private readonly inFlight = new Map<string, Promise<VerifiedPreviewSession>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: { ttlMs: number; maxEntries: number }) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries;
  }

  get(sessionId: string, nowMs = Date.now()): VerifiedPreviewSession | undefined {
    const cached = this.entries.get(sessionId);
    if (!cached) {
      return undefined;
    }
    if (cached.expiresAt <= nowMs) {
      this.entries.delete(sessionId);
      return undefined;
    }
    return cached.session;
  }

  set(sessionId: string, session: VerifiedPreviewSession): void {
    if (this.entries.has(sessionId)) {
      this.entries.delete(sessionId);
    } else if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(sessionId, {
      session,
      expiresAt: Date.now() + this.ttlMs
    });
  }

  delete(sessionId: string): void {
    this.entries.delete(sessionId);
  }

  async resolve(
    sessionId: string,
    loader: (id: string) => Promise<VerifiedPreviewSession>
  ): Promise<{ session: VerifiedPreviewSession; fromCache: boolean }> {
    // 1. 优先命中有效内存缓存。
    const cached = this.get(sessionId);
    if (cached) {
      return { session: cached, fromCache: true };
    }

    // 2. 合并同一 sessionId 在途的并发回源请求。
    const existingPromise = this.inFlight.get(sessionId);
    if (existingPromise) {
      const session = await existingPromise;
      return { session, fromCache: false };
    }

    // 3. 首次回源核验，成功后写入缓存，无论成败均释放 inFlight 占位。
    const loadPromise = loader(sessionId)
      .then((session) => {
        this.set(sessionId, session);
        return session;
      })
      .finally(() => {
        this.inFlight.delete(sessionId);
      });

    this.inFlight.set(sessionId, loadPromise);
    const session = await loadPromise;
    return { session, fromCache: false };
  }
}

/**
 * 解析并词法校验 `/preview/:sessionId/*path` 中的相对路径段：
 * - 逐段 URL 解码，拒绝控制字符、反斜杠、编码斜杠（`%2f`）以及任何 `..` 路径穿越段；
 * - 拒绝访问持久化工作区根下的 `.fastgpt` 内部运行态目录；
 * - 空路径或以 `/` 结尾的目录路径自动补全 `index.html`，支持多文件前端产物相对路径跳转。
 */
export function parsePreviewRelativeSegments(
  rawSubPath: string
): { ok: true; segments: string[] } | { ok: false; status: 400 | 403; error: string } {
  if (rawSubPath.includes('\\') || /[\u0000-\u001f\u007f]/.test(rawSubPath)) {
    return { ok: false, status: 400, error: 'Invalid preview path characters' };
  }

  const appendIndexHtml = rawSubPath === '' || rawSubPath.endsWith('/');
  const rawParts = rawSubPath.split('/').filter((part) => part !== '');
  const decodedSegments: string[] = [];

  for (const part of rawParts) {
    const decoded = (() => {
      try {
        return decodeURIComponent(part);
      } catch {
        return null;
      }
    })();

    if (decoded === null) {
      return { ok: false, status: 400, error: 'Malformed URI encoding in preview path' };
    }
    if (decoded === '' || decoded === '.') {
      continue;
    }
    if (decoded.includes('/') || decoded.includes('\\') || /[\u0000-\u001f\u007f]/.test(decoded)) {
      return { ok: false, status: 403, error: 'Forbidden path segment in preview URL' };
    }
    if (decoded === '..') {
      return { ok: false, status: 403, error: 'Path traversal is not allowed' };
    }
    decodedSegments.push(decoded);
  }

  if (appendIndexHtml) {
    decodedSegments.push('index.html');
  }

  if (decodedSegments.length === 0) {
    return { ok: false, status: 400, error: 'Empty preview file path' };
  }
  if (decodedSegments[0] === SANDBOX_INTERNAL_RUNTIME_DIR_NAME) {
    return { ok: false, status: 403, error: 'Forbidden internal runtime path' };
  }

  return { ok: true, segments: decodedSegments };
}

/**
 * 将已通过词法安全校验的非空相对路径段拼接到 `rootDirectory` 下。
 */
export function buildPreviewFullPath(rootDirectory: string, segments: string[]): string {
  const normalizedRoot = path.posix.normalize(rootDirectory).replace(/\/+$/, '') || '/';
  return path.posix.join(normalizedRoot, ...segments);
}

/**
 * 根据预览文件路径解析响应 `Content-Type`：
 * - 基于标准 IANA `mime` 库覆盖全量常见静态资源、音视频、字体及数据格式，未知后缀兜底为 `application/octet-stream`；
 * - 对 `.cjs` 归一为浏览器可识别的 `text/javascript`；
 * - 对 `text/*` 与 JSON/XML 文本协议统一补充 `; charset=utf-8`，避免中文内容乱码。
 */
export function getPreviewContentType(filePath: string): string {
  const ext = path.posix.extname(filePath).toLowerCase();
  const rawMime = ext === '.cjs' ? 'text/javascript' : mime.getType(filePath);
  if (!rawMime) {
    return 'application/octet-stream';
  }
  if (
    rawMime.startsWith('text/') ||
    UTF8_APPLICATION_MIME_TYPES.has(rawMime) ||
    rawMime.endsWith('+json')
  ) {
    return `${rawMime}; charset=utf-8`;
  }
  return rawMime;
}

/**
 * 构造预览响应安全头与媒体流透传头：
 * - 通过 `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups;` 使预览文档运行在浏览器 opaque null origin 沙箱中，
 *   即使与主站同域反代也无法读取主站 Cookie、`localStorage` 或访问父窗口 DOM；
 * - 透传 `200`/`206`/`304`/`416` 下的 `Content-Range`、`Accept-Ranges` 等头部，支持 `<video>` / `<audio>` / PDF 拖拽分段加载。
 */
export function buildPreviewResponseHeaders(params: {
  filePath: string;
  upstreamStatus: number;
  upstreamHeaders: Headers;
}): Headers {
  const { filePath, upstreamStatus, upstreamHeaders } = params;
  const headers = new Headers({
    'Content-Type':
      upstreamStatus >= 400 ? 'application/json; charset=utf-8' : getPreviewContentType(filePath),
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-popups;'
  });

  if (upstreamStatus === 200 || upstreamStatus === 206 || upstreamStatus === 304) {
    for (const passthroughName of [
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified'
    ]) {
      const value = upstreamHeaders.get(passthroughName);
      if (value !== null) {
        headers.set(passthroughName, value);
      }
    }
  } else if (upstreamStatus === 416) {
    const contentRange = upstreamHeaders.get('content-range');
    if (contentRange !== null) {
      headers.set('content-range', contentRange);
    }
  }

  return headers;
}

const jsonResponse = (status: number, error: string): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'private, no-store'
    }
  });

/**
 * 创建静态文件流式预览请求处理器（`GET|HEAD /preview/:sessionId/*path`）。
 */
export function createPreviewRequestHandler(params: {
  authClient: Pick<AppAuthClient, 'verifyPreviewSession'>;
  keepalive: Pick<KeepaliveTracker, 'touch'>;
  cache: PreviewSessionCache;
  fetchImpl?: FetchLike;
}): (req: Request, url: URL) => Promise<Response> {
  const { authClient, keepalive, cache } = params;
  const fetchImpl = params.fetchImpl ?? fetch;

  /**
   * 向沙盒内 `execd` `/files/download` 发起流式文件读取请求，透传 `Range` 头并兼容不支持 `HEAD` 的上游实现。
   */
  const fetchFromExecd = async (options: {
    session: VerifiedPreviewSession;
    fullPath: string;
    method: 'GET' | 'HEAD';
    rangeHeader: string | null;
  }): Promise<Response> => {
    const { session, fullPath, method, rangeHeader } = options;
    const downloadUrl = `${session.execdBaseUrl.replace(/\/+$/, '')}/files/download?path=${encodeURIComponent(fullPath)}`;
    const requestHeaders = new Headers(session.execdHeaders);
    if (rangeHeader !== null && rangeHeader.trim() !== '') {
      requestHeaders.set('Range', rangeHeader);
    }

    const upstreamRes = await fetchImpl(downloadUrl, {
      method,
      headers: requestHeaders,
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS)
    });

    // 若上游 execd 对 HEAD 返回 405，自动降级发起 GET 并立即取消响应体流，仅保留元信息响应头。
    if (method === 'HEAD' && upstreamRes.status === 405) {
      await upstreamRes.body?.cancel().catch(() => {});
      const getRes = await fetchImpl(downloadUrl, {
        method: 'GET',
        headers: requestHeaders,
        redirect: 'manual',
        signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS)
      });
      await getRes.body?.cancel().catch(() => {});
      return new Response(null, {
        status: getRes.status,
        headers: getRes.headers
      });
    }

    return upstreamRes;
  };

  return async (req: Request, url: URL): Promise<Response> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return jsonResponse(405, 'Method Not Allowed');
    }

    // 1. 解析 `/preview/:sessionId/*path` 并在边缘直接拦截非法 sessionId 或路径穿越请求。
    const afterPrefix = url.pathname.slice('/preview/'.length);
    const slashIndex = afterPrefix.indexOf('/');
    const sessionId = slashIndex === -1 ? afterPrefix : afterPrefix.slice(0, slashIndex);
    const rawSubPath = slashIndex === -1 ? '' : afterPrefix.slice(slashIndex + 1);

    if (!SANDBOX_PREVIEW_SESSION_ID_REGEX.test(sessionId)) {
      return jsonResponse(400, 'Invalid preview session ID');
    }

    const parsedSegments = parsePreviewRelativeSegments(rawSubPath);
    if (!parsedSegments.ok) {
      return jsonResponse(parsedSegments.status, parsedSegments.error);
    }

    const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
    const rangeHeader = req.headers.get('range');

    // 2. 最多尝试 2 次：首次若命中 30s 缓存但沙盒因休眠重建返回 502/503/504 或网络断开，驱逐失效缓存重新唤醒并重试 1 次。
    let resolved: { session: VerifiedPreviewSession; fromCache: boolean } | undefined;
    let upstreamRes: Response | undefined;
    let fullPath = '';

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        resolved = await cache.resolve(sessionId, (id) => authClient.verifyPreviewSession(id));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid preview session';
        const status = error instanceof AppVerifyError ? error.status : 502;
        return jsonResponse(status, message);
      }

      fullPath = buildPreviewFullPath(resolved.session.rootDirectory, parsedSegments.segments);
      try {
        const res = await fetchFromExecd({
          session: resolved.session,
          fullPath,
          method,
          rangeHeader
        });
        const isRetryableGatewayStatus =
          res.status === 502 || res.status === 503 || res.status === 504;
        if (attempt === 0 && resolved.fromCache && isRetryableGatewayStatus) {
          await res.body?.cancel().catch(() => {});
          cache.delete(sessionId);
          continue;
        }
        upstreamRes = res;
        break;
      } catch (error) {
        if (attempt === 0 && resolved.fromCache) {
          cache.delete(sessionId);
          continue;
        }
        const message = error instanceof Error ? error.message : 'Preview upstream unavailable';
        return jsonResponse(502, message);
      }
    }

    if (!resolved || !upstreamRes) {
      return jsonResponse(502, 'Preview upstream unavailable');
    }

    // 3. 记录一次性预览活跃标记，并在下一轮周期批量上报主站续期沙盒。
    keepalive.touch(resolved.session.sandboxId);

    // 4. 映射上游非 416 错误响应为干净的 JSON 错误体，不透传内部容器堆栈信息。
    if (upstreamRes.status >= 400 && upstreamRes.status !== 416) {
      await upstreamRes.body?.cancel().catch(() => {});
      const mappedStatus = upstreamRes.status === 404 ? 404 : upstreamRes.status >= 500 ? 502 : 400;
      return jsonResponse(
        mappedStatus,
        mappedStatus === 404 ? 'Preview file not found' : `Upstream error (${upstreamRes.status})`
      );
    }

    // 5. 零拷贝透传上游 ReadableStream 字节流，确保大体积视频/文档预览占用恒定极低内存。
    const responseHeaders = buildPreviewResponseHeaders({
      filePath: fullPath,
      upstreamStatus: upstreamRes.status,
      upstreamHeaders: upstreamRes.headers
    });

    return new Response(method === 'HEAD' ? null : upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders
    });
  };
}
