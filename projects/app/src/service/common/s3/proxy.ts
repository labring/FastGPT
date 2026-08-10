import type { NextApiRequest, NextApiResponse } from 'next';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { jsonRes } from '@fastgpt/service/common/response';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { isS3AccessLinkError } from '@fastgpt/service/common/s3/accessLink';
import type { MultipartUploadPart } from '@fastgpt-sdk/storage';
import type {
  S3ProxyDownloadPayload,
  S3ProxyUploadPayload
} from '@fastgpt/service/common/s3/accessLink';
import { verifyS3MultipartUploadSessionToken } from '@fastgpt/service/common/s3/accessLink';
import type { UploadFileHint, UploadPolicy } from '@fastgpt/service/common/s3/uploadPolicy/type';
import {
  DEFAULT_CONTENT_TYPE,
  ensureTextContentTypeCharset
} from '@fastgpt/service/common/s3/utils/mime';
import {
  canUseStorageDownloadRedirect,
  replaceS3UrlWithCdnEndpoint,
  storageDownloadRedirectTtlSeconds
} from '@fastgpt/service/common/s3/config/constants';
import {
  getUploadInspectBytes,
  validateUploadFile
} from '@fastgpt/service/common/s3/validation/upload';

const logger = getLogger(LogCategories.INFRA.FILE);

type GuardStreamOptions = {
  maxSize: number;
  uploadPolicy: UploadPolicy;
  fileHint: UploadFileHint;
};

type ValidatedUploadFile = Awaited<ReturnType<typeof validateUploadFile>>;

/**
 * 把 HTTP 客户端断开转换为可透传给存储 SDK 和 stream pipeline 的取消信号。
 * 响应正常完成后的 close 不属于取消；调用方结束时必须执行 cleanup。
 */
export const createS3DownloadAbortContext = ({
  req,
  res
}: {
  req: NextApiRequest;
  res: NextApiResponse;
}) => {
  const controller = new AbortController();
  let clientAborted = false;
  let responseCompleted = !!(res.writableEnded || res.writableFinished);

  const abortClientDownload = () => {
    if (responseCompleted || clientAborted) return;

    clientAborted = true;
    controller.abort(new Error('S3ProxyDownloadClientAborted'));
  };
  const markResponseCompleted = () => {
    responseCompleted = true;
  };
  const handleResponseClose = () => {
    if (!responseCompleted) abortClientDownload();
  };

  req.once('aborted', abortClientDownload);
  res.once('finish', markResponseCompleted);
  res.once('close', handleResponseClose);

  if (req.aborted || res.destroyed) {
    abortClientDownload();
  }

  return {
    signal: controller.signal,
    isClientAborted: () => clientAborted,
    abort: (error?: unknown) => {
      if (!controller.signal.aborted) controller.abort(error);
    },
    cleanup: () => {
      req.off('aborted', abortClientDownload);
      res.off('finish', markResponseCompleted);
      res.off('close', handleResponseClose);
    }
  };
};

const parseRequestFilename = (filename?: string) => {
  if (!filename) return '';

  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
};

const parseObjectKeyFilename = (objectKey: string) =>
  parseRequestFilename(path.basename(objectKey)) || 'file';

