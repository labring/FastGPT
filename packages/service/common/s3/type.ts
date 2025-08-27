export type S3ServiceConfig = {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  customEndpoint?: string;
  /**
   * Unit: Byte
   */
  maxFileSize?: number;
  initFunction?: () => Promise<any>;
};

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
  filename?: string;
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
