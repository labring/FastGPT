import jwt from 'jsonwebtoken';
import { z } from 'zod';
import {
  AGENT_SANDBOX_PROXY_SECRET_HEADER,
  SANDBOX_KEEPALIVE_MAX_BATCH_SIZE
} from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxVerifyTicketResponseSchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';

const VERIFY_REQUEST_TIMEOUT_MS = 15_000;
/** 主站 `SandboxErrEnum.agentSandboxPermissionDenied` 对应的业务错误码。 */
const SANDBOX_PERMISSION_DENIED_CODE = 510000;

/** 终端连接短期 HS256 JWT Ticket 载荷契约（与主站 `getTicket` / `verifyTicket` 对齐）。 */
export const TerminalTicketClaimsSchema = z.object({
  sandboxId: z.string().trim().min(1),
  ptySessionId: z.string().trim().min(1),
  exp: z.number().finite()
});
export type TerminalTicketClaims = z.infer<typeof TerminalTicketClaimsSchema>;

export type TicketPrecheckResult =
  | { ok: true; claims: TerminalTicketClaims }
  | { ok: false; reason: string };

/** 主站 `verifyTicket` 在终端模式下返回的已核验连接上下文。 */
export const VerifiedTerminalSessionSchema = SandboxVerifyTicketResponseSchema.pick({
  sandboxId: true,
  execdBaseUrl: true,
  execdHeaders: true
}).extend({
  ptySessionId: z.string().min(1),
  reused: z.boolean().optional().default(true)
});
export type VerifiedTerminalSession = z.infer<typeof VerifiedTerminalSessionSchema>;

/** 主站 `verifyTicket` 在静态文件预览模式下返回的已核验工作区上下文。 */
export const VerifiedPreviewSessionSchema = SandboxVerifyTicketResponseSchema.pick({
  sandboxId: true,
  execdBaseUrl: true,
  execdHeaders: true
}).extend({
  rootDirectory: z.string().min(1)
});
export type VerifiedPreviewSession = z.infer<typeof VerifiedPreviewSessionSchema>;

/** 主站 `NextAPI` 统一响应外层结构。 */
const NextApiEnvelopeSchema = z
  .object({
    code: z.number().optional(),
    message: z.string().optional(),
    data: z.unknown().optional()
  })
  .passthrough();

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type AppAuthClient = {
  verifyTerminalTicket: (ticket: string) => Promise<VerifiedTerminalSession>;
  verifyPreviewSession: (previewSessionId: string) => Promise<VerifiedPreviewSession>;
  sendKeepalive: (sandboxIds: string[]) => Promise<void>;
};

/**
 * 主站票据/预览会话核验异常，携带已映射的对客 HTTP 状态码：
 * - `403`：票据或预览 sessionId 无效、已过期或无访问权限；
 * - `404`：目标沙盒或文件不存在；
 * - `502`：内部共享密钥失配、沙盒唤醒锁冲突或主站自身异常。
 */
export class AppVerifyError extends Error {
  readonly status: 403 | 404 | 502;

  constructor(message: string, status: 403 | 404 | 502) {
    super(message);
    this.name = 'AppVerifyError';
    this.status = status;
  }
}

/**
 * 在 WebSocket Upgrade 阶段于边缘侧本地预验签 HS256 JWT Ticket：
 * - 使用标准 `jsonwebtoken` 锁定 `algorithms: ['HS256']` 校验签名与过期时间，杜绝 `alg: none` 或算法混淆攻击；
 * - 在不触发任何主站 RPC 的前提下直接拦截伪造或过期连接请求，保护主站免受无效连接洪峰冲击。
 */
export function verifyHs256JwtTicket(params: {
  ticket: string;
  secret: string;
  nowMs?: number;
}): TicketPrecheckResult {
  const { ticket, secret } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (!ticket || !secret) {
    return { ok: false, reason: 'Missing ticket or secret' };
  }

  // 1. 锁定 HS256 验签并基于秒级时钟初筛过期票据。
  const decoded = (() => {
    try {
      return jwt.verify(ticket, secret, {
        algorithms: ['HS256'],
        clockTimestamp: Math.floor(nowMs / 1000)
      });
    } catch (error) {
      return error instanceof Error ? error : new Error('Invalid JWT ticket');
    }
  })();

  if (decoded instanceof Error) {
    return { ok: false, reason: decoded.message };
  }
  if (typeof decoded !== 'object' || decoded === null) {
    return { ok: false, reason: 'Invalid JWT payload object' };
  }

  // 2. 使用 Zod 校验核心业务声明，并按毫秒时间戳精确二次确认未过期。
  const parsedClaims = TerminalTicketClaimsSchema.safeParse(decoded);
  if (!parsedClaims.success) {
    return { ok: false, reason: 'Missing required terminal ticket claims' };
  }
  if (parsedClaims.data.exp * 1000 <= nowMs) {
    return { ok: false, reason: 'Expired JWT ticket' };
  }

  return {
    ok: true,
    claims: parsedClaims.data
  };
}

/**
 * 在容器化本地开发场景下，将 `verifyTicket` 返回的宿主机回环地址（`localhost` / `127.0.0.1` / `::1`）
 * 重写为容器可访问的目标主机名（如 `host.docker.internal`），并去除末尾多余斜杠。
 */
export function rewriteLoopbackEndpointUrl(rawUrl: string, rewriteHost?: string): string {
  const targetHost = rewriteHost?.trim();
  if (!targetHost) {
    return rawUrl;
  }

  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  ) {
    parsed.hostname = targetHost;
  }
  return parsed.toString().replace(/\/+$/, '');
}

/**
 * 创建与主站内部沙盒接口（`verifyTicket` / `keepalive`）通信的鉴权与续期客户端。
 */
