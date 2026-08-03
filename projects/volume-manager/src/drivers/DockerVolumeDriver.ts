import { Agent } from 'undici';
import type { EnsureResult, EnsureVolumeParams, IVolumeDriver } from './IVolumeDriver';
import { validateVolumeName } from '../utils/naming';
import { env } from '../env';
import { logDebug } from '../utils/logger';

export class DockerVolumeDriver implements IVolumeDriver {
  private readonly socketPath: string;
  private readonly dispatcher: Agent;

  constructor(socketPath = env.VM_DOCKER_SOCKET) {
    this.socketPath = socketPath;
    this.dispatcher = new Agent({ connect: { socketPath } });
  }

  private dockerFetch(path: string, init?: RequestInit): Promise<Response> {
    // Node fetch 通过 Undici dispatcher 访问 Docker Unix socket。
    return fetch(`http://localhost/${env.VM_DOCKER_API_VERSION}${path}`, {
      ...init,
      dispatcher: this.dispatcher
    } as RequestInit & { dispatcher: Agent });
  }

  async ensure(params: EnsureVolumeParams): Promise<EnsureResult> {
    const name = validateVolumeName(params.claimName);

    // Check if volume already exists
    logDebug(`Docker inspect volume name=${name}`);
    const inspectRes = await this.dockerFetch(`/volumes/${name}`);
    logDebug(`Docker inspect volume status=${inspectRes.status}`);

    if (inspectRes.ok) {
      return { claimName: name, created: false };
    }

    if (inspectRes.status !== 404) {
      const text = await inspectRes.text().catch(() => '');
      throw new Error(`Docker volume inspect failed (${inspectRes.status}): ${text}`);
    }

    // Create volume
    logDebug(`Docker create volume name=${name}`);
    const createRes = await this.dockerFetch('/volumes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Name: name })
    });
    logDebug(`Docker create volume status=${createRes.status}`);

    if (!createRes.ok) {
      const text = await createRes.text().catch(() => '');
      throw new Error(`Docker volume create failed (${createRes.status}): ${text}`);
    }

    return { claimName: name, created: true };
  }

  async remove(claimName: string): Promise<void> {
    const name = validateVolumeName(claimName);
    logDebug(`Docker remove volume name=${name}`);
    const res = await this.dockerFetch(`/volumes/${name}`, { method: 'DELETE' });
    logDebug(`Docker remove volume status=${res.status}`);

    // 404 is idempotent success
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`Docker volume delete failed (${res.status}): ${text}`);
    }
  }
}
