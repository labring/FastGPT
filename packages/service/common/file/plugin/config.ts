import { mimeTypes } from './utils';

export enum FilePluginTypeEnum {
  tool = 'tool'
}

export enum PluginPathEnum {
  tools = 'plugin/tools'
}

export const PLUGIN_TYPE_TO_PATH_MAP: Record<FilePluginTypeEnum, PluginPathEnum> = {
  [FilePluginTypeEnum.tool]: PluginPathEnum.tools
};

export type UploadFileConfig = {
  maxFileSize: number;
  allowedExtensions?: string[];
  bucket: string;
};

export const defaultUploadConfig: UploadFileConfig = {
  maxFileSize: process.env.UPLOAD_MAX_FILE_SIZE
    ? parseInt(process.env.UPLOAD_MAX_FILE_SIZE)
    : 10 * 1024 * 1024,
  bucket: process.env.MINIO_UPLOAD_BUCKET || 'fastgpt-uploads',
  allowedExtensions: Object.keys(mimeTypes)
};

export type FileMetadata = {
  fileId: string;
  originalFilename: string;
  contentType: string;
  size: number;
  uploadTime: Date;
  accessUrl: string;
};

export type PresignedUrlInput = {
  filename: string;
  pluginType?: FilePluginTypeEnum;
  contentType?: string;
  metadata?: Record<string, string>;
  maxSize?: number;
};

export type PresignedUrlResponse = {
  fileId: string;
  objectName: string;
  uploadUrl: string;
  formData: Record<string, string>;
};

export type FileUploadInput = {
  buffer: Buffer;
  filename: string;
};
