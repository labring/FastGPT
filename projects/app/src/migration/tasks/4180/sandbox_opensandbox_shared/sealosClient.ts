import { Readable } from 'node:stream';
import { delayWithSignal, throwIfAborted } from '@fastgpt/global/common/system/utils';

const GET_INFO_RETRY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;
const LIFECYCLE_TIMEOUT_MS = 120_000;
const COMMAND_READY_TIMEOUT_MS = 300_000;
const COMMAND_PROBE_TIMEOUT_SECONDS = 5;
const REQUEST_TIMEOUT_MS = 30_000;

const STOPPED_PHASES = new Set(['Paused', 'Stopped', 'Shutdown']);
const STOPPING_PHASES = new Set(['Pausing', 'Stopping', 'Shutting']);

export type SealosDevboxInfo = {
  name: string;
  deletionTimestamp?: string | null;
  state: {
    phase: string;
  };
};

type SealosExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SealosMigrationClient = {
  getDevbox: (name: string, signal?: AbortSignal) => Promise<SealosDevboxInfo | null>;
  pauseAndWaitStopped: (name: string, signal?: AbortSignal) => Promise<void>;
  resumeAndWaitReady: (name: string, signal?: AbortSignal) => Promise<void>;
  exec: (
    name: string,
    options: { command: string[]; timeoutSeconds?: number; signal?: AbortSignal }
  ) => Promise<SealosExecResult>;
  downloadFileStream: (
    name: string,
    options: { path: string; timeoutSeconds?: number; signal?: AbortSignal }
  ) => Promise<Readable>;
  deleteDevbox: (name: string, signal?: AbortSignal) => Promise<boolean>;
};

class SealosRequestError extends Error {
  constructor(
    message: string,
    readonly transient = false
  ) {
    super(message);
    this.name = 'SealosRequestError';
  }
}

/**
 * 判断运行环境中是否已配置存量 Sealos Devbox 迁移所需凭证（仅在触发实际 Devbox 通信时强依赖）。
 */
export const hasSealosMigrationEnv = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env.AGENT_SANDBOX_SEALOS_BASEURL?.trim() && env.AGENT_SANDBOX_SEALOS_TOKEN?.trim());

/**
 * 获取 Sealos Devbox 容器内工作目录路径，与运行时默认工作区 `/home/devbox/workspace` 对齐。
 */
export const getSealosWorkDirectory = (env: NodeJS.ProcessEnv = process.env): string => {
  const configured = env.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY?.trim();
  return (configured ? configured.replace(/\/+$/, '') : '') || '/home/devbox/workspace';
};

/**
 * 构造仅用于 4.18.0 升级迁移的轻量 Sealos Devbox REST 客户端。
 *
 * 所有异常和日志消息均脱敏处理，不输出 Bearer Token 或完整凭据 URL，并支持外部 `AbortSignal` 立即中断轮询。
 */
