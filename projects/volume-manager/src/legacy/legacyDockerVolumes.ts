/**
 * 隔离式 Docker 旧版无标签 local 命名卷查询与清理器（legacy 专用模块）。
 *
 * 仅允许读取/删除命中旧卷前缀且无任何新版 JuiceFS bind 特征与标签的普通 local 命名卷；
 * 凡带有 `app=fastgpt`、`fastgpt.deployment`、`fastgpt.sandbox.claim` 或挂载自 JuiceFS 目录的卷一律抛 409 拒绝。
 */
import { VolumeOwnershipError } from '../drivers/IVolumeDriver';
import {
  assertDockerVolumeUnreferenced,
  createDockerSocketClient,
  DEFAULT_DOCKER_JUICEFS_MOUNT_ROOT,
  deleteDockerVolume,
  FASTGPT_DOCKER_CLAIM_LABEL,
  FASTGPT_DOCKER_DEPLOYMENT_LABEL,
  inspectDockerVolume,
  type DockerVolumeInspect
} from '../utils/dockerApi';
import {
  assertLegacyVolumePrefixAllowed,
  getLegacyAllowedVolumePrefixes,
  type ILegacyVolumeCleaner
} from './env';

export type LegacyDockerVolumeCleanerOptions = {
  mountRoot?: string;
  allowedPrefixes?: string[];
};

export class LegacyDockerVolumeCleaner implements ILegacyVolumeCleaner {
  private readonly dockerClient = createDockerSocketClient();
  private readonly mountRoot: string;
  private readonly allowedPrefixes?: string[];

  constructor(options: LegacyDockerVolumeCleanerOptions = {}) {
    this.mountRoot = (options.mountRoot ?? DEFAULT_DOCKER_JUICEFS_MOUNT_ROOT).replace(/\/+$/, '');
    this.allowedPrefixes = options.allowedPrefixes;
  }

  private isUnderJuicefsMountRoot(targetPath?: string): boolean {
    if (!targetPath) return false;
    return targetPath === this.mountRoot || targetPath.startsWith(`${this.mountRoot}/`);
  }

  private assertNotV3ManagedVolume(volume: DockerVolumeInspect, name: string): void {
    const labels = volume.Labels ?? undefined;
    if (
      labels?.app === 'fastgpt' ||
      Boolean(labels?.[FASTGPT_DOCKER_DEPLOYMENT_LABEL]) ||
      Boolean(labels?.[FASTGPT_DOCKER_CLAIM_LABEL]) ||
      this.isUnderJuicefsMountRoot(volume.Options?.device) ||
      this.isUnderJuicefsMountRoot(volume.Mountpoint)
    ) {
      throw new VolumeOwnershipError(
        `Refusing to operate on v3-managed Docker volume ${name} via legacy endpoint`
      );
    }
  }

  /** 检查旧版普通 local 命名卷是否存在。 */
  async exists(claimName: string): Promise<boolean> {
    const name = assertLegacyVolumePrefixAllowed(
      claimName,
      this.allowedPrefixes ?? getLegacyAllowedVolumePrefixes()
    );
    const volume = await inspectDockerVolume(this.dockerClient, name);
    if (!volume) return false;

    this.assertNotV3ManagedVolume(volume, name);
    return true;
  }

  /** 确认无任何容器引用后幂等删除旧版普通 local 命名卷（404 视为成功）。 */
  async remove(claimName: string): Promise<void> {
    const name = assertLegacyVolumePrefixAllowed(
      claimName,
      this.allowedPrefixes ?? getLegacyAllowedVolumePrefixes()
    );
    const volume = await inspectDockerVolume(this.dockerClient, name);
    if (!volume) return;

    this.assertNotV3ManagedVolume(volume, name);
    await assertDockerVolumeUnreferenced(this.dockerClient, name);
    await deleteDockerVolume(this.dockerClient, name);
  }
}
