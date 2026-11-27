import type {
  SandboxVolumeEnsureRequest,
  SandboxVolumeEnsureResponse
} from '@fastgpt/global/core/ai/sandbox/volume';

export type IVolumeDriver = {
  exists(claimName: string, options?: { allowLegacyUnlabeled?: boolean }): Promise<boolean>;
  ensure(params: SandboxVolumeEnsureRequest): Promise<SandboxVolumeEnsureResponse>;
  remove(claimName: string, options?: { allowLegacyUnlabeled?: boolean }): Promise<void>;
  list(): Promise<string[]>;
};
