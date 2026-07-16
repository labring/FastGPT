import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  S3_DOWNLOAD_ALIAS_ID_LENGTH,
  S3_DOWNLOAD_ALIAS_SIGN_VERSION,
  S3_DOWNLOAD_SIGNATURE_LENGTH,
  S3_UPLOAD_TOKEN_LENGTH
} from './constants';

export type S3AccessLinkCrypto = ReturnType<typeof createS3AccessLinkCrypto>;

const randomUrlSafeToken = (length: number) => {
  const bytesLength = Math.ceil((length * 3) / 4);
  return randomBytes(bytesLength).toString('base64url').slice(0, length);
};

export const createDefaultIdGenerator = () => ({
  aliasId: () => randomUrlSafeToken(S3_DOWNLOAD_ALIAS_ID_LENGTH),
  uploadToken: () => randomUrlSafeToken(S3_UPLOAD_TOKEN_LENGTH)
});

export const createS3AccessLinkCrypto = ({
  secret,
  signatureLength = S3_DOWNLOAD_SIGNATURE_LENGTH
}: {
  secret: string;
  signatureLength?: number;
}) => {
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
    signDownloadAlias: ({ aliasId, expMinute36 }: { aliasId: string; expMinute36: string }) => {
      const signingInput = `s3-download:${S3_DOWNLOAD_ALIAS_SIGN_VERSION}:${aliasId}:${expMinute36}`;
      return hmacSha256Base64Url(signingInput).slice(0, signatureLength);
    }
  };
};

export const constantTimeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
};
