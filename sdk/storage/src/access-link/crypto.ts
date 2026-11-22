import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  S3_DOWNLOAD_ALIAS_ID_LENGTH,
  S3_DOWNLOAD_ALIAS_SIGN_VERSION,
  S3_DOWNLOAD_ALIAS_SIGN_VERSION_V1,
  S3_DOWNLOAD_ALIAS_SIGN_VERSION_V2,
  S3_DOWNLOAD_SIGNATURE_LENGTH,
  S3_UPLOAD_TOKEN_LENGTH
} from './constants';
import { normalizeS3DownloadExtension } from './extension';
import type { S3DownloadAliasSignVersion } from './types';

export type S3AccessLinkCrypto = ReturnType<typeof createS3AccessLinkCrypto>;

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
// 248 = 62 * 4，拒绝 >= 248 的随机字节以保证 Base62 字符严格均匀分布。
const BASE62_REJECTION_LIMIT = 248;

const randomUrlSafeToken = (length: number) => {
  const bytesLength = Math.ceil((length * 3) / 4);
  return randomBytes(bytesLength).toString('base64url').slice(0, length);
};

const randomBase62Token = (length: number) => {
  let token = '';
  while (token.length < length) {
    const bytes = randomBytes(length);
    for (const byte of bytes) {
      if (byte >= BASE62_REJECTION_LIMIT) continue;
      token += BASE62_ALPHABET[byte % 62];
      if (token.length === length) break;
    }
  }
  return token;
};

const encodeBase62 = (buffer: Buffer, length: number) => {
  let value = BigInt(`0x${buffer.toString('hex')}`);
  let encoded = '';
  while (encoded.length < length) {
    encoded = BASE62_ALPHABET[Number(value % 62n)] + encoded;
    value /= 62n;
  }
  return encoded;
};

export const createDefaultIdGenerator = () => ({
  aliasId: () => randomBase62Token(S3_DOWNLOAD_ALIAS_ID_LENGTH),
  uploadToken: () => randomUrlSafeToken(S3_UPLOAD_TOKEN_LENGTH),
  multipartCompletionAttemptId: () => randomUrlSafeToken(32)
});

export const createS3AccessLinkCrypto = ({
  secret,
  signatureLength = S3_DOWNLOAD_SIGNATURE_LENGTH
}: {
  secret: string;
  signatureLength?: number;
}) => {
  const hmacSha256Buffer = (value: string) => createHmac('sha256', secret).update(value).digest();
  const hmacSha256Hex = (value: string) => createHmac('sha256', secret).update(value).digest('hex');
  const hmacSha256Base64Url = (value: string) =>
    createHmac('sha256', secret).update(value).digest('base64url');

  return {
    hashUploadToken: (token: string) => hmacSha256Hex(token),
    buildDownloadAliasKey: (params: {
      bucketName: string;
      objectKey: string;
      filename?: string;
      responseContentType?: string;
    }) =>
      hmacSha256Hex(
        JSON.stringify({
          bucketName: params.bucketName,
          objectKey: params.objectKey,
          filename: params.filename ?? '',
          responseContentType: params.responseContentType ?? ''
        })
      ),
    signDownloadAlias: ({
      aliasId,
      expMinute36,
      extension,
      version = S3_DOWNLOAD_ALIAS_SIGN_VERSION
    }: {
      aliasId: string;
      expMinute36: string;
      extension?: string;
      version?: S3DownloadAliasSignVersion;
    }) => {
      if (version === S3_DOWNLOAD_ALIAS_SIGN_VERSION_V1) {
        const signingInput = `s3-download:${S3_DOWNLOAD_ALIAS_SIGN_VERSION_V1}:${aliasId}:${expMinute36}`;
        return hmacSha256Base64Url(signingInput).slice(0, signatureLength);
      }

      // v2 签名使用 Base62（不含 '-' / '_' / '.'），并将规范化扩展名纳入签名防止后缀篡改。
      const normalizedExtension = normalizeS3DownloadExtension(extension);
      const signingInput = `s3-download:${S3_DOWNLOAD_ALIAS_SIGN_VERSION_V2}:${aliasId}:${expMinute36}:${normalizedExtension}`;
      return encodeBase62(hmacSha256Buffer(signingInput), signatureLength);
    }
  };
};

export const constantTimeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
};
