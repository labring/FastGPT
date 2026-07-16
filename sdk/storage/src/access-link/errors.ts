export const S3AccessLinkErrCode = {
  invalidDownloadBatch: 'InvalidDownloadBatch',
  invalidSignedAlias: 'InvalidSignedAlias',
  expiredSignedAlias: 'ExpiredSignedAlias',
  invalidSignedAliasSignature: 'InvalidSignedAliasSignature',
  downloadAliasNotFound: 'DownloadAliasNotFound',
  downloadAliasRevoked: 'DownloadAliasRevoked',
  uploadSessionNotFound: 'UploadSessionNotFound',
  uploadSessionExpired: 'UploadSessionExpired',
  uploadSessionRevoked: 'UploadSessionRevoked',
  uploadSessionUsed: 'UploadSessionUsed',
  duplicateAliasKey: 'DuplicateAliasKey',
  storeUnavailable: 'StoreUnavailable'
} as const;

export type S3AccessLinkErrorCode = (typeof S3AccessLinkErrCode)[keyof typeof S3AccessLinkErrCode];

/**
 * Typed error used by the access-link core and runtime adapters.
 *
 * The SDK keeps these errors protocol-level only. Applications should map them
 * to their own HTTP/API errors at the route boundary.
 */
export class S3AccessLinkError extends Error {
  readonly code: S3AccessLinkErrorCode;

  constructor(code: S3AccessLinkErrorCode, options?: { cause?: unknown }) {
    super(code, options);
    this.name = 'S3AccessLinkError';
    this.code = code;
  }
}

export const isS3AccessLinkError = (error: unknown): error is S3AccessLinkError =>
  error instanceof S3AccessLinkError;
