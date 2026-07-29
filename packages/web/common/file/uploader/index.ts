import { uploadMultipartFile } from './multipart';
import { uploadSingleFile } from './single';
import type { S3FileUploaderParams } from './types';

/**
 * 统一执行浏览器到 FastGPT 对象存储代理的文件上传。
 *
 * 未声明 uploadMode 的响应按 single 处理，以兼容头像、聊天和临时文件等旧上传接口；
 * Multipart 只由带有完整分片参数的 presign 响应显式开启。
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