export function createAppAuthClient(params: {
  fastgptAppUrl: string;
  proxySecret: string;
  rewriteHost?: string;
  fetchImpl?: FetchLike;
}): AppAuthClient {
  const { fastgptAppUrl, proxySecret, rewriteHost } = params;
  const fetchImpl = params.fetchImpl ?? fetch;
  const baseUrl = fastgptAppUrl.replace(/\/+$/, '');

  /**
   * 将主站 HTTP 状态码与 `NextAPI` 业务码映射为代理侧对客状态码：
   * 主站返回 401/409/5xx 代表内部密钥失配、并发唤醒冲突或主站故障，统一归为 502；
   * 返回 400/403/404 或 `510000`（`agentSandboxPermissionDenied`）代表客户端票据/预览会话失效。
   */
  const mapAppErrorStatus = (httpStatus: number, appCode?: number): 403 | 404 | 502 => {
    if (httpStatus === 404 || (httpStatus === 200 && appCode === 404)) {
      return 404;
    }
    if (
      httpStatus === 400 ||
      httpStatus === 403 ||
      (httpStatus === 200 &&
        (appCode === 400 || appCode === 403 || appCode === SANDBOX_PERMISSION_DENIED_CODE))
    ) {
      return 403;
    }
    return 502;
  };

  /**
   * 解包主站 `NextAPI` JSON 响应并用共享 Zod Schema 严格校验返回载荷，避免不安全类型断言。
   */
  const unwrapNextApiData = async <TSchema extends z.ZodTypeAny>(options: {
    res: Response;
    schema: TSchema;
    label: string;
  }): Promise<z.infer<TSchema>> => {
    const { res, schema, label } = options;
    const rawJson = await res.json().catch(() => null);
    const envelopeResult = NextApiEnvelopeSchema.safeParse(rawJson);
    const envelope = envelopeResult.success ? envelopeResult.data : undefined;

    // 1. 先处理非 2xx HTTP 响应。
    if (!res.ok) {
      const errMsg = envelope?.message ?? `${label} failed with HTTP ${res.status}`;
      throw new AppVerifyError(errMsg, mapAppErrorStatus(res.status, envelope?.code));
    }

    if (!envelope) {
      throw new AppVerifyError(`${label} returned invalid JSON`, 502);
    }

    // 2. 处理 NextAPI 在 HTTP 200 下包装的业务错误码。
    if (envelope.code !== undefined && envelope.code !== 200) {
      const errMsg = envelope.message ?? `${label} rejected with code ${envelope.code}`;
      throw new AppVerifyError(errMsg, mapAppErrorStatus(res.status, envelope.code));
    }

    // 3. 兼容解包 envelope.data 与裸对象响应，并执行 Schema 校验。
    const candidatePayload =
      typeof envelope.data === 'object' && envelope.data !== null ? envelope.data : envelope;
    const parsedData = schema.safeParse(candidatePayload);
    if (!parsedData.success) {
      throw new AppVerifyError(`${label} returned malformed response payload`, 502);
    }
    return parsedData.data;
  };

  return {
    verifyTerminalTicket: async (ticket: string) => {
      const query = new URLSearchParams({ ticket });
      const res = await fetchImpl(
        `${baseUrl}/api/core/ai/sandbox/verifyTicket?${query.toString()}`,
        {
          method: 'GET',
          headers: { [AGENT_SANDBOX_PROXY_SECRET_HEADER]: proxySecret },
          signal: AbortSignal.timeout(VERIFY_REQUEST_TIMEOUT_MS)
        }
      );
      const data = await unwrapNextApiData({
        res,
        schema: VerifiedTerminalSessionSchema,
        label: 'verifyTicket(terminal)'
      });
      return {
        sandboxId: data.sandboxId,
        execdBaseUrl: rewriteLoopbackEndpointUrl(data.execdBaseUrl, rewriteHost),
        execdHeaders: data.execdHeaders,
        ptySessionId: data.ptySessionId,
        reused: data.reused
      };
    },

    verifyPreviewSession: async (previewSessionId: string) => {
      const query = new URLSearchParams({ previewSessionId });
      const res = await fetchImpl(
        `${baseUrl}/api/core/ai/sandbox/verifyTicket?${query.toString()}`,
        {
          method: 'GET',
          headers: { [AGENT_SANDBOX_PROXY_SECRET_HEADER]: proxySecret },
          signal: AbortSignal.timeout(VERIFY_REQUEST_TIMEOUT_MS)
        }
      );
      const data = await unwrapNextApiData({
        res,
        schema: VerifiedPreviewSessionSchema,
        label: 'verifyTicket(preview)'
      });
      return {
        sandboxId: data.sandboxId,
        execdBaseUrl: rewriteLoopbackEndpointUrl(data.execdBaseUrl, rewriteHost),
        execdHeaders: data.execdHeaders,
        rootDirectory: data.rootDirectory
      };
    },

    sendKeepalive: async (sandboxIds: string[]) => {
      for (let index = 0; index < sandboxIds.length; index += SANDBOX_KEEPALIVE_MAX_BATCH_SIZE) {
        const batch = sandboxIds.slice(index, index + SANDBOX_KEEPALIVE_MAX_BATCH_SIZE);
        const res = await fetchImpl(`${baseUrl}/api/core/ai/sandbox/keepalive`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [AGENT_SANDBOX_PROXY_SECRET_HEADER]: proxySecret
          },
          body: JSON.stringify({ sandboxIds: batch }),
          signal: AbortSignal.timeout(VERIFY_REQUEST_TIMEOUT_MS)
        });
        if (!res.ok) {
          throw new Error(`keepalive failed with HTTP ${res.status}`);
        }
      }
    }
  };
}
