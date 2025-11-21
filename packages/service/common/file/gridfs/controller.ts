import { Types, connectionMongo, ReadPreference } from '../../mongo';
import type { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import fsp from 'fs/promises';
import fs from 'fs';
import { type DatasetFileSchema } from '@fastgpt/global/core/dataset/type';
import { MongoChatFileSchema, MongoDatasetFileSchema } from './schema';
import { detectFileEncodingByPath } from '@fastgpt/global/common/file/tools';
import { computeGridFsChunSize, stream2Encoding } from './utils';
import { addLog } from '../../system/log';
import { Readable } from 'stream';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getS3DatasetSource } from '../../s3/sources/dataset';

export function getGFSCollection(bucket: `${BucketNameEnum}`) {
  MongoDatasetFileSchema;
  MongoChatFileSchema;

  return connectionMongo.connection.db!.collection(`${bucket}.files`);
}
export function getGridBucket(bucket: `${BucketNameEnum}`) {
  return new connectionMongo.mongo.GridFSBucket(connectionMongo.connection.db!, {
    bucketName: bucket,
    // @ts-ignore
    readPreference: ReadPreference.SECONDARY_PREFERRED // Read from secondary node
  });
}

/* crud  file */
export async function uploadFile({
  bucketName,
  teamId,
  uid,
  path,
  filename,
  contentType,
  metadata = {}
}: {
  bucketName: `${BucketNameEnum}`;
  teamId: string;
  uid: string; // tmbId / outLinkUId
  path: string;
  filename: string;
  contentType?: string;
  metadata?: Record<string, any>;
}) {
  if (!path) return Promise.reject(`filePath is empty`);
  if (!filename) return Promise.reject(`filename is empty`);

  const stats = await fsp.stat(path);
  if (!stats.isFile()) return Promise.reject(`${path} is not a file`);

  const readStream = fs.createReadStream(path, {
    highWaterMark: 256 * 1024
  });

  // Add default metadata
  metadata.teamId = teamId;
  metadata.uid = uid;
  metadata.encoding = await detectFileEncodingByPath(path);

  // create a gridfs bucket
  const bucket = getGridBucket(bucketName);

  const chunkSizeBytes = computeGridFsChunSize(stats.size);

  const stream = bucket.openUploadStream(filename, {
    metadata,
    contentType,
    chunkSizeBytes
  });

  // save to gridfs
  await new Promise((resolve, reject) => {
    readStream
      .pipe(stream as any)
      .on('finish', resolve)
      .on('error', reject);
  }).finally(() => {
    readStream.destroy();
  });

  return String(stream.id);
}
export async function uploadFileFromBase64Img({
  bucketName,
  teamId,
  tmbId,
  base64,
  filename,
  metadata = {}
}: {
  bucketName: `${BucketNameEnum}`;
  teamId: string;
  tmbId: string;
  base64: string;
  filename: string;
  metadata?: Record<string, any>;
}) {
  if (!base64) return Promise.reject(`filePath is empty`);
  if (!filename) return Promise.reject(`filename is empty`);

  const base64Data = base64.split(',')[1];
  const contentType = base64.split(',')?.[0]?.split?.(':')?.[1];
  const buffer = Buffer.from(base64Data, 'base64');
  const readableStream = new Readable({
    read() {
      this.push(buffer);
      this.push(null);
    }
  });

  const { stream: readStream, encoding } = await stream2Encoding(readableStream);

  // Add default metadata
  metadata.teamId = teamId;
  metadata.tmbId = tmbId;
  metadata.encoding = encoding;

  // create a gridfs bucket
  const bucket = getGridBucket(bucketName);

  const stream = bucket.openUploadStream(filename, {
    metadata,
    contentType
  });

  // save to gridfs
  await new Promise((resolve, reject) => {
    readStream
      .pipe(stream as any)
      .on('finish', resolve)
      .on('error', reject);
  });

  return String(stream.id);
}

export async function getFileById({
  bucketName,
  fileId
}: {
  bucketName: `${BucketNameEnum}`;
  fileId: string;
}) {
  const db = getGFSCollection(bucketName);
  const file = await db.findOne<DatasetFileSchema>({
    _id: new Types.ObjectId(fileId)
  });

  return file || undefined;
}

export async function delFileByFileIdList({
  bucketName,
  fileIdList
}: {
  bucketName: `${BucketNameEnum}`;
  fileIdList: string[];
}): Promise<any> {
  return retryFn(async () => {
    const s3DatasetSource = getS3DatasetSource();

    const bucket = getGridBucket(bucketName);

    for await (const fileId of fileIdList) {
      try {
        if (s3DatasetSource.isDatasetObjectKey(fileId)) {
          await s3DatasetSource.deleteDatasetFileByKey(fileId);
        } else {
          await bucket.delete(new Types.ObjectId(String(fileId)));
        }
      } catch (error: any) {
        if (typeof error?.message === 'string' && error.message.includes('File not found')) {
          addLog.warn('File not found', { fileId });
          return;
        }
        return Promise.reject(error);
      }
    }
  });
}

export async function getDownloadStream({
  bucketName,
  fileId
}: {
  bucketName: `${BucketNameEnum}`;
  fileId: string;
}) {
  const bucket = getGridBucket(bucketName);

  return bucket.openDownloadStream(new Types.ObjectId(fileId));
}
