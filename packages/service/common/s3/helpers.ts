import crypto from 'node:crypto';
import { type CreateObjectKeyParams } from './type';
import dayjs from 'dayjs';

/**
 * use public policy or just a custom policy
 *
 * @default policy public policy
 * @param bucket bucket name
 * @returns the policy string
 */
export const createBucketPolicy = (
  bucket: string,
  policy?: 'public' | Record<string, string>
): string => {
  if (typeof policy === 'string' && policy !== 'public') {
    throw new Error("'policy' only can be assigned to 'public' if typeof 'policy' is string");
  }

  switch (typeof policy) {
    case 'string':
    case 'undefined':
    default:
      return JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: 's3:GetObject',
            Resource: `arn:aws:s3:::${bucket}/*`
          }
        ]
      });
    case 'object':
      if (policy === null) {
        throw new Error("Bucket policy can't be null");
      }
      return JSON.stringify(policy);
  }
};

/**
 * create s3 object key by source, team ID and filename
 */
export function createObjectKey({ source, teamId, filename }: CreateObjectKeyParams): string {
  const date = dayjs().format('YYYY_MM_DD');
  const id = crypto.randomBytes(16).toString('hex');
  return `${source}/${teamId}/${date}/${id}_${filename}`;
}

/**
 * create temporary s3 object key by source, team ID and filename
 */
export function createTempObjectKey(params: CreateObjectKeyParams): string {
  const origin = createObjectKey(params);
  return `temp/${origin}`;
}
