import { Types, connectionMongo, ReadPreference } from '../../mongo';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import fsp from 'fs/promises';
import fs from 'fs';
import { DatasetFileSchema } from '@fastgpt/global/core/dataset/type';
import { MongoChatFileSchema, MongoDatasetFileSchema } from './schema';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoRawTextBuffer } from '../../buffer/rawText/schema';
import { readRawContentByFileBuffer } from '../read/utils';
import { gridFsStream2Buffer, stream2Encoding } from './utils';
import { addLog } from '../../system/log';
import { readFromSecondary } from '../../mongo/utils';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { Readable } from 'stream';

export function getGFSCollection(bucket: `${BucketNameEnum}`) {
  MongoDatasetFileSchema;
  MongoChatFileSchema;

  return connectionMongo.connection.db.collection(`${bucket}.files`);
}
export function getGridBucket(bucket: `${BucketNameEnum}`) {
  return new connectionMongo.mongo.GridFSBucket(connectionMongo.connection.db, {
    bucketName: bucket,
    // @ts-ignore
    readPreference: ReadPreference.SECONDARY_PREFERRED // Read from secondary node
  });
}

/* crud  file */
export async function uploadFile({
  bucketName,
  teamId,
  tmbId,
  path,
  filename,
  contentType,
  metadata = {}
}: {
  bucketName: `${BucketNameEnum}`;
  teamId: string;
  tmbId: string;
  path: string;
  filename: string;
  contentType?: string;
  metadata?: Record<string, any>;
}) {
  if (!path) return Promise.reject(`filePath is empty`);
  if (!filename) return Promise.reject(`filename is empty`);

  const stats = await fsp.stat(path);
  if (!stats.isFile()) return Promise.reject(`${path} is not a file`);

  const { stream: readStream, encoding } = await stream2Encoding(fs.createReadStream(path));

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

  // if (!file) {
  //   return Promise.reject('File not found');
  // }

  return file || undefined;
}

export async function delFileByFileIdList({
  bucketName,
  fileIdList,
  retry = 3
}: {
  bucketName: `${BucketNameEnum}`;
  fileIdList: string[];
  retry?: number;
}): Promise<any> {
  try {
    const bucket = getGridBucket(bucketName);

    for await (const fileId of fileIdList) {
      await bucket.delete(new Types.ObjectId(fileId));
    }
  } catch (error) {
    if (retry > 0) {
      return delFileByFileIdList({ bucketName, fileIdList, retry: retry - 1 });
    }
  }
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

export const readFileContentFromMongo = async ({
  teamId,
  bucketName,
  fileId,
  isQAImport = false
}: {
  teamId: string;
  bucketName: `${BucketNameEnum}`;
  fileId: string;
  isQAImport?: boolean;
}): Promise<{
  rawText: string;
  filename: string;
}> => {
  // read buffer
  const fileBuffer = await MongoRawTextBuffer.findOne({ sourceId: fileId }, undefined, {
    ...readFromSecondary
  }).lean();
  if (fileBuffer) {
    return {
      rawText: fileBuffer.rawText,
      filename: fileBuffer.metadata?.filename || ''
    };
  }

  const [file, fileStream] = await Promise.all([
    getFileById({ bucketName, fileId }),
    getDownloadStream({ bucketName, fileId })
  ]);
  if (!file) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  const extension = parseFileExtensionFromUrl(file?.filename);

  const start = Date.now();
  const fileBuffers = await gridFsStream2Buffer(fileStream);
  addLog.debug('get file buffer', { time: Date.now() - start });

  const encoding = file?.metadata?.encoding || detectFileEncoding(fileBuffers);

  // Get raw text
  const { rawText } = await readRawContentByFileBuffer({
    extension,
    isQAImport,
    teamId,
    buffer: fileBuffers,
    encoding,
    metadata: {
      relatedId: fileId
    }
  });

  // < 14M
  if (fileBuffers.length < 14 * 1024 * 1024 && rawText.trim()) {
    MongoRawTextBuffer.create({
      sourceId: fileId,
      rawText,
      metadata: {
        filename: file.filename
      }
    });
  }

  return {
    rawText,
    filename: file.filename
  };
};
