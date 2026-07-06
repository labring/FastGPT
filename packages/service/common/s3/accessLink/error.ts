export enum S3AccessLinkErrCode {
  invalidSignedAlias = 'InvalidSignedAlias',
  expiredSignedAlias = 'ExpiredSignedAlias',
  invalidSignedAliasSignature = 'InvalidSignedAliasSignature',
  downloadAliasNotFound = 'DownloadAliasNotFound',
  downloadAliasRevoked = 'DownloadAliasRevoked',
  uploadSessionNotFound = 'UploadSessionNotFound',
  uploadSessionExpired = 'UploadSessionExpired',
  uploadSessionRevoked = 'UploadSessionRevoked'
}

/**
 * 短链内部错误分类。
 *
 * 该错误只在 accessLink service/utils 与文件代理边界之间传递，不直接暴露给客户端。
 * API 层统一把它映射为 `unAuthFile`，避免泄露 alias 是否存在、token 是否过期等枚举信号。
 */
export class S3AccessLinkError extends Error {
  constructor(public readonly code: S3AccessLinkErrCode) {
    super(code);
    this.name = 'S3AccessLinkError';
  }
}

export const isS3AccessLinkError = (error: unknown): error is S3AccessLinkError =>
  error instanceof S3AccessLinkError;