export const parseS3ProxyContentLength = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const createUploadGuardStream = ({ maxSize, uploadPolicy, fileHint }: GuardStreamOptions) => {
  const inspectBytes = getUploadInspectBytes({ hint: fileHint, policy: uploadPolicy });
  let uploadedBytes = 0;
  let bufferedBytes = 0;
  const chunks: Buffer[] = [];
  let validatedFile: ValidatedUploadFile | undefined;
  let validationSettled = false;
  let resolveValidatedUpload!: (value: ValidatedUploadFile) => void;
  let rejectValidatedUpload!: (reason?: unknown) => void;

  const validatedUpload = new Promise<ValidatedUploadFile>((resolve, reject) => {
    resolveValidatedUpload = resolve;
    rejectValidatedUpload = reject;
  });

  const settleValidation = ({
    result,
    error
  }: {
    result?: ValidatedUploadFile;
    error?: unknown;
  }) => {
    if (validationSettled) return;
    validationSettled = true;

    if (error) {
      rejectValidatedUpload(error);
      return;
    }
    if (result) {
      resolveValidatedUpload(result);
    }
  };

  const validateBuffer = async () => {
    if (validatedFile) return validatedFile;
    const buffer = Buffer.concat(chunks, bufferedBytes);

    const result = await validateUploadFile({
      buffer,
      filename: fileHint.filename,
      uploadPolicy,
      fileHint
    });

    validatedFile = result;
    settleValidation({ result });

    return result;
  };

  const stream = new Transform({
    transform(chunk, _, callback) {
      uploadedBytes += chunk.length;
      if (uploadedBytes > maxSize) {
        const error = new Error('EntityTooLarge');
        settleValidation({ error });
        callback(error);
        return;
      }

      if (validatedFile) {
        callback(null, chunk);
        return;
      }

      chunks.push(chunk);
      bufferedBytes += chunk.length;

      if (bufferedBytes < inspectBytes) {
        callback();
        return;
      }

      validateBuffer()
        .then(() => {
          const initialBuffer = Buffer.concat(chunks, bufferedBytes);
          chunks.length = 0;
          bufferedBytes = 0;
          callback(null, initialBuffer);
        })
        .catch((error) => {
          settleValidation({ error });
          callback(error);
        });
    },
    flush(callback) {
      validateBuffer()
        .then(() => {
          if (bufferedBytes > 0) {
            callback(null, Buffer.concat(chunks, bufferedBytes));
            return;
          }
          callback();
        })
        .catch((error) => {
          settleValidation({ error });
          callback(error);
        });
    }
  });

  stream.once('error', (error) => {
    settleValidation({ error });
  });
  stream.once('close', () => {
    if (!validationSettled && !validatedFile) {
      settleValidation({ error: new Error('UploadStreamClosed') });
    }
  });

  return {
    stream,
    validatedUpload
  };
};

export const buildS3UploadMetadata = ({
  metadata,
  filename
}: {
  metadata?: Record<string, string>;
  filename?: string;
}) => {
  if (!filename) return metadata;

  const { contentDisposition: _contentDisposition, ...customMetadata } = metadata ?? {};

  return {
    ...customMetadata,
    originFilename: encodeURIComponent(filename)
  };
};

const resolveProxyUploadFileHint = ({
  objectKey,
  metadata,
  fileHint
}: {
  objectKey: string;
  metadata?: Record<string, string>;
  fileHint?: UploadFileHint;
}): UploadFileHint => {
  if (fileHint) return fileHint;

  return {
    filename: parseRequestFilename(metadata?.originFilename) || parseObjectKeyFilename(objectKey)
  };
};

/**
 * 代理输出 S3 对象下载流。
 *
 * 该函数只处理文件流、响应头和对象不存在等存储层错误；业务权限和短链校验必须在调用前完成。
 */
export const handleS3ProxyDownload = async ({
  req,
  res,
  payload
}: {
  req: NextApiRequest;
  res: NextApiResponse;
  payload: S3ProxyDownloadPayload;
}) => {
  const { objectKey, bucketName } = payload;
  const bucket = global.s3BucketMap[bucketName];

  if (!bucket) {
    throw new Error('S3 bucket not found');
  }

  const abortContext = createS3DownloadAbortContext({ req, res });
  let stream: Awaited<ReturnType<typeof bucket.getFileStream>>;

  const setResponseHeaders = (metadata: Awaited<ReturnType<typeof bucket.getFileMetadata>>) => {
    const filename =
      parseRequestFilename(payload.filename) ||
      metadata?.filename ||
      parseObjectKeyFilename(objectKey);
    const contentType =
      payload.responseContentType || metadata?.contentType || DEFAULT_CONTENT_TYPE;

    res.setHeader(
      'Content-Type',
      ensureTextContentTypeCharset({
        contentType,
        filename
      })
    );
    if (metadata?.contentLength) {
      res.setHeader('Content-Length', metadata.contentLength);
    }
    res.setHeader('Content-Disposition', getContentDisposition({ filename, type: 'inline' }));
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  };

  try {
    if (req.method === 'HEAD') {
      const metadata = await bucket.getFileMetadata(objectKey);
      setResponseHeaders(metadata);
      res.status(200).end();
      return;
    }

    const [downloadStream, metadata] = await Promise.all([
      bucket.getFileStream(objectKey, { abortSignal: abortContext.signal }).then((value) => {
        stream = value;
        value?.once('error', (error) => {
          if (!abortContext.isClientAborted() && !req.aborted && !res.destroyed) {
            logger.error('Error reading proxy download stream', { objectKey, bucketName, error });
          }
        });
        return value;
      }),
      bucket.getFileMetadata(objectKey)
    ]);

    if (!downloadStream) {
      throw CommonErrEnum.fileNotFound;
    }

    setResponseHeaders(metadata);
    await pipeline(downloadStream, res, { signal: abortContext.signal });
  } catch (error) {
    if (abortContext.isClientAborted() || req.aborted || res.destroyed) {
      abortContext.abort(error);
      if (stream && !stream.destroyed) stream.destroy();
      return;
    }

    abortContext.abort(error);
    if (stream && !stream.destroyed) {
      stream.destroy(error instanceof Error ? error : undefined);
    }
    throw error;
  } finally {
    abortContext.cleanup();
  }
};

