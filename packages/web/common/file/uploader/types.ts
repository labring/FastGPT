export type S3UploadTranslation = (key: string, options?: Record<string, unknown>) => string;

export type S3FileUploaderBaseParams = {
  url: string;
  file: File;
  headers?: Record<string, string>;
  onProgress?: (loaded: number, total: number) => void;
  onSuccess?: () => void;
  signal?: AbortSignal;
  maxSize?: number;
  t: S3UploadTranslation;
};

export type S3FileUploaderSingleParams = S3FileUploaderBaseParams & {
  /** 未提供上传模式的旧接口仍按单 PUT 处理。 */
  uploadMode?: 'single';
};

export type S3FileUploaderMultipartParams = S3FileUploaderBaseParams & {
  uploadMode: 'multipart';
  completeUrl: string;
  abortUrl: string;
  partSize: number;
  concurrency: number;
  maxRetry: number;
};

export type S3FileUploaderParams = S3FileUploaderSingleParams | S3FileUploaderMultipartParams;

export type MultipartUploadPart = {
  partNumber: number;
  etag: string;
};
