export type EnsureResult = {
  claimName: string;
  created: boolean;
};

export type EnsureVolumeParams = {
  claimName: string;
  storageSize?: string;
};

export type IVolumeDriver = {
  ensure(params: EnsureVolumeParams): Promise<EnsureResult>;
  remove(claimName: string): Promise<void>;
};