const resolveS3RedirectExpiresSeconds = ({ expiresAt }: { expiresAt: Date }) => {
  const remainingSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

  if (remainingSeconds <= 0) {
    throw CommonErrEnum.unAuthFile;
  }

  return Math.min(storageDownloadRedirectTtlSeconds, remainingSeconds);
};

/**
 * 校验后的短链 302 到短 TTL S3/CDN 预签名下载地址。
 *
 * 该函数不把 S3 presigned URL 写回业务数据，只作为当前 HTTP 响应的临时 Location。
 */
export const handleS3RedirectDownload = async ({
  res,
  payload,
  expiresAt
}: {
  res: NextApiResponse;
  payload: S3ProxyDownloadPayload;
  expiresAt: Date;
}) => {
  if (!canUseStorageDownloadRedirect) {
    throw new Error('S3 short redirect requires STORAGE_EXTERNAL_ENDPOINT');
  }

  const { objectKey, bucketName } = payload;
  const bucket = global.s3BucketMap[bucketName];

  if (!bucket) {
    throw new Error('S3 bucket not found');
  }

  const resolvedObjectKey = await bucket.resolveExistingObjectKey(objectKey);
  if (!resolvedObjectKey) {
    throw CommonErrEnum.fileNotFound;
  }

  const result = await bucket.externalClient.generatePresignedGetUrl({
    key: resolvedObjectKey,
    expiredSeconds: resolveS3RedirectExpiresSeconds({ expiresAt }),
    ...(payload.responseContentType ? { responseContentType: payload.responseContentType } : {})
  });

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', replaceS3UrlWithCdnEndpoint(result.url));
  res.status(302).end();
};

/**
 * 代理处理上传请求。
 *
 * 上传内容会先经过大小和文件类型 guard，再写入 S3。该函数不负责签发或校验上传 session。
 */
export const handleS3ProxyUpload = async ({
  req,
  payload
}: {
  req: NextApiRequest;
  payload: S3ProxyUploadPayload;
}) => {
  const { objectKey, bucketName, maxSize, uploadPolicy, fileHint, metadata } = payload;
  const bucket = global.s3BucketMap[bucketName];

  if (!bucket) {
    throw new Error('S3 bucket not found');
  }

  const contentLength = parseS3ProxyContentLength(req.headers['content-length']);
  if (contentLength && contentLength > maxSize) {
    throw new Error('EntityTooLarge');
  }

  const resolvedFileHint = resolveProxyUploadFileHint({ objectKey, metadata, fileHint });
  const { stream: guardStream, validatedUpload } = createUploadGuardStream({
    maxSize,
    uploadPolicy,
    fileHint: resolvedFileHint
  });

  req.pipe(guardStream);
  const validatedFile = await validatedUpload;

  await bucket.client.uploadObject({
    key: objectKey,
    body: guardStream,
    contentType: validatedFile.contentType,
    contentLength,
    contentDisposition: getContentDisposition({
      filename: validatedFile.filename,
      type: 'attachment'
    }),
    metadata: buildS3UploadMetadata({
      metadata,
      filename: validatedFile.filename
    })
  });

  return { success: true };
};

