import { mimeTypes } from './utils';

// 插件类型枚举
export enum PluginTypeEnum {
  tool = 'tool'
}

// 插件路径枚举
export enum PluginPathEnum {
  tools = 'plugin/tools'
}

// 插件类型到路径的映射
export const PLUGIN_TYPE_TO_PATH_MAP: Record<PluginTypeEnum, PluginPathEnum> = {
  [PluginTypeEnum.tool]: PluginPathEnum.tools
};

export type UploadFileConfig = {
  maxFileSize: number; // 文件大小限制（字节）
  allowedExtensions?: string[]; // 允许的文件扩展名
  bucket: string; // 存储桶名称
};

// 默认配置
export const defaultUploadConfig: UploadFileConfig = {
  maxFileSize: process.env.UPLOAD_MAX_FILE_SIZE
    ? parseInt(process.env.UPLOAD_MAX_FILE_SIZE)
    : 100 * 1024 * 1024, // 默认 100MB
  bucket: process.env.MINIO_UPLOAD_BUCKET || 'fastgpt-uploads',
  allowedExtensions: Object.keys(mimeTypes) // 从 mimeTypes 映射表中获取支持的扩展名
};

export type FileMetadata = {
  fileId: string;
  originalFilename: string;
  contentType: string;
  size: number;
  uploadTime: Date;
  accessUrl: string;
};

// 预签名URL请求输入类型
export type PresignedUrlInput = {
  filename: string;
  pluginType?: PluginTypeEnum; // 插件类型，默认为 tool
  contentType?: string;
  metadata?: Record<string, string>;
  maxSize?: number;
};

// 预签名URL响应类型
export type PresignedUrlResponse = {
  fileId: string;
  objectName: string;
  uploadUrl: string;
  formData: Record<string, string>;
};

// 保留原有类型以兼容现有代码
export type FileUploadInput = {
  buffer: Buffer;
  filename: string;
};
