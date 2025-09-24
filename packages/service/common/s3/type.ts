import type { ClientOptions } from 'minio';

export type S3ServiceConfig = {
  bucket: string;
  externalBaseURL?: string;
  /**
   * Unit: Byte
   */
  maxFileSize?: number;
  /**
   * for executing some init function for the s3 service
   */
  initFunction?: () => Promise<any>;
} & ClientOptions;

export type FileMetadataType = {
  fileId: string;
  originalFilename: string;
  contentType: string;
  size: number;
  uploadTime: Date;
  accessUrl: string;
};

export type PresignedUrlInput = {
  filepath: string;
  filename: string;
  contentType?: string;
  metadata?: Record<string, string>;
};

export type UploadPresignedURLResponse = {
  objectName: string;
  uploadUrl: string;
  formData: Record<string, string>;
};

export type FileUploadInput = {
  buffer: Buffer;
  filename: string;
};

export enum PluginTypeEnum {
  tool = 'tool'
}

export const PluginFilePath = {
  [PluginTypeEnum.tool]: 'plugin/tools'
};
