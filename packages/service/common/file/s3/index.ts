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

export async function getObjectPresignedUrl(key: string) {
  return client.presignedGetObject(bucketName, key, 24 * 60 * 60);
}

export async function postObjectPresignedUrl(key: string) {
  const policy = client.newPostPolicy();
  policy.setBucket(bucketName);
  policy.setExpires(new Date(Date.now() + 10 * 60 * 1000));
  policy.setKey(key);
  policy.setContentType('application/octet-stream');
  policy.setContentLengthRange(1, 1024 * 1024 * 100);

  return client.presignedPostPolicy(policy);
}
