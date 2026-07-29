import { InvalidObjectNameError, InvalidXMLError, S3Error } from 'minio';
import type { MultipartUploadPart, S3MultipartUploadSession } from '@fastgpt-sdk/storage';

type MultipartUploadStatus = S3MultipartUploadSession['status'];

/** 只允许 active session 接收新的 Multipart 分片。 */
export const assertActiveMultipartSession = (status: MultipartUploadStatus) => {
  if (status !== 'active') {
    throw new Error(`Multipart upload session is ${status}`);
  }
};

/** complete 允许复用已经被当前请求占用的 completing session。 */
export const assertCompletableMultipartSession = (status: MultipartUploadStatus) => {
  if (status !== 'active' && status !== 'completing') {
    throw new Error(`Multipart upload session is ${status}`);
  }
};

/** 完成前校验分片编号和 ETag，确保客户端不能合并缺失或重复的 part。 */
export const assertCompleteMultipartParts = ({
  parts,
  totalSize,
  partSize
}: {
  parts: MultipartUploadPart[];
  totalSize: number;
  partSize: number;
}) => {
  const expectedPartCount = Math.ceil(totalSize / partSize);
  if (parts.length !== expectedPartCount) {
    throw new Error('Multipart parts count does not match total size');
  }

  parts.forEach((part, index) => {
    const expectedPartNumber = index + 1;
    if (part.partNumber !== expectedPartNumber || !part.etag.trim()) {
      throw new Error('Multipart parts must be continuous and have an ETag');
    }
  });
};

/** 根据 session 计算指定分片的准确长度，只有最后一个分片允许小于 partSize。 */
export const getExpectedMultipartPartLength = ({
  partNumber,
  totalSize,
  partSize
}: {
  partNumber: number;
  totalSize: number;
  partSize: number;
}) => {
  const partCount = Math.ceil(totalSize / partSize);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount) {
    throw new Error('Multipart part number is out of range');
  }
  return partNumber === partCount ? totalSize - partSize * (partCount - 1) : partSize;
};

/** 将对象存储返回的常见“对象不存在”错误转换为可幂等处理的判断结果。 */
export const isFileNotFoundError = (error: unknown): boolean => {
  if (error instanceof S3Error) {
    return (
      error.code === 'NoSuchKey' ||
      error.code === 'InvalidObjectName' ||
      error.message === 'Not Found' ||
      error.message ===
        'The request signature we calculated does not match the signature you provided. Check your key and signing method.' ||
      error.message.includes('Resource name contains bad components') ||
      error.message.includes('Object name contains unsupported characters.')
    );
  }
  if (error instanceof InvalidObjectNameError || error instanceof InvalidXMLError) {
    return true;
  }
  return false;
};
