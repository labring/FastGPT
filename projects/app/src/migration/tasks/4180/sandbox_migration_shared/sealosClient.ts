/**
 * 隔离式轻量 Sealos Devbox REST API 客户端（仅服务于 4.18.0 沙箱迁移与清理任务）。
 *
 * 完整收敛于 `tasks/4180/` 目录，不向主包引入任何已下线的 `sealosdevbox` 依赖。
 */
import { z } from 'zod';
import { getSandboxMigrationEnv, sanitizeMigrationErrorMessage } from './env';

const DEVBOX_POLL_INTERVAL_MS = 1_000;
const DEVBOX_RESUME_TIMEOUT_MS = 120_000;
const DEVBOX_COMMAND_READY_TIMEOUT_MS = 60_000;

const DevboxInfoDataSchema = z.object({
  name: z.string(),
  deletionTimestamp: z.string().nullable().optional(),
  state: z.object({
    phase: z.string()
  })
});

export type LegacyDevboxInfo = z.infer<typeof DevboxInfoDataSchema>;

const DevboxExecDataSchema = z.object({
  exitCode: z.number(),
  stdout: z.string().default(''),
  stderr: z.string().default('')
});

export type LegacyDevboxExecResult = z.infer<typeof DevboxExecDataSchema>;

export class SealosDevboxNotFoundError extends Error {
  constructor(sandboxId: string) {
    super(`Sealos Devbox instance not found: ${sandboxId}`);
    this.name = 'SealosDevboxNotFoundError';
  }
}

function isNotFoundStatusOrMessage(status: number, message: string): boolean {
  if (status === 404) return true;
  const lower = message.toLowerCase();
  return (
    lower.includes('not found') || lower.includes('notfound') || lower.includes('does not exist')
  );
}

function isCommandChannelNotReady(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('pod is not running') ||
    lower.includes('exec command timeout') ||
    lower.includes('container is creating')
  );
}

