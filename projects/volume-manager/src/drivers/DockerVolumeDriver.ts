import { Agent } from 'undici';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  SandboxVolumeNameSchema,
  type SandboxVolumeEnsureRequest,
  type SandboxVolumeEnsureResponse
} from '@fastgpt/global/core/ai/sandbox/volume';
import type { IVolumeDriver } from './IVolumeDriver';
import { env } from '../env';
import { logDebug } from '../utils/logger';
import { FASTGPT_VOLUME_LABELS, canAdoptLegacyLabels, isManagedLabels } from '../utils/ownership';

const DockerVolumeInspectSchema = z.object({
  Name: z.string().optional(),
  Labels: z.record(z.string(), z.string()).nullable().optional()
});

const DockerVolumeListSchema = z.object({
  Volumes: z.array(DockerVolumeInspectSchema).nullable().optional()
});

export class DockerVolumeDriver implements IVolumeDriver {
  private readonly dispatcher: Agent;

  constructor(socketPath = env.VM_DOCKER_SOCKET) {
    this.dispatcher = new Agent({ connect: { socketPath } });
  }

  private dockerFetch(path: string, init: RequestInit = {}): Promise<Response> {
    // Node fetch 通过 Undici dispatcher 访问 Docker Unix socket，并附带有限请求超时。
    return fetch(`http://localhost/${env.VM_DOCKER_API_VERSION}${path}`, {
      ...init,
      signal: AbortSignal.timeout(30_000),
      dispatcher: this.dispatcher
    } as RequestInit & { dispatcher: Agent });
  }

  private async assertVolumeOwnership({
    inspectRes,
    name,
    action,
    allowLegacyUnlabeled
  }: {
    inspectRes: Response;
    name: string;
    action: 'adopt' | 'delete';
    allowLegacyUnlabeled?: boolean;
  }): Promise<void> {
    const rawBody: unknown = await inspectRes.json();
    const parsed = DockerVolumeInspectSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new Error(`Docker volume inspect returned invalid response payload for ${name}`);
    }
    const hasManaged = isManagedLabels(parsed.data.Labels);
    // [4.18.0 legacy compat, remove in >= 4.19.0]
    // Docker Engine API 不支持修改已存在 named volume 的 Labels；来自 Mongo 可信记录的旧无标签卷允许原地复用/清理。
    const canAdoptLegacy =
      Boolean(allowLegacyUnlabeled) && canAdoptLegacyLabels(parsed.data.Labels);
    if (!hasManaged && !canAdoptLegacy) {
      throw new HTTPException(403, {
        message: `Refusing to ${action} Docker volume ${name}: missing fastgpt-volume-manager ownership labels`
      });
    }
  }

  /** 检查 Docker volume 是否存在并验证归属标签，不存在时返回 false。 */
  private async inspectOwnedVolume(params: {
    claimName: string;
    action: 'adopt' | 'delete';
    allowLegacyUnlabeled?: boolean;
  }): Promise<boolean> {
    const { claimName, action, allowLegacyUnlabeled } = params;
    logDebug(`Docker inspect volume name=${claimName} action=${action}`);
    const inspectRes = await this.dockerFetch(`/volumes/${claimName}`);
    logDebug(`Docker inspect volume status=${inspectRes.status}`);

    if (inspectRes.status === 404) {
      await inspectRes.body?.cancel().catch(() => undefined);
      return false;
    }
    if (!inspectRes.ok) {
      const text = await inspectRes.text().catch(() => '');
      throw new Error(`Docker volume inspect failed (${inspectRes.status}): ${text}`);
    }

    await this.assertVolumeOwnership({
      inspectRes,
      name: claimName,
      action,
      allowLegacyUnlabeled
    });
    return true;
  }

  /** 只读核验持久卷是否存在且归属当前 volume-manager（绝不触发新建卷）。 */
  async exists(claimName: string, options?: { allowLegacyUnlabeled?: boolean }): Promise<boolean> {
    return this.inspectOwnedVolume({
      claimName,
      action: 'adopt',
      allowLegacyUnlabeled: options?.allowLegacyUnlabeled
    });
  }

  async ensure(params: SandboxVolumeEnsureRequest): Promise<SandboxVolumeEnsureResponse> {
    const name = params.claimName;

    if (await this.exists(name, { allowLegacyUnlabeled: params.allowLegacyUnlabeled })) {
      return { claimName: name, created: false };
    }

    logDebug(`Docker create volume name=${name}`);
    const createRes = await this.dockerFetch('/volumes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Name: name,
        Labels: { ...FASTGPT_VOLUME_LABELS }
      })
    });
    logDebug(`Docker create volume status=${createRes.status}`);

    if (!createRes.ok) {
      const text = await createRes.text().catch(() => '');
      throw new Error(`Docker volume create failed (${createRes.status}): ${text}`);
    }

    await createRes.body?.cancel().catch(() => undefined);
    return { claimName: name, created: true };
  }

  async remove(claimName: string, options?: { allowLegacyUnlabeled?: boolean }): Promise<void> {
    const found = await this.inspectOwnedVolume({
      claimName,
      action: 'delete',
      allowLegacyUnlabeled: options?.allowLegacyUnlabeled
    });
    if (!found) return;

    logDebug(`Docker remove volume name=${claimName}`);
    const res = await this.dockerFetch(`/volumes/${claimName}`, { method: 'DELETE' });
    logDebug(`Docker remove volume status=${res.status}`);

    // 404 视为幂等成功
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`Docker volume delete failed (${res.status}): ${text}`);
    }
    await res.body?.cancel().catch(() => undefined);
  }

  /** 列出由 fastgpt-volume-manager 管理的 Docker named volume 名称。 */
  async list(): Promise<string[]> {
    const filters = encodeURIComponent(
      JSON.stringify({
        label: [
          `app=${FASTGPT_VOLUME_LABELS.app}`,
          `managed-by=${FASTGPT_VOLUME_LABELS['managed-by']}`
        ]
      })
    );
    logDebug('Docker list volumes');
    const res = await this.dockerFetch(`/volumes?filters=${filters}`);
    logDebug(`Docker list volumes status=${res.status}`);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Docker volume list failed (${res.status}): ${text}`);
    }

    const rawBody: unknown = await res.json();
    const parsed = DockerVolumeListSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new Error('Docker volume list returned invalid response payload');
    }

    return (parsed.data.Volumes ?? []).flatMap((volume) => {
      if (!volume.Name || !SandboxVolumeNameSchema.safeParse(volume.Name).success) {
        return [];
      }
      return [volume.Name];
    });
  }
}
