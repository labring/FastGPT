import type { CreateObjectKeyParams } from './types';

export interface IBucketBasicOperations {
  get name(): string;
  exist(): Promise<boolean>;
  upload(): Promise<void>;
  download(): Promise<void>;
  delete(objectKey: string): Promise<void>;
  get(): Promise<void>;
  createPostPresignedUrl(
    params: CreateObjectKeyParams
  ): Promise<{ url: string; fields: Record<string, string> }>;
}

export interface IPublicBucketOperations {
  createPublicUrl(objectKey: string): string;
}
