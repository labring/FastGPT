import * as Minio from 'minio';

const endPoint = process.env.S3_ENDPOINT || '';
const accessKey = process.env.S3_ACCESS_KEY_ID || '';
const secretKey = process.env.S3_SECRET_ACCESS_KEY || '';
const bucketName = process.env.S3_BUCKET_NAME || '';

const client = (() => {
  if (!endPoint || !accessKey || !secretKey || !bucketName) {
    return undefined;
  }
  return new Minio.Client({
    endPoint,
    accessKey,
    secretKey
  });
})();

export function isS3ClientInitialized(): boolean {
  return !!client;
}

export async function initBucket() {
  if (!client) {
    return;
  }
  if (!(await client.bucketExists(bucketName))) {
    throw new Error('Bucket does not exist or unauthorized');
  }
}

export async function getObjectPresignedUrl(key: string, expires: number = 24 * 60 * 60) {
  if (!client) {
    throw new Error('S3 client not initialized');
  }
  return client.presignedGetObject(bucketName, key, expires);
}

export async function postObjectPresignedUrl(
  key: string,
  metadata: any,
  maxSize: number = 1024 * 1024 * 100,
  expires: number = 10 * 60 * 1000
) {
  if (!client) {
    throw new Error('S3 client not initialized');
  }
  const policy = client.newPostPolicy();
  policy.setBucket(bucketName);
  policy.setExpires(new Date(Date.now() + expires));
  policy.setKey(key);
  policy.setUserMetaData(metadata);
  policy.setContentType('application/octet-stream');
  policy.setContentLengthRange(1, maxSize);

  return client.presignedPostPolicy(policy);
}

export async function removeObject(key: string) {
  if (!client) {
    throw new Error('S3 client not initialized');
  }
  await client.removeObject(bucketName, key);
}

export async function removeObjects(keys: string[]) {
  if (!client) {
    throw new Error('S3 client not initialized');
  }
  await client.removeObjects(bucketName, keys);
}

export async function removeObjectsByPrefix(prefix: string) {
  if (!client) {
    throw new Error('S3 client not initialized');
  }
  return new Promise<void>((resolve, reject) => {
    const stream = client.listObjects(bucketName, prefix, true);
    const keys: string[] = [];
    stream.on('data', (data) => {
      if (data.name) keys.push(data.name);
    });
    stream.on('error', (error) => {
      console.error('Error listing objects:', error);
      reject(error);
    });

    stream.on('end', async () => {
      await client.removeObjects(bucketName, keys);
      resolve();
    });
  });
}
