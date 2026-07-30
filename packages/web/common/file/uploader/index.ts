import { uploadMultipartFile } from './multipart';
import { uploadSingleFile } from './single';
import type { S3FileUploaderParams } from './types';

/**
 * 统一执行浏览器到 FastGPT 对象存储代理的文件上传。
 *
 * 未声明 uploadMode 的旧响应按 single 处理；新的 presign 响应会携带完整的模式参数。
 */
export class S3FileUploader {
  constructor(private readonly params: S3FileUploaderParams) {}

  /** 根据预签名响应选择 single PUT 或 Multipart 上传。 */
  async upload(): Promise<void> {
    if (this.params.uploadMode === 'multipart') {
      return uploadMultipartFile(this.params);
    }

    return uploadSingleFile(this.params);
  }
}

export type { S3FileUploaderParams } from './types';
