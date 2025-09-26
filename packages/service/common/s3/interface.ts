import { type LifecycleConfig, type Client, type CopyConditions, type RemoveOptions } from 'minio';
import type { CreateObjectKeyParams, CreatePostPresignedUrlOptions } from './types';

export interface IBucketBasicOperations {
  get name(): string;
  get(): Promise<void>;
  exist(): Promise<boolean>;
  delete(objectKey: string, options?: RemoveOptions): Promise<void>;
  move(src: string, dst: string, options?: CopyConditions): Promise<void>;
  copy(src: string, dst: string, options?: CopyConditions): ReturnType<Client['copyObject']>;
  lifecycle(): Promise<LifecycleConfig | null>;
  createPostPresignedUrl(
    params: CreateObjectKeyParams,
    options?: CreatePostPresignedUrlOptions
  ): Promise<{ url: string; fields: Record<string, string> }>;
}

export interface IPublicBucketOperations {
  createPublicUrl(objectKey: string): string;
}
