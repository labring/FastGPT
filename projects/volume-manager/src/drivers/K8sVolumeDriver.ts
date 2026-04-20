import { readFileSync } from 'fs';
import type { IVolumeDriver, EnsureResult } from './IVolumeDriver';
import { toVolumeName } from '../utils/naming';
import { env } from '../env';
import { logDebug } from '../utils/logger';

const K8S_API = 'https://kubernetes.default.svc';
const TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

function readToken(): string {
  return readFileSync(TOKEN_PATH, 'utf-8').trim();
}

function fetchOpts(extra: RequestInit = {}): RequestInit {
  return { ...extra, tls: { ca: readFileSync(CA_PATH, 'utf-8') } } as RequestInit;
}

function pvcBody(name: string, sessionId: string): object {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name,
      namespace: env.VM_K8S_NAMESPACE,
      labels: { 'fastgpt/session-id': sessionId }
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: env.VM_K8S_PVC_STORAGE_SIZE } },
      storageClassName: env.VM_K8S_PVC_STORAGE_CLASS
    }
  };
}

export class K8sVolumeDriver implements IVolumeDriver {
  private readonly namespace: string;
  private readonly prefix: string;

  constructor(namespace = env.VM_K8S_NAMESPACE, prefix = env.VM_VOLUME_NAME_PREFIX) {
    this.namespace = namespace;
    this.prefix = prefix;
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

  async ensure(sessionId: string): Promise<EnsureResult> {
    const name = toVolumeName(this.prefix, sessionId);
    const getUrl = this.pvcUrl(name);

    logDebug(`K8s GET PVC url=${getUrl}`);
    const getRes = await fetch(getUrl, fetchOpts({ headers: this.headers() }));
    logDebug(`K8s GET PVC status=${getRes.status}`);

    if (getRes.ok) {
      return { claimName: name, created: false };
    }

    if (getRes.status !== 404) {
      const text = await getRes.text().catch(() => '');
      throw new Error(`K8s PVC GET failed (${getRes.status}): ${text}`);
    }

    const postUrl = this.pvcUrl();
    logDebug(`K8s POST PVC url=${postUrl} name=${name}`);
    const createRes = await fetch(
      postUrl,
      fetchOpts({
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(pvcBody(name, sessionId))
      })
    );
    logDebug(`K8s POST PVC status=${createRes.status}`);

    if (!createRes.ok) {
      const text = await createRes.text().catch(() => '');
      throw new Error(`K8s PVC create failed (${createRes.status}): ${text}`);
    }

    return { claimName: name, created: true };
  }

  async remove(sessionId: string): Promise<void> {
    const name = toVolumeName(this.prefix, sessionId);
    const delUrl = this.pvcUrl(name);

    logDebug(`K8s DELETE PVC url=${delUrl}`);
    const res = await fetch(
      delUrl,
      fetchOpts({
        method: 'DELETE',
        headers: this.headers()
      })
    );
    logDebug(`K8s DELETE PVC status=${res.status}`);

    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`K8s PVC delete failed (${res.status}): ${text}`);
    }
  }
}