const sleepWithSignal = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export class LegacySealosDevboxClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: { baseUrl: string; token: string }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    const url = new URL(path, `${this.baseUrl}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private async requestJson<T>(params: {
    url: string;
    init?: RequestInit;
    schema?: z.ZodType<T>;
  }): Promise<{ status: number; code: number; message: string; data: T | undefined }> {
    const headers = new Headers(params.init?.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    if (params.init?.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(params.url, { ...params.init, headers });
    const rawText = await res.text().catch(() => '');
    const parsedEnvelope = (() => {
      try {
        return rawText
          ? (JSON.parse(rawText) as { code?: number; message?: string; data?: unknown })
          : {};
      } catch {
        if (res.status === 404) {
          return null;
        }
        throw new Error(
          sanitizeMigrationErrorMessage(
            `Sealos Devbox non-JSON response (${res.status}): ${rawText.slice(0, 120)}`,
            [this.token]
          )
        );
      }
    })();
    if (parsedEnvelope === null) {
      return { status: 404, code: 404, message: 'Not Found', data: undefined };
    }

    const code = typeof parsedEnvelope.code === 'number' ? parsedEnvelope.code : res.status;
    const message = typeof parsedEnvelope.message === 'string' ? parsedEnvelope.message : '';
    const data =
      params.schema && parsedEnvelope.data !== undefined && res.ok && code < 400
        ? params.schema.parse(parsedEnvelope.data)
        : (parsedEnvelope.data as T | undefined);

    return { status: res.status, code, message, data };
  }

  /** 查询远端 Devbox 状态；404 返回 `null`。 */
  async info(name: string, signal?: AbortSignal): Promise<LegacyDevboxInfo | null> {
    const res = await this.requestJson({
      url: this.buildUrl(`/api/v1/devbox/${encodeURIComponent(name)}`),
      init: { method: 'GET', signal },
      schema: DevboxInfoDataSchema
    });

    if (isNotFoundStatusOrMessage(res.status, res.message) || res.code === 404) {
      return null;
    }
    if (res.status >= 400 || res.code >= 400 || !res.data) {
      throw new Error(
        sanitizeMigrationErrorMessage(
          `Sealos Devbox info failed (${res.code}): ${res.message || res.status}`,
          [this.token]
        )
      );
    }
    return res.data;
  }

  /** 在远端 Devbox 内执行命令并返回退出码与输出。 */
  async exec(params: {
    name: string;
    command: string[];
    timeoutSeconds?: number;
    signal?: AbortSignal;
  }): Promise<LegacyDevboxExecResult> {
    const res = await this.requestJson({
      url: this.buildUrl(`/api/v1/devbox/${encodeURIComponent(params.name)}/exec`),
      init: {
        method: 'POST',
        body: JSON.stringify({
          command: params.command,
          timeoutSeconds: params.timeoutSeconds ?? 120
        }),
        signal: params.signal
      },
      schema: DevboxExecDataSchema
    });

    if (res.status >= 400 || res.code >= 400 || !res.data) {
      throw new Error(
        sanitizeMigrationErrorMessage(
          `Sealos Devbox exec failed (${res.code}): ${res.message || res.status}`,
          [this.token]
        )
      );
    }
    return res.data;
  }

  /** 确保远端 Devbox 处于 `Running` 且命令通道已就绪（暂停/停止实例自动唤醒）。 */
  async resumeAndWaitReady(params: { name: string; signal?: AbortSignal }): Promise<void> {
    const { name, signal } = params;
    const initial = await this.info(name, signal);
    if (!initial || initial.deletionTimestamp) {
      throw new SealosDevboxNotFoundError(name);
    }

    // 1. 等待 Pod 进入 Running 阶段（若初始处于 Stopping/Pausing 等过渡态，待其落入静止态后自动补发一次 /resume）。
    const runningDeadline = Date.now() + DEVBOX_RESUME_TIMEOUT_MS;
    let resumeTriggered = false;
    let current: Awaited<ReturnType<typeof this.info>> = initial;
    while (true) {
      if (!current || current.deletionTimestamp) {
        throw new SealosDevboxNotFoundError(name);
      }
      const phase = current.state.phase;
      if (phase === 'Running') break;
      if (phase === 'Error') {
        throw new Error(`Sealos Devbox ${name} entered Error phase while resuming`);
      }
      if (!resumeTriggered && (phase === 'Paused' || phase === 'Stopped' || phase === 'Shutdown')) {
        resumeTriggered = true;
        const resumeRes = await this.requestJson({
          url: this.buildUrl(`/api/v1/devbox/${encodeURIComponent(name)}/resume`),
          init: { method: 'POST', signal }
        });
        if (resumeRes.status >= 400 || resumeRes.code >= 400) {
          throw new Error(
            sanitizeMigrationErrorMessage(
              `Sealos Devbox resume failed (${resumeRes.code}): ${resumeRes.message}`,
              [this.token]
            )
          );
        }
      }
      if (Date.now() >= runningDeadline) {
        throw new Error(
          `Timed out waiting for Sealos Devbox ${name} to enter Running (current: ${phase})`
        );
      }
      await sleepWithSignal(DEVBOX_POLL_INTERVAL_MS, signal);
      signal?.throwIfAborted();
      current = await this.info(name, signal);
    }

    // 2. 探测 exec 通道就绪，屏蔽容器刚拉起时的瞬态超时。
    const readyDeadline = Date.now() + DEVBOX_COMMAND_READY_TIMEOUT_MS;
    while (true) {
      signal?.throwIfAborted();
      try {
        const probe = await this.exec({
          name,
          command: ['sh', '-c', 'true'],
          timeoutSeconds: 10,
          signal
        });
        if (probe.exitCode === 0) return;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!isCommandChannelNotReady(msg) || Date.now() >= readyDeadline) {
          throw error;
        }
      }
      if (Date.now() >= readyDeadline) {
        throw new Error(`Timed out waiting for Sealos Devbox ${name} command channel readiness`);
      }
      await sleepWithSignal(DEVBOX_POLL_INTERVAL_MS, signal);
    }
  }

  /** 以流式响应下载远端 Devbox 内的归档文件，不在主站内存缓存完整包体。 */
  async downloadFileWebStream(params: {
    name: string;
    path: string;
    timeoutSeconds?: number;
    signal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array>> {
    const url = this.buildUrl(`/api/v1/devbox/${encodeURIComponent(params.name)}/files/download`, {
      path: params.path,
      timeoutSeconds: String(params.timeoutSeconds ?? 600)
    });
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.token}` },
      signal: params.signal
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        sanitizeMigrationErrorMessage(
          `Sealos Devbox file download failed (${res.status}): ${detail.slice(0, 120)}`,
          [this.token]
        )
      );
    }
    return res.body as ReadableStream<Uint8Array>;
  }

  /** 导出完成后暂停远端 Devbox 释放计算计费，保留底层磁盘供回滚窗口使用。 */
  async pause(name: string, signal?: AbortSignal): Promise<void> {
    const current = await this.info(name, signal);
    if (!current || current.deletionTimestamp) return;
    if (
      current.state.phase === 'Paused' ||
      current.state.phase === 'Stopped' ||
      current.state.phase === 'Shutdown'
    ) {
      return;
    }
    const res = await this.requestJson({
      url: this.buildUrl(`/api/v1/devbox/${encodeURIComponent(name)}/pause`),
      init: { method: 'POST', signal }
    });
    if (
      (res.status >= 400 || res.code >= 400) &&
      !isNotFoundStatusOrMessage(res.status, res.message)
    ) {
      throw new Error(
        sanitizeMigrationErrorMessage(`Sealos Devbox pause failed (${res.code}): ${res.message}`, [
          this.token
        ])
      );
    }
  }

  /** 幂等删除远端 Devbox 实例（任务 2 物理回收阶段调用，404 视为成功）。 */
  async delete(name: string, signal?: AbortSignal): Promise<void> {
    const res = await this.requestJson({
      url: this.buildUrl(`/api/v1/devbox/${encodeURIComponent(name)}`),
      init: { method: 'DELETE', signal }
    });
    if (isNotFoundStatusOrMessage(res.status, res.message) || res.code === 404) {
      return;
    }
    if (res.status >= 400 || res.code >= 400) {
      throw new Error(
        sanitizeMigrationErrorMessage(`Sealos Devbox delete failed (${res.code}): ${res.message}`, [
          this.token
        ])
      );
    }
  }
}

/** 从迁移环境变量构造 Sealos Devbox 客户端；缺省配置时抛出可读指引。 */
export function createLegacySealosClientFromEnv(): LegacySealosDevboxClient {
  const { sealosBaseUrl, sealosToken } = getSandboxMigrationEnv();
  if (!sealosBaseUrl || !sealosToken) {
    throw new Error(
      'AGENT_SANDBOX_SEALOS_BASEURL and AGENT_SANDBOX_SEALOS_TOKEN are required to migrate/cleanup Sealos Devbox instances'
    );
  }
  return new LegacySealosDevboxClient({ baseUrl: sealosBaseUrl, token: sealosToken });
}
