import type {
  SandboxVolumeEnsureRequest,
  SandboxVolumeEnsureResponse
} from '@fastgpt/global/core/ai/sandbox/volume';

/**
 * 存储卷归属冲突异常：当同名 Docker 卷或 K8s PVC 不属于当前请求方 `deploymentId`（或非 FastGPT 受管）时抛出，
 * 由 HTTP 路由层统一映射为 `409 Conflict`。
 */
export class VolumeOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VolumeOwnershipError';
  }
}

export type IVolumeDriver = {
  ensure(params: SandboxVolumeEnsureRequest): Promise<SandboxVolumeEnsureResponse>;
  unmount(claimName: string, deploymentId: string): Promise<void>;
  remove(claimName: string, deploymentId: string): Promise<void>;
  list(deploymentId: string): Promise<string[]>;
};
