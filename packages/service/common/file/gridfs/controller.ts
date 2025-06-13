import { Types, connectionMongo, ReadPreference } from '../../mongo';
import type { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import fsp from 'fs/promises';
import fs from 'fs';
import { type DatasetFileSchema } from '@fastgpt/global/core/dataset/type';
import { MongoChatFileSchema, MongoDatasetFileSchema } from './schema';
import { detectFileEncoding, detectFileEncodingByPath } from '@fastgpt/global/common/file/tools';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { readRawContentByFileBuffer } from '../read/utils';
import { computeGridFsChunSize, gridFsStream2Buffer, stream2Encoding } from './utils';
import { addLog } from '../../system/log';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { Readable } from 'stream';
import { addRawTextBuffer, getRawTextBuffer } from '../../buffer/rawText/controller';
import { addMinutes } from 'date-fns';
import { retryFn } from '@fastgpt/global/common/system/utils';

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
  fileIdList
}: {
  bucketName: `${BucketNameEnum}`;
  fileIdList: string[];
}): Promise<any> {
  return retryFn(async () => {
    const bucket = getGridBucket(bucketName);

    for await (const fileId of fileIdList) {
      try {
        await bucket.delete(new Types.ObjectId(String(fileId)));
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

export const readFileContentFromMongo = async ({
  teamId,
  tmbId,
  bucketName,
  fileId,
  customPdfParse = false,
  getFormatText
}: {
  teamId: string;
  tmbId: string;
  bucketName: `${BucketNameEnum}`;
  fileId: string;
  customPdfParse?: boolean;
  getFormatText?: boolean; // 数据类型都尽可能转化成 markdown 格式
}): Promise<{
  rawText: string;
  filename: string;
}> => {
  const bufferId = `${String(fileId)}-${customPdfParse}`;
  // read buffer
  const fileBuffer = await getRawTextBuffer(bufferId);
  if (fileBuffer) {
    return {
      rawText: fileBuffer.text,
      filename: fileBuffer?.sourceName
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
    customPdfParse,
    getFormatText,
    extension,
    teamId,
    tmbId,
    buffer: fileBuffers,
    encoding,
    metadata: {
      relatedId: fileId
    }
  });

  // Add buffer
  addRawTextBuffer({
    sourceId: bufferId,
    sourceName: file.filename,
    text: rawText,
    expiredTime: addMinutes(new Date(), 20)
  });

  return {
    rawText,
    filename: file.filename
  };
};
