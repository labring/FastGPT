import { readFileSync } from 'fs';
import { Agent } from 'undici';
import { z } from 'zod';
import {
  SandboxVolumeNameSchema,
  type SandboxVolumeEnsureRequest,
  type SandboxVolumeEnsureResponse
} from '@fastgpt/global/core/ai/sandbox/volume';
import type { IVolumeDriver } from './IVolumeDriver';
import { env } from '../env';
import { logDebug } from '../utils/logger';

const K8S_API = 'https://kubernetes.default.svc';
const TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const DEFAULT_PVC_STORAGE_SIZE = '1Gi';
const DEFAULT_PVC_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_PVC_POLL_INTERVAL_MS = 500;

const K8sPvcSchema = z.object({
  metadata: z.object({
    uid: z.string().min(1),
    deletionTimestamp: z.string().nullable().optional()
  })
});

type K8sPvcState =
  | { state: 'absent' }
  | { state: 'active'; uid: string }
  | { state: 'deleting'; uid: string };

export type K8sVolumeDriverOptions = {
  namespace?: string;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
};

function readToken(): string {
  return readFileSync(TOKEN_PATH, 'utf-8').trim();
}

function pvcBody(params: { name: string; storageSize: string; namespace: string }): object {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: params.name,
      namespace: params.namespace
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: params.storageSize } },
      storageClassName: env.VM_K8S_PVC_STORAGE_CLASS
    }
  };
}

export class K8sVolumeDriver implements IVolumeDriver {
  private readonly namespace: string;
  private readonly waitTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private dispatcher?: Agent;

  constructor(options: K8sVolumeDriverOptions = {}) {
    this.namespace = options.namespace ?? env.VM_K8S_NAMESPACE;
    this.waitTimeoutMs = options.waitTimeoutMs ?? DEFAULT_PVC_WAIT_TIMEOUT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_PVC_POLL_INTERVAL_MS;

    if (this.waitTimeoutMs <= 0 || this.pollIntervalMs <= 0) {
      throw new Error('K8s PVC wait timeout and poll interval must be positive');
    }
  }

  private fetchOpts(extra: RequestInit = {}): RequestInit & { dispatcher: Agent } {
    // Kubernetes in-cluster CA 是服务账号挂载文件，按实例懒加载，避免模块初始化依赖运行环境。
    this.dispatcher ??= new Agent({ connect: { ca: readFileSync(CA_PATH, 'utf-8') } });
    return { ...extra, dispatcher: this.dispatcher } as RequestInit & { dispatcher: Agent };
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${readToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  private pvcUrl(name?: string): string {
    const base = `${K8S_API}/api/v1/namespaces/${this.namespace}/persistentvolumeclaims`;
    return name ? `${base}/${name}` : base;
  }

  /** 读取 PVC 的 generation 和删除状态，避免把 Terminating 对象当成可挂载资源。 */
  private async readPvc(name: string): Promise<K8sPvcState> {
    const url = this.pvcUrl(name);
    logDebug(`K8s GET PVC url=${url}`);
    const res = await fetch(url, this.fetchOpts({ headers: this.headers() }));
    logDebug(`K8s GET PVC status=${res.status}`);

    if (res.status === 404) return { state: 'absent' };
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`K8s PVC GET failed (${res.status}): ${text}`);
    }

    const body: unknown = await res.json();
    const parsed = K8sPvcSchema.safeParse(body);
    if (!parsed.success) {
      throw new Error(`K8s PVC GET returned invalid metadata for ${this.namespace}/${name}`);
    }
    const { uid, deletionTimestamp } = parsed.data.metadata;
    return deletionTimestamp ? { state: 'deleting', uid } : { state: 'active', uid };
  }

  /**
   * 等待目标 PVC generation 结束。
   *
   * 同名对象 UID 变化表示旧 generation 已完成删除；此时必须停止等待，不能继续操作新 PVC。
   */
  private async waitForPvcGenerationEnd(params: {
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

  private async waitForPoll(deadline: number, timeoutMessage: string): Promise<void> {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(timeoutMessage);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(this.pollIntervalMs, remainingMs)));
  }

  async ensure(params: SandboxVolumeEnsureRequest): Promise<SandboxVolumeEnsureResponse> {
    const name = SandboxVolumeNameSchema.parse(params.claimName);
    const storageSize = params.storageSize ?? DEFAULT_PVC_STORAGE_SIZE;
    const deadline = Date.now() + this.waitTimeoutMs;

    while (true) {
      const current = await this.readPvc(name);
      if (current.state === 'active') {
        return { claimName: name, created: false };
      }
      if (current.state === 'deleting') {
        await this.waitForPvcGenerationEnd({ name, uid: current.uid, deadline });
        continue;
      }

      const postUrl = this.pvcUrl();
      logDebug(`K8s POST PVC url=${postUrl} name=${name}`);
      const createRes = await fetch(
        postUrl,
        this.fetchOpts({
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(
            pvcBody({
              name,
              storageSize,
              namespace: this.namespace
            })
          )
        })
      );
      logDebug(`K8s POST PVC status=${createRes.status}`);

      if (createRes.ok) {
        return { claimName: name, created: true };
      }
      if (createRes.status === 409) {
        await this.waitForPoll(deadline, `Timed out ensuring K8s PVC ${this.namespace}/${name}`);
        continue;
      }

      const text = await createRes.text().catch(() => '');
      throw new Error(`K8s PVC create failed (${createRes.status}): ${text}`);
    }
  }

  async remove(claimName: string): Promise<void> {
    const name = SandboxVolumeNameSchema.parse(claimName);
    const current = await this.readPvc(name);
    if (current.state === 'absent') return;

    const targetUid = current.uid;
    const deadline = Date.now() + this.waitTimeoutMs;
    if (current.state === 'deleting') {
      await this.waitForPvcGenerationEnd({ name, uid: targetUid, deadline });
      return;
    }

    const delUrl = this.pvcUrl(name);

    logDebug(`K8s DELETE PVC url=${delUrl}`);
    const res = await fetch(
      delUrl,
      this.fetchOpts({
        method: 'DELETE',
        headers: this.headers(),
        body: JSON.stringify({
          apiVersion: 'v1',
          kind: 'DeleteOptions',
          preconditions: { uid: targetUid }
        })
      })
    );
    logDebug(`K8s DELETE PVC status=${res.status}`);

    if (res.status === 404) return;
    if (res.status === 409) {
      const latest = await this.readPvc(name);
      if (latest.state === 'absent' || latest.uid !== targetUid) return;
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
