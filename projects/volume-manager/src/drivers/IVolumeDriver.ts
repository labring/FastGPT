export type EnsureResult = {
  claimName: string;
  created: boolean;
};

export interface IVolumeDriver {
  ensure(sessionId: string): Promise<EnsureResult>;
  remove(sessionId: string): Promise<void>;
}