const resolveExpectedMultipartPartLength = ({
  payload,
  partNumber
}: {
  payload: S3ProxyUploadPayload;
  partNumber: number;
}) => {
  const multipart = payload.multipart;
  if (!multipart) {
    throw new Error('Not a multipart upload session');
  }

  const partCount = Math.ceil(multipart.totalSize / multipart.partSize);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount) {
    throw new Error('Multipart part number is out of range');
  }

  return partNumber === partCount
    ? multipart.totalSize - multipart.partSize * (partCount - 1)
    : multipart.partSize;
};

/**
 * 限制单个 Multipart 分片的实际字节数，防止客户端伪造 Content-Length 或发送超长 body。
 * 只有最后一个分片允许小于 partSize，具体期望长度由 session 推导。
 */
const createMultipartPartLengthGuard = (expectedLength: number) => {
  let receivedLength = 0;

  return new Transform({
    transform(chunk, _encoding, callback) {
      receivedLength += chunk.length;
      if (receivedLength > expectedLength) {
        callback(new Error('Multipart part length does not match session'));
        return;
      }
      callback(null, chunk);
    },
    flush(callback) {
      if (receivedLength !== expectedLength) {
        callback(new Error('Multipart part length does not match session'));
        return;
      }
      callback();
    }
  });
};

/**
 * 代理 Multipart 分片上传。请求 body 始终以 stream 传给 storage，part 1 额外复用现有文件
 * 内容校验；客户端断开时主动销毁中间 stream，使底层 SDK 尽快停止读取该分片。
 */
export const handleS3ProxyUploadPart = async ({
  req,
  token,
  payload,
  partNumber
}: {
  req: NextApiRequest;
  token: string;
  payload: S3ProxyUploadPayload;
  partNumber: number;
}): Promise<{ etag: string }> => {
  const { objectKey, bucketName, maxSize, uploadPolicy, fileHint, metadata } = payload;
  const bucket = global.s3BucketMap[bucketName];

  if (!bucket) {
    throw new Error('S3 bucket not found');
  }

  const contentLength = parseS3ProxyContentLength(req.headers['content-length']);
  if (contentLength === undefined) {
    throw new Error('Multipart part content-length is required');
  }

  const expectedLength = resolveExpectedMultipartPartLength({ payload, partNumber });
  if (contentLength !== expectedLength) {
    throw new Error('Multipart part length does not match session');
  }

  const lengthGuard = createMultipartPartLengthGuard(expectedLength);
  const resolvedFileHint = resolveProxyUploadFileHint({ objectKey, metadata, fileHint });
  const contentGuard =
    partNumber === 1
      ? createUploadGuardStream({
          maxSize,
          uploadPolicy,
          fileHint: resolvedFileHint
        })
      : undefined;
  const uploadStream = contentGuard?.stream ?? lengthGuard;
  const validatedUpload = contentGuard?.validatedUpload;

  const destroyUploadStreams = (error: Error) => {
    if (!lengthGuard.destroyed) lengthGuard.destroy(error);
    if (!uploadStream.destroyed) uploadStream.destroy(error);
  };

  const abortUpload = () => {
    // 正常请求结束也可能触发 close；只有未完整读取的请求需要销毁上传流。
    if (req.complete || req.readableEnded) return;
    destroyUploadStreams(new Error('Multipart upload request aborted'));
  };

  if (req.aborted) {
    abortUpload();
    throw new Error('Multipart upload request aborted');
  }

  req.once('aborted', abortUpload);
  req.once('error', abortUpload);
  req.once('close', abortUpload);

  try {
    const uploadPromise = bucket.uploadMultipartPart({
      token,
      partNumber,
      body: uploadStream,
      contentLength
    });

    const requestPipeline = contentGuard
      ? pipeline(req, lengthGuard, contentGuard.stream)
      : pipeline(req, lengthGuard);

    const result = validatedUpload
      ? await Promise.all([validatedUpload, uploadPromise, requestPipeline]).then(
          ([, uploadResult]) => uploadResult
        )
      : await Promise.all([uploadPromise, requestPipeline]).then(([uploadResult]) => uploadResult);

    return { etag: result.etag };
  } catch (error) {
    destroyUploadStreams(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    req.off('aborted', abortUpload);
    req.off('error', abortUpload);
    req.off('close', abortUpload);
  }
};

/** 通过 opaque token 定位 bucket，并完成 Multipart 对象合并。 */
export const handleS3CompleteMultipartUpload = async ({
  token,
  parts
}: {
  token: string;
  parts: MultipartUploadPart[];
}) => {
  const payload = await verifyS3MultipartUploadSessionToken(token);
  const bucket = global.s3BucketMap[payload.bucketName];

  if (!bucket) {
    throw new Error('S3 bucket not found');
  }

  return bucket.completeMultipartUpload({ token, parts });
};

/** 通过 opaque token 定位 bucket，并取消未完成的 Multipart 对象。 */
export const handleS3AbortMultipartUpload = async (token: string) => {
  const payload = await verifyS3MultipartUploadSessionToken(token);
  const bucket = global.s3BucketMap[payload.bucketName];

  if (!bucket) {
    throw new Error('S3 bucket not found');
  }

  await bucket.abortMultipartUpload({ token });
};

const getProxyErrorKey = (error: unknown) => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return undefined;
};

