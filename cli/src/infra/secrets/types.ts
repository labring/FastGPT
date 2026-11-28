import type { SecretStoreBackend } from '../../shared/types';

export type SecretStoreStrategy = {
  readonly backend: SecretStoreBackend;
  isAvailable: () => Promise<boolean>;
  get: (profileName: string) => Promise<string | undefined>;
  set: (profileName: string, secret: string) => Promise<boolean>;
  delete: (profileName: string) => Promise<void>;
};

export type SecretStore = {
  getBackendName: (profileName?: string) => Promise<SecretStoreBackend>;
  getSecret: (profileName: string) => Promise<string | undefined>;
  setSecret: (profileName: string, secret: string) => Promise<{ backend: SecretStoreBackend }>;
  deleteSecret: (profileName: string) => Promise<void>;
};
