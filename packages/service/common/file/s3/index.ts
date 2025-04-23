import * as Minio from 'minio';

const endPoint = process.env.S3_ENDPOINT || '';
const accessKey = process.env.S3_ACCESS_KEY_ID || '';
const secretKey = process.env.S3_SECRET_ACCESS_KEY || '';
const bucketName = process.env.S3_BUCKET_NAME || 'fastgpt';

const client = new Minio.Client({
  endPoint,
  accessKey,
  secretKey
});

export async function initBucket() {
  if (!(await client.bucketExists(bucketName))) {
    throw new Error('Bucket does not exist or unauthorized');
  }
}

export async function getObjectPresignedUrl(key: string, expires: number = 24 * 60 * 60) {
  return client.presignedGetObject(bucketName, key, expires);
}

export async function postObjectPresignedUrl(
  key: string,
  metadata: any,
  maxSize: number = 1024 * 1024 * 100,
  expires: number = 10 * 60 * 1000
) {
  const policy = client.newPostPolicy();
  policy.setBucket(bucketName);
  policy.setExpires(new Date(Date.now() + expires));
  policy.setKey(key);
  policy.setUserMetaData(metadata);
  policy.setContentType('application/octet-stream');
  policy.setContentLengthRange(1, maxSize);

  return client.presignedPostPolicy(policy);
}