/**
 * 把文件代理层可预期的错误映射成稳定的 HTTP 状态和公开错误。
 *
 * accessLink 内部错误统一伪装成未授权文件；旧 JWT、上传类型校验和对象缺失则保留既有
 * 业务错误，避免短链路由改造后把客户端错误误报成 500。
 */
export function resolveS3ProxyErrorResponse(error: unknown): {
  httpStatus: number;
  publicError: unknown;
} {
  if (isS3AccessLinkError(error)) {
    return {
      httpStatus: 403,
      publicError: CommonErrEnum.unAuthFile
    };
  }

  const errorKey = getProxyErrorKey(error);

  if (errorKey === CommonErrEnum.unAuthFile) {
    return {
      httpStatus: 403,
      publicError: CommonErrEnum.unAuthFile
    };
  }

  if (errorKey === CommonErrEnum.fileNotFound) {
    return {
      httpStatus: 404,
      publicError: CommonErrEnum.fileNotFound
    };
  }

  if (errorKey === 'S3 bucket not found') {
    return {
      httpStatus: 500,
      publicError: error
    };
  }

  if (errorKey === 'EntityTooLarge') {
    return {
      httpStatus: 413,
      publicError: error
    };
  }

  if (
    errorKey === 'Not a multipart upload session' ||
    errorKey === 'Multipart part content-length is required' ||
    errorKey === 'Multipart part length does not match session' ||
    errorKey === 'Multipart part number is out of range' ||
    errorKey === 'Multipart upload request aborted' ||
    errorKey === 'Multipart upload requires partNumber' ||
    errorKey === 'Multipart parts count does not match total size' ||
    errorKey?.startsWith('Multipart parts must be') ||
    errorKey?.startsWith('Multipart upload session is')
  ) {
    return {
      httpStatus: 400,
      publicError: error
    };
  }

  const errorResponse = errorKey ? ERROR_RESPONSE[errorKey] : undefined;
  if (
    typeof errorResponse?.code === 'number' &&
    errorResponse.code >= 510000 &&
    errorResponse.code < 511000
  ) {
    return {
      httpStatus: 400,
      publicError: error
    };
  }

  return {
    httpStatus: 500,
    publicError: error
  };
}

/**
 * 文件代理 API 的统一错误出口。
 *
 * 对已经开始流式输出的响应，只结束连接；否则交给 `jsonRes` 保持统一响应结构。
 */
export function handleS3ProxyRouteError({ res, error }: { res: NextApiResponse; error: unknown }) {
  if (res.headersSent) {
    res.end();
    return;
  }

  const { httpStatus, publicError } = resolveS3ProxyErrorResponse(error);

  return jsonRes(res, {
    code: httpStatus,
    error: publicError
  });
}
