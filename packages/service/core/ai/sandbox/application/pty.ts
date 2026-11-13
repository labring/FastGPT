/**
 * 沙盒业务层：管理 OpenSandbox `execd` 原生 `/pty` 会话生命周期与 Redis 会话绑定。
 *
 * 终端数据面流量直接由 `opensandbox-proxy` 以原生 WebSocket 透传至 `execd`，主站仅在 `getTicket` /
 * `verifyTicket` 阶段确保容器内存在存活的交互式 bash 会话并返回上游寻址信息。
 */
import z from 'zod';
import { DEFAULT_EXECD_PORT } from '@alibaba-group/opensandbox';
import { asRedisLogicalKey, redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import {
  SANDBOX_LIFECYCLE_LEASE_RENEW_INTERVAL_MS,
  SANDBOX_LIFECYCLE_LEASE_RETRY_INTERVAL_MS,
  SANDBOX_LIFECYCLE_LEASE_TTL_MS
} from '../constants';
import { acquireSandboxRedisLease } from './lease';
import type { SandboxClient } from './runtime/client';

// 仅续租仍属于当前 shell 的绑定，旧连接的迟到校验不得覆盖新会话。
const RENEW_PTY_STATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, state = pcall(cjson.decode, raw)
if not ok or state.ptySessionId ~= ARGV[1] then return 0 end
return redis.call('EXPIRE', KEYS[1], ARGV[2])
`;
const PUBLISH_PTY_STATE_SCRIPT = `
local current = redis.call('GET', KEYS[1]) or ''
if current ~= ARGV[1] and current ~= '' then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
`;
const CLEAR_PTY_STATE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;

const SANDBOX_PTY_TTL_SECONDS = 3600;

/**
 * `execd` 默认以 `bash --noprofile --norc` 启动 PTY，会跳过 `/etc/bash.bashrc` 与 `~/.bashrc` 导致提示符退化为 `bash-5.2$`。
 * 通过 `exec /bin/bash` 原地替换为标准交互式 bash，自动加载容器内 `/home/sandbox/.bashrc` 并显示工作目录。
 */
export const DEFAULT_SANDBOX_PTY_COMMAND = 'exec /bin/bash';

const SANDBOX_PTY_STATE_KEY_PREFIX = 'sandbox:pty:state';

const StoredPtyStateSchema = z.object({
  ptySessionId: z.string().min(1)
});

const getPtyStateKey = (sandboxId: string) =>
  asRedisLogicalKey(`${SANDBOX_PTY_STATE_KEY_PREFIX}:${sandboxId}`);

/** 按 shell ID 原子续租活跃 PTY 绑定；不创建缺失绑定，也不延长其他 shell 的有效期。 */
async function renewPtySessionBinding({
  sandboxId,
  ptySessionId
}: {
  sandboxId: string;
  ptySessionId: string;
}): Promise<boolean> {
  const renewed = await redisCacheAdapter.evalScript({
    script: RENEW_PTY_STATE_SCRIPT,
    keys: [getPtyStateKey(sandboxId)],
    args: [ptySessionId, SANDBOX_PTY_TTL_SECONDS]
  });
  return Number(renewed) === 1;
}

export type SandboxPtySessionEndpoint = {
  ptySessionId: string;
  httpBaseUrl: string;
  headers: Record<string, string>;
  reused: boolean;
};

/**
 * 确保当前沙盒在 `execd` 中拥有可用的交互式 PTY 会话，并返回 OpenSandbox Server Proxy 下的基地址与请求头。
 * 若 Redis 中已缓存 `ptySessionId` 且远端仍处于运行态则直接复用。
 */
export async function ensureSandboxPtySession(
  sandbox: SandboxClient,
  options: {
    cols?: number;
    rows?: number;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<SandboxPtySessionEndpoint> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sandboxId = sandbox.getSandboxId();
  const { sessionWorkDirectory } = sandbox.getRuntimePaths();
  await sandbox.opensandbox.createDirectories([sessionWorkDirectory]);

  const endpoint = await sandbox.opensandbox.getEndpoint(DEFAULT_EXECD_PORT);
  const httpBaseUrl = endpoint.url.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    ...(endpoint.headers ?? {})
  };

  const stateKey = getPtyStateKey(sandboxId);

  /** 快路径只复用仍绑定的活跃 shell；慢路径持锁后重新读取，避免并发首次建连各自创建。 */
  const tryReuseSession = async (cachedRaw: string | null, cleanupExited = false) => {
    if (!cachedRaw) {
      return null;
    }

    const parsedState = StoredPtyStateSchema.safeParse(
      (() => {
        try {
          return JSON.parse(cachedRaw);
        } catch {
          return null;
        }
      })()
    );
    if (!parsedState.success) {
      return null;
    }

    const existingId = parsedState.data.ptySessionId;
    const statusRes = await fetchImpl(`${httpBaseUrl}/pty/${encodeURIComponent(existingId)}`, {
      method: 'GET',
      headers
    }).catch(() => null);
    if (!statusRes?.ok) {
      return null;
    }

    const statusBody = await statusRes.json().catch(() => null);
    const isExited =
      Boolean(statusBody) &&
      typeof statusBody === 'object' &&
      'running' in statusBody &&
      (statusBody as { running?: unknown }).running === false;
    if (isExited) {
      if (cleanupExited) {
        await fetchImpl(`${httpBaseUrl}/pty/${encodeURIComponent(existingId)}`, {
          method: 'DELETE',
          headers
        }).catch(() => undefined);
      }
      return null;
    }

    if (await renewPtySessionBinding({ sandboxId, ptySessionId: existingId })) {
      return {
        ptySessionId: existingId,
        httpBaseUrl,
        headers,
        reused: true
      };
    }

    return null;
  };

  const reusable = await tryReuseSession(await redisCacheAdapter.get(stateKey));
  if (reusable) {
    return reusable;
  }

  let createdPtySessionId: string | undefined;
  try {
    return await acquireSandboxRedisLease({
      key: `sandbox:pty:create:${sandboxId}`,
      label: `create-sandbox-pty:${sandboxId}`,
      ttlMs: SANDBOX_LIFECYCLE_LEASE_TTL_MS,
      renewIntervalMs: SANDBOX_LIFECYCLE_LEASE_RENEW_INTERVAL_MS,
      waitTimeoutMs: SANDBOX_LIFECYCLE_LEASE_TTL_MS,
      retryIntervalMs: SANDBOX_LIFECYCLE_LEASE_RETRY_INTERVAL_MS,
      fn: async ({ assertValid, signal }) => {
        const previousState = await redisCacheAdapter.get(stateKey);
        const existing = await tryReuseSession(previousState, true);
        assertValid();
        if (existing) {
          return existing;
        }

        const initialCols =
          typeof options.cols === 'number' && Number.isInteger(options.cols) && options.cols > 0
            ? options.cols
            : undefined;
        const initialRows =
          typeof options.rows === 'number' && Number.isInteger(options.rows) && options.rows > 0
            ? options.rows
            : undefined;
        const createRes = await fetchImpl(`${httpBaseUrl}/pty`, {
          method: 'POST',
          signal,
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            cwd: sessionWorkDirectory,
            command: DEFAULT_SANDBOX_PTY_COMMAND,
            ...(initialCols !== undefined && initialRows !== undefined
              ? { cols: initialCols, rows: initialRows }
              : {})
          })
        });
        if (!createRes.ok) {
          const text = await createRes.text().catch(() => '');
          throw new Error(`Failed to create sandbox PTY session (${createRes.status}): ${text}`);
        }
        const created = z.object({ session_id: z.string().min(1) }).parse(await createRes.json());
        const ptySessionId = created.session_id;
        createdPtySessionId = ptySessionId;
        assertValid();

        // 发布绑定同样走 CAS：租约失效或旧连接迟到时，不覆盖另一个副本已发布的新 shell。
        const published = await redisCacheAdapter.evalScript({
          script: PUBLISH_PTY_STATE_SCRIPT,
          keys: [stateKey],
          args: [previousState ?? '', JSON.stringify({ ptySessionId }), SANDBOX_PTY_TTL_SECONDS]
        });
        if (Number(published) !== 1) {
          throw new Error('Sandbox PTY session binding changed');
        }
        assertValid();

        return {
          ptySessionId,
          httpBaseUrl,
          headers,
          reused: false
        };
      }
    });
  } catch (error) {
    if (createdPtySessionId) {
      // 绑定发布失败时只回收本次创建的 shell，不能删除其他副本的新绑定。
      await fetchImpl(`${httpBaseUrl}/pty/${encodeURIComponent(createdPtySessionId)}`, {
        method: 'DELETE',
        headers
      }).catch(() => undefined);
      await redisCacheAdapter
        .evalScript({
          script: CLEAR_PTY_STATE_SCRIPT,
          keys: [stateKey],
          args: [JSON.stringify({ ptySessionId: createdPtySessionId })]
        })
        .catch(() => undefined);
    }
    throw error;
  }
}

/**
 * 供 `verifyTicket` 使用的终端会话核验快路径：
 * - `getTicket` 已在数秒前确认容器内 PTY 存活并写入 Redis 绑定，若原子续租命中同一 `expectedPtySessionId`，
 *   直接返回 `execd` 端点而不重复发起容器内 `mkdir` 与 `GET /pty/<id>` RPC；
 * - 若绑定已过期或被替换，再回退完整 `ensureSandboxPtySession` 恢复/重建会话。
 */
export async function resolveVerifiedSandboxPtySession(params: {
  sandbox: SandboxClient;
  expectedPtySessionId: string;
  cols?: number;
  rows?: number;
  fetchImpl?: typeof fetch;
}): Promise<SandboxPtySessionEndpoint> {
  const { sandbox, expectedPtySessionId, cols, rows, fetchImpl } = params;
  const sandboxId = sandbox.getSandboxId();
  if (await renewPtySessionBinding({ sandboxId, ptySessionId: expectedPtySessionId })) {
    const endpoint = await sandbox.opensandbox.getEndpoint(DEFAULT_EXECD_PORT);
    return {
      ptySessionId: expectedPtySessionId,
      httpBaseUrl: endpoint.url.replace(/\/+$/, ''),
      headers: {
        ...(endpoint.headers ?? {})
      },
      reused: true
    };
  }

  const ensured = await ensureSandboxPtySession(sandbox, { cols, rows, fetchImpl });
  return {
    ...ensured,
    reused: ensured.ptySessionId === expectedPtySessionId
  };
}
