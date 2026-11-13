import { readFileSync } from 'node:fs';
import { getLogger } from '@fastgpt-sdk/otel/logger';
import { Agent } from 'undici';
import { z } from 'zod';
import { LogCategories } from './logger';

const logger = getLogger(LogCategories.MODULE.VOLUME_MANAGER.DRIVER);

const K8S_API = 'https://kubernetes.default.svc';
const TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const TOKEN_CACHE_TTL_MS = 30_000;

export const DEFAULT_PVC_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_PVC_POLL_INTERVAL_MS = 500;

export const FASTGPT_PVC_LABELS = {
  app: 'fastgpt',
  'managed-by': 'fastgpt-volume-manager'
} as const;

export const DEPLOYMENT_LABEL = 'fastgpt.deployment';

const K8sPvcSchema = z.object({
  metadata: z.object({
    name: z.string().min(1).optional(),
    uid: z.string().min(1),
    labels: z.record(z.string(), z.string()).optional(),
    deletionTimestamp: z.string().nullable().optional()
  })
});

export const K8sPvcListSchema = z.object({
  items: z.array(
    z.object({
      metadata: z.object({
        name: z.string().min(1),
        labels: z.record(z.string(), z.string()).optional(),
        deletionTimestamp: z.string().nullable().optional()
      })
    })
  )
});

export type K8sPvcState =
  | { state: 'absent' }
  | { state: 'active' | 'deleting'; uid: string; labels?: Record<string, string> };

export type K8sPvcClientOptions = {
  namespace: string;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
};

/**
 * Kubernetes Namespace 级 PersistentVolumeClaim API 轻量客户端，
 * 供 `K8sVolumeDriver` 与 `LegacyK8sVolumeCleaner` 共享 TLS CA 懒加载、UID generation 轮询与 UID precondition 安全删除。
 */
export class K8sPvcClient {
  readonly namespace: string;
  readonly waitTimeoutMs: number;
  readonly pollIntervalMs: number;
  private dispatcher?: Agent;
  private cachedToken?: { value: string; expiresAt: number };

  constructor(options: K8sPvcClientOptions) {
    this.namespace = options.namespace.trim();
    this.waitTimeoutMs = options.waitTimeoutMs ?? DEFAULT_PVC_WAIT_TIMEOUT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_PVC_POLL_INTERVAL_MS;

    if (this.namespace.length === 0) {
      throw new Error('VM_K8S_NAMESPACE is required in kubernetes runtime');
    }
    if (this.waitTimeoutMs <= 0 || this.pollIntervalMs <= 0) {
      throw new Error('K8s PVC wait timeout and poll interval must be positive');
    }
  }

  fetch(url: string, extra: RequestInit = {}): Promise<Response> {
    // Kubernetes in-cluster CA 与 ServiceAccount Token 按实例懒加载/短缓存，避免轮询期高频同步读取文件。
    this.dispatcher ??= new Agent({ connect: { ca: readFileSync(CA_PATH, 'utf-8') } });
    const now = Date.now();
    if (!this.cachedToken || this.cachedToken.expiresAt <= now) {
      this.cachedToken = {
        value: readFileSync(TOKEN_PATH, 'utf-8').trim(),
        expiresAt: now + TOKEN_CACHE_TTL_MS
      };
    }
    const headers = new Headers(extra.headers);
    if (!headers.has('Authorization'))
      headers.set('Authorization', `Bearer ${this.cachedToken.value}`);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    return fetch(url, {
      ...extra,
      headers,
      dispatcher: this.dispatcher
    } as RequestInit & { dispatcher: Agent });
  }

  pvcUrl(name?: string): string {
    const base = `${K8S_API}/api/v1/namespaces/${this.namespace}/persistentvolumeclaims`;
    return name ? `${base}/${name}` : base;
  }

  /** 读取 PVC 的 generation 和删除状态，避免把 Terminating 对象当成可挂载资源。 */
  async readPvc(name: string): Promise<K8sPvcState> {
    const res = await this.fetch(this.pvcUrl(name));
    if (res.status === 404) return { state: 'absent' };
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`K8s PVC GET failed (${res.status}): ${text}`);
    }

    const parsed = K8sPvcSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new Error(`K8s PVC GET returned invalid metadata for ${this.namespace}/${name}`);
    }
    const { uid, deletionTimestamp, labels } = parsed.data.metadata;
    return { state: deletionTimestamp ? 'deleting' : 'active', uid, labels };
  }

  async waitForPoll(deadline: number, timeoutMessage: string): Promise<void> {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(timeoutMessage);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(this.pollIntervalMs, remainingMs)));
  }

  /**
   * 等待目标 PVC generation 结束；同名对象 UID 变化表示旧 generation 已完成删除，立即停止等待。
   */
  async waitForPvcGenerationEnd(params: {
    name: string;
    uid: string;
    deadline: number;
  }): Promise<void> {
    while (true) {
      const current = await this.readPvc(params.name);
      if (current.state === 'absent' || current.uid !== params.uid) return;

      await this.waitForPoll(
        params.deadline,
        `Timed out waiting for K8s PVC ${this.namespace}/${params.name} uid=${params.uid} to be deleted`
      );
    }
  }

  /**
   * 对已知 `current` 状态的 PVC 执行带 `preconditions.uid` 的幂等删除，并等待该 generation 彻底消失。
   */
  async deletePvcGeneration(params: {
    name: string;
    current: Exclude<K8sPvcState, { state: 'absent' }>;
  }): Promise<void> {
    const { name, current } = params;
    const targetUid = current.uid;
    const deadline = Date.now() + this.waitTimeoutMs;

    if (current.state === 'deleting') {
      await this.waitForPvcGenerationEnd({ name, uid: targetUid, deadline });
      return;
    }

    logger.debug(`K8s DELETE PVC namespace=${this.namespace} name=${name} uid=${targetUid}`);
    const res = await this.fetch(this.pvcUrl(name), {
      method: 'DELETE',
      body: JSON.stringify({
        apiVersion: 'v1',
        kind: 'DeleteOptions',
        preconditions: { uid: targetUid }
      })
    });

    if (res.status === 404) return;
    if (res.status === 409) {
      const latest = await this.readPvc(name);
      if (latest.state === 'absent' || latest.uid !== targetUid) {
        await res.body?.cancel().catch(() => {});
        return;
      }
      if (latest.state === 'deleting') {
        await res.body?.cancel().catch(() => {});
        await this.waitForPvcGenerationEnd({ name, uid: targetUid, deadline });
        return;
      }
      const text = await res.text().catch(() => '');
      throw new Error(`K8s PVC delete failed (${res.status}): ${text}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`K8s PVC delete failed (${res.status}): ${text}`);
    }

    await this.waitForPvcGenerationEnd({ name, uid: targetUid, deadline });
  }
}
