import { getLogger } from '@fastgpt-sdk/otel/logger';
import {
  SandboxVolumeNameSchema,
  SandboxDeploymentIdSchema,
  type SandboxVolumeEnsureRequest,
  type SandboxVolumeEnsureResponse
} from '@fastgpt/global/core/ai/sandbox/volume';
import { VolumeOwnershipError, type IVolumeDriver } from './IVolumeDriver';
import { env } from '../env';
import {
  DEPLOYMENT_LABEL,
  FASTGPT_PVC_LABELS,
  K8sPvcClient,
  K8sPvcListSchema,
  type K8sPvcState
} from '../utils/k8sPvcClient';
import { LogCategories } from '../utils/logger';

const logger = getLogger(LogCategories.MODULE.VOLUME_MANAGER.DRIVER);

const DEFAULT_PVC_STORAGE_SIZE = '1Gi';

export type K8sVolumeDriverOptions = {
  namespace?: string;
  storageClassName?: string;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
};

export class K8sVolumeDriver implements IVolumeDriver {
  private readonly client: K8sPvcClient;
  private readonly storageClassName: string;

  constructor(options: K8sVolumeDriverOptions = {}) {
    this.client = new K8sPvcClient({
      namespace: options.namespace ?? env.VM_K8S_NAMESPACE,
      waitTimeoutMs: options.waitTimeoutMs,
      pollIntervalMs: options.pollIntervalMs
    });
    this.storageClassName = (options.storageClassName ?? env.VM_K8S_PVC_STORAGE_CLASS).trim();

    if (this.storageClassName.length === 0) {
      throw new Error(
        'VM_K8S_PVC_STORAGE_CLASS is required in kubernetes runtime and must reference a JuiceFS StorageClass'
      );
    }
  }

  /** 校验 PVC 的 FastGPT 管理标签与部署归属，防止认领或误删同命名空间下的其他 PVC。 */
  private assertPvcOwner(params: {
    current: Exclude<K8sPvcState, { state: 'absent' }>;
    name: string;
    deploymentId: string;
  }): void {
    const { current, name, deploymentId } = params;
    if (
      current.labels?.app !== FASTGPT_PVC_LABELS.app ||
      current.labels?.['managed-by'] !== FASTGPT_PVC_LABELS['managed-by'] ||
      current.labels?.[DEPLOYMENT_LABEL] !== deploymentId
    ) {
      throw new VolumeOwnershipError(
        `K8s PVC ${this.client.namespace}/${name} is not owned by deployment ${deploymentId}`
      );
    }
  }

  /** 创建带部署标签与 JuiceFS StorageClass 的 PVC；既有对象必须精确归属于请求部署。 */
  async ensure(params: SandboxVolumeEnsureRequest): Promise<SandboxVolumeEnsureResponse> {
    const name = SandboxVolumeNameSchema.parse(params.claimName);
    const deploymentId = SandboxDeploymentIdSchema.parse(params.deploymentId);
    const storageSize = params.storageSize ?? DEFAULT_PVC_STORAGE_SIZE;
    const deadline = Date.now() + this.client.waitTimeoutMs;

    while (true) {
      const current = await this.client.readPvc(name);
      if (current.state !== 'absent') {
        this.assertPvcOwner({ current, name, deploymentId });
      }
      if (current.state === 'active') {
        return { claimName: name, created: false };
      }
      if (current.state === 'deleting') {
        await this.client.waitForPvcGenerationEnd({ name, uid: current.uid, deadline });
        continue;
      }

      const postUrl = this.client.pvcUrl();
      logger.debug(`K8s POST PVC url=${postUrl} name=${name}`);
      const createRes = await this.client.fetch(postUrl, {
        method: 'POST',
        body: JSON.stringify({
          apiVersion: 'v1',
          kind: 'PersistentVolumeClaim',
          metadata: {
            name,
            namespace: this.client.namespace,
            labels: { ...FASTGPT_PVC_LABELS, [DEPLOYMENT_LABEL]: deploymentId }
          },
          spec: {
            accessModes: ['ReadWriteOnce'],
            resources: { requests: { storage: storageSize } },
            storageClassName: this.storageClassName
          }
        })
      });

      if (createRes.ok) {
        return { claimName: name, created: true };
      }
      if (createRes.status === 409) {
        await this.client.waitForPoll(
          deadline,
          `Timed out ensuring K8s PVC ${this.client.namespace}/${name}`
        );
        continue;
      }

      const text = await createRes.text().catch(() => '');
      throw new Error(`K8s PVC create failed (${createRes.status}): ${text}`);
    }
  }

  /** K8s 模式下挂载生命周期由 CSI 随沙箱 Pod 自动绑定与回收；此处仅校验部署归属后幂等返回。 */
  async unmount(claimName: string, deploymentId: string): Promise<void> {
    const name = SandboxVolumeNameSchema.parse(claimName);
    const parsedDeploymentId = SandboxDeploymentIdSchema.parse(deploymentId);
    const current = await this.client.readPvc(name);
    if (current.state === 'absent') return;

    this.assertPvcOwner({ current, name, deploymentId: parsedDeploymentId });
  }

  /** 删除指定 PVC 并等待当前 UID 对应的 generation 完全消失。 */
  async remove(claimName: string, deploymentId: string): Promise<void> {
    const name = SandboxVolumeNameSchema.parse(claimName);
    const parsedDeploymentId = SandboxDeploymentIdSchema.parse(deploymentId);
    const current = await this.client.readPvc(name);
    if (current.state === 'absent') return;

    this.assertPvcOwner({ current, name, deploymentId: parsedDeploymentId });
    await this.client.deletePvcGeneration({ name, current });
  }

  /** 仅返回当前部署拥有的非删除中 PVC，同时校验响应标签以防上游忽略 selector。 */
  async list(deploymentId: string): Promise<string[]> {
    const parsedDeploymentId = SandboxDeploymentIdSchema.parse(deploymentId);
    const selector = `app=${FASTGPT_PVC_LABELS.app},managed-by=${FASTGPT_PVC_LABELS['managed-by']},${DEPLOYMENT_LABEL}=${parsedDeploymentId}`;
    const url = `${this.client.pvcUrl()}?labelSelector=${encodeURIComponent(selector)}`;
    const res = await this.client.fetch(url);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`K8s PVC LIST failed (${res.status}): ${text}`);
    }

    const parsed = K8sPvcListSchema.parse(await res.json());
    return parsed.items
      .filter(
        ({ metadata }) =>
          !metadata.deletionTimestamp &&
          metadata.labels?.app === FASTGPT_PVC_LABELS.app &&
          metadata.labels?.['managed-by'] === FASTGPT_PVC_LABELS['managed-by'] &&
          metadata.labels?.[DEPLOYMENT_LABEL] === parsedDeploymentId
      )
      .map((item) => item.metadata.name);
  }
}
