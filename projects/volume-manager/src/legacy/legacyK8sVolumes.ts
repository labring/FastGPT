/**
 * 隔离式 Kubernetes 旧版无标签 PVC 查询与清理器（legacy 专用模块）。
 *
 * 仅允许读取/删除命中旧卷前缀且不携带任何 v3 受管标签的旧版 RWO PVC；
 * 凡带有 `managed-by=fastgpt-volume-manager`、`fastgpt.deployment` 或 `app=fastgpt` 的 PVC 一律抛 409 拒绝。
 */
import { VolumeOwnershipError } from '../drivers/IVolumeDriver';
import { env } from '../env';
import { DEPLOYMENT_LABEL, FASTGPT_PVC_LABELS, K8sPvcClient } from '../utils/k8sPvcClient';
import {
  assertLegacyVolumePrefixAllowed,
  getLegacyAllowedVolumePrefixes,
  type ILegacyVolumeCleaner
} from './env';

export type LegacyK8sVolumeCleanerOptions = {
  namespace?: string;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
  allowedPrefixes?: string[];
};

export class LegacyK8sVolumeCleaner implements ILegacyVolumeCleaner {
  private readonly client: K8sPvcClient;
  private readonly allowedPrefixes?: string[];

  constructor(options: LegacyK8sVolumeCleanerOptions = {}) {
    this.client = new K8sPvcClient({
      namespace: options.namespace ?? env.VM_K8S_NAMESPACE,
      waitTimeoutMs: options.waitTimeoutMs,
      pollIntervalMs: options.pollIntervalMs
    });
    this.allowedPrefixes = options.allowedPrefixes;
  }

  private assertNotV3ManagedPvc(labels: Record<string, string> | undefined, name: string): void {
    if (
      labels?.['managed-by'] === FASTGPT_PVC_LABELS['managed-by'] ||
      Boolean(labels?.[DEPLOYMENT_LABEL]) ||
      labels?.app === FASTGPT_PVC_LABELS.app
    ) {
      throw new VolumeOwnershipError(
        `Refusing to operate on v3-managed K8s PVC ${this.client.namespace}/${name} via legacy endpoint`
      );
    }
  }

  /** 检查无标签旧版 PVC 是否存在且处于可挂载（非 Terminating）状态。 */
  async exists(claimName: string): Promise<boolean> {
    const name = assertLegacyVolumePrefixAllowed(
      claimName,
      this.allowedPrefixes ?? getLegacyAllowedVolumePrefixes()
    );
    const current = await this.client.readPvc(name);
    if (current.state === 'absent') return false;

    this.assertNotV3ManagedPvc(current.labels, name);
    return current.state === 'active';
  }

  /** 幂等删除无标签旧版 PVC，使用 UID precondition 并等待当前 generation 彻底消失。 */
  async remove(claimName: string): Promise<void> {
    const name = assertLegacyVolumePrefixAllowed(
      claimName,
      this.allowedPrefixes ?? getLegacyAllowedVolumePrefixes()
    );
    const current = await this.client.readPvc(name);
    if (current.state === 'absent') return;

    this.assertNotV3ManagedPvc(current.labels, name);
    await this.client.deletePvcGeneration({ name, current });
  }
}
