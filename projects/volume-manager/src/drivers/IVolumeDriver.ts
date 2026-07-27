export type EnsureResult = {
  claimName: string;
  created: boolean;
};

export type IVolumeDriver = {
  ensure(sessionId: string, storageSize?: string): Promise<EnsureResult>;
  remove(sessionId: string): Promise<void>;
};