export const createSealosMigrationClient = (
  env: NodeJS.ProcessEnv = process.env
): SealosMigrationClient => {
  const baseUrl = env.AGENT_SANDBOX_SEALOS_BASEURL?.trim().replace(/\/+$/, '');
  const token = env.AGENT_SANDBOX_SEALOS_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new Error('Missing AGENT_SANDBOX_SEALOS_BASEURL or AGENT_SANDBOX_SEALOS_TOKEN');
  }

  const devboxPath = (name: string, suffix = '') =>
    `/api/v1/devbox/${encodeURIComponent(name)}${suffix}`;

  const buildRequestSignal = (timeoutMs: number, signal?: AbortSignal): AbortSignal => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  };

  const isTransientHttpStatus = (status: number) =>
    status === 429 || status === 502 || status === 503 || status === 504;

  const isTransientErrorMessage = (text: string) => {
    const normalized = text.toLowerCase();
    return (
      normalized.includes('no healthy upstream') ||
      normalized.includes('pod is not running') ||
      normalized.includes('container not found') ||
      normalized.includes('exec command timeout') ||
      normalized.includes('upstream connect error') ||
      normalized.includes('connection reset')
    );
  };

  const pollUntil = async ({
    label,
    timeoutMs,
    signal,
    initialDelayMs = 0,
    step
  }: {
    label: string;
    timeoutMs: number;
    signal?: AbortSignal;
    initialDelayMs?: number;
    step: () => Promise<string | null>;
  }): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    let lastReason = `${label} timed out`;
    if (initialDelayMs > 0) {
      await delayWithSignal(initialDelayMs, signal);
    }
    while (true) {
      throwIfAborted(signal);
      const reason = await step();
      if (reason === null) return;
      if (reason) lastReason = reason;
      if (Date.now() >= deadline) {
        throw new Error(`${label} within ${timeoutMs}ms (${lastReason})`);
      }
      await delayWithSignal(POLL_INTERVAL_MS, signal);
    }
  };

  const buildUrl = (path: string, query?: Record<string, string>) => {
    const url = new URL(path, `${baseUrl}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  };

  const requestEnvelope = async <T>(
    path: string,
    options: {
      method: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
      timeoutMs?: number;
      signal?: AbortSignal;
      retryTransientMs?: number;
    }
  ): Promise<{ notFound: true } | { notFound: false; data: T }> => {
    const deadline = Date.now() + (options.retryTransientMs ?? 0);

    while (true) {
      options.signal?.throwIfAborted();
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`
        };
        if (options.body !== undefined) {
          headers['Content-Type'] = 'application/json';
        }

        const res = await fetch(buildUrl(path), {
          method: options.method,
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: buildRequestSignal(options.timeoutMs ?? REQUEST_TIMEOUT_MS, options.signal)
        });

        const rawBody = await res.text();
        let parsed: { code?: number; message?: string; data?: T } | null = null;
        try {
          parsed = rawBody
            ? (JSON.parse(rawBody) as { code?: number; message?: string; data?: T })
            : {};
        } catch {
          throw new SealosRequestError(
            `Sealos API returned non-JSON response (HTTP ${res.status})`,
            isTransientHttpStatus(res.status) || isTransientErrorMessage(rawBody)
          );
        }

        const effectiveCode = typeof parsed?.code === 'number' ? parsed.code : res.status;
        const apiMessage =
          typeof parsed?.message === 'string' ? parsed.message : res.statusText || '';

        if ((res.status === 404 || parsed?.code === 404) && !isTransientErrorMessage(apiMessage)) {
          return { notFound: true };
        }

        const isSuccess =
          res.ok && (effectiveCode === 0 || (effectiveCode >= 200 && effectiveCode < 300));
        if (!isSuccess) {
          throw new SealosRequestError(
            `Sealos API error (HTTP ${res.status}, code ${effectiveCode}): ${apiMessage || 'unknown error'}`,
            isTransientHttpStatus(res.status) ||
              isTransientHttpStatus(effectiveCode) ||
              isTransientErrorMessage(apiMessage) ||
              isTransientErrorMessage(rawBody)
          );
        }

        return { notFound: false, data: parsed?.data as T };
      } catch (error) {
        throwIfAborted(options.signal);
        const isTransient =
          error instanceof SealosRequestError
            ? error.transient
            : (error instanceof DOMException && error.name === 'TimeoutError') ||
              (error instanceof TypeError &&
                Boolean((error as TypeError & { cause?: unknown }).cause)) ||
              isTransientErrorMessage(error instanceof Error ? error.message : String(error));
        if (!isTransient || Date.now() >= deadline) {
          if (error instanceof SealosRequestError) throw error;
          throw new SealosRequestError(
            `Sealos Devbox request failed: ${error instanceof Error ? error.message : String(error)}`,
            isTransient
          );
        }
        await delayWithSignal(POLL_INTERVAL_MS, options.signal);
      }
    }
  };

  const getDevbox = async (
    name: string,
    signal?: AbortSignal
  ): Promise<SealosDevboxInfo | null> => {
    const res = await requestEnvelope<SealosDevboxInfo>(devboxPath(name), {
      method: 'GET',
      signal,
      retryTransientMs: GET_INFO_RETRY_TIMEOUT_MS
    });
    if (res.notFound) return null;
    if (!res.data || typeof res.data.state?.phase !== 'string') {
      throw new Error(`Invalid Sealos Devbox payload for ${name}`);
    }
    return res.data;
  };

  const pauseAndWaitStopped = async (name: string, signal?: AbortSignal): Promise<void> => {
    const initial = await getDevbox(name, signal);
    if (!initial || STOPPED_PHASES.has(initial.state.phase)) {
      return;
    }

    if (!STOPPING_PHASES.has(initial.state.phase)) {
      const pauseRes = await requestEnvelope(devboxPath(name, '/pause'), {
        method: 'POST',
        signal,
        retryTransientMs: GET_INFO_RETRY_TIMEOUT_MS
      });
      if (pauseRes.notFound) return;
    }

    await pollUntil({
      label: `Sealos Devbox ${name} did not pause`,
      timeoutMs: LIFECYCLE_TIMEOUT_MS,
      signal,
      initialDelayMs: POLL_INTERVAL_MS,
      step: async () => {
        const current = await getDevbox(name, signal);
        if (!current || STOPPED_PHASES.has(current.state.phase)) return null;
        if (current.state.phase === 'Error') {
          throw new Error(`Sealos Devbox ${name} entered Error phase while pausing`);
        }
        return `last phase: ${current.state.phase}`;
      }
    });
  };

  const exec = async (
    name: string,
    options: { command: string[]; timeoutSeconds?: number; signal?: AbortSignal }
  ): Promise<SealosExecResult> => {
    const timeoutSeconds = options.timeoutSeconds ?? 300;
    const res = await requestEnvelope<SealosExecResult>(devboxPath(name, '/exec'), {
      method: 'POST',
      body: { command: options.command, timeoutSeconds },
      timeoutMs: Math.max(REQUEST_TIMEOUT_MS, (timeoutSeconds + 15) * 1000),
      signal: options.signal
    });
    if (res.notFound) {
      throw new Error(`Sealos Devbox ${name} not found during exec`);
    }
    return {
      exitCode: Number(res.data?.exitCode ?? -1),
      stdout: typeof res.data?.stdout === 'string' ? res.data.stdout : '',
      stderr: typeof res.data?.stderr === 'string' ? res.data.stderr : ''
    };
  };

  const resumeAndWaitReady = async (name: string, signal?: AbortSignal): Promise<void> => {
    let current = await getDevbox(name, signal);
    if (!current) {
      throw new Error(`Sealos Devbox ${name} not found`);
    }
    if (current.deletionTimestamp) {
      throw new Error(`Sealos Devbox ${name} is being deleted`);
    }

    // 若正处于暂停/停止过渡态，先等待进入稳定停止态，再执行唤醒。
    if (STOPPING_PHASES.has(current.state.phase)) {
      await pauseAndWaitStopped(name, signal);
      current = await getDevbox(name, signal);
      if (!current) {
        throw new Error(`Sealos Devbox ${name} disappeared before resume`);
      }
    }

    if (current.state.phase !== 'Running') {
      if (STOPPED_PHASES.has(current.state.phase)) {
        const resumeRes = await requestEnvelope(devboxPath(name, '/resume'), {
          method: 'POST',
          signal,
          retryTransientMs: GET_INFO_RETRY_TIMEOUT_MS
        });
        if (resumeRes.notFound) {
          throw new Error(`Sealos Devbox ${name} not found during resume`);
        }
      }

      await pollUntil({
        label: `Sealos Devbox ${name} did not reach Running phase`,
        timeoutMs: LIFECYCLE_TIMEOUT_MS,
        signal,
        step: async () => {
          const probed = await getDevbox(name, signal);
          if (!probed) {
            throw new Error(`Sealos Devbox ${name} disappeared while resuming`);
          }
          if (probed.state.phase === 'Running') return null;
          if (probed.state.phase === 'Error') {
            throw new Error(`Sealos Devbox ${name} entered Error phase while resuming`);
          }
          return `last phase: ${probed.state.phase}`;
        }
      });
    }

    // Devbox 控制器报告 Running 后 Pod exec 通道可能仍需数秒才真正就绪。
    await pollUntil({
      label: `Sealos Devbox ${name} command channel not ready`,
      timeoutMs: COMMAND_READY_TIMEOUT_MS,
      signal,
      step: async () => {
        try {
          const result = await exec(name, {
            command: ['true'],
            timeoutSeconds: COMMAND_PROBE_TIMEOUT_SECONDS,
            signal
          });
          if (result.exitCode === 0) return null;
          const reason = result.stderr || result.stdout || `exit code ${result.exitCode}`;
          if (!isTransientErrorMessage(reason)) {
            throw new Error(`Sealos Devbox ${name} command readiness failed: ${reason}`);
          }
          return reason;
        } catch (error) {
          throwIfAborted(signal);
          const message = error instanceof Error ? error.message : String(error);
          const transient =
            (error instanceof SealosRequestError && error.transient) ||
            isTransientErrorMessage(message);
          if (!transient) throw error;
          return message;
        }
      }
    });
  };

  const downloadFileStream = async (
    name: string,
    options: { path: string; timeoutSeconds?: number; signal?: AbortSignal }
  ): Promise<Readable> => {
    const timeoutSeconds = options.timeoutSeconds ?? 600;
    const url = buildUrl(devboxPath(name, '/files/download'), {
      path: options.path,
      timeoutSeconds: String(timeoutSeconds)
    });
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: buildRequestSignal((timeoutSeconds + 30) * 1000, options.signal)
    });
    if (!res.ok || !res.body) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(
        `Sealos Devbox file download failed (HTTP ${res.status}): ${bodyText.slice(0, 200)}`
      );
    }
    return Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
  };

  const deleteDevbox = async (name: string, signal?: AbortSignal): Promise<boolean> => {
    const existing = await getDevbox(name, signal);
    if (!existing) {
      return false;
    }

    const res = await requestEnvelope(devboxPath(name), {
      method: 'DELETE',
      signal,
      retryTransientMs: GET_INFO_RETRY_TIMEOUT_MS
    });
    if (res.notFound) {
      return true;
    }

    await pollUntil({
      label: `Sealos Devbox ${name} was not deleted`,
      timeoutMs: LIFECYCLE_TIMEOUT_MS,
      signal,
      step: async () => {
        const probed = await getDevbox(name, signal);
        return probed ? `last phase: ${probed.state.phase}` : null;
      }
    });
    return true;
  };

  return {
    getDevbox,
    pauseAndWaitStopped,
    resumeAndWaitReady,
    exec,
    downloadFileStream,
    deleteDevbox
  };
};
