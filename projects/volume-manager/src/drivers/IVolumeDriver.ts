import type {
  SandboxVolumeEnsureRequest,
  SandboxVolumeEnsureResponse
} from '@fastgpt/global/core/ai/sandbox/volume';

export type IVolumeDriver = {
  ensure(params: SandboxVolumeEnsureRequest): Promise<SandboxVolumeEnsureResponse>;
  remove(claimName: string): Promise<void>;
};
