import { Types, connectionMongo } from '../../mongo';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import fsp from 'fs/promises';
import fs from 'fs';
import { DatasetFileSchema } from '@fastgpt/global/core/dataset/type';
import { MongoFileSchema } from './schema';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { readFileRawText } from '../read/rawText';
import { ReadFileByBufferParams } from '../read/type';
import { readMarkdown } from '../read/markdown';
import { readHtmlRawText } from '../read/html';
import { readPdfFile } from '../read/pdf';
import { readWordFile } from '../read/word';
import { readCsvRawText } from '../read/csv';
import { MongoRwaTextBuffer } from '../../buffer/rawText/schema';
import { readPptxRawText } from '../read/pptx';
import { readXlsxRawText } from '../read/xlsx';

export function getGFSCollection(bucket: `${BucketNameEnum}`) {
  MongoFileSchema;
  return connectionMongo.connection.db.collection(`${bucket}.files`);
}
export function getGridBucket(bucket: `${BucketNameEnum}`) {
  return new connectionMongo.mongo.GridFSBucket(connectionMongo.connection.db, {
    bucketName: bucket
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

  metadata.teamId = teamId;
  metadata.tmbId = tmbId;

  // create a gridfs bucket
  const bucket = getGridBucket(bucketName);

  const stream = bucket.openUploadStream(filename, {
    metadata,
    contentType
  });

  // save to gridfs
  await new Promise((resolve, reject) => {
    fs.createReadStream(path)
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

    await Promise.all(fileIdList.map((id) => bucket.delete(new Types.ObjectId(id))));
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

export const readFileEncode = async ({
  bucketName,
  fileId
}: {
  bucketName: `${BucketNameEnum}`;
  fileId: string;
}) => {
  const encodeStream = await getDownloadStream({ bucketName, fileId });
  let buffers: Buffer = Buffer.from([]);
  for await (const chunk of encodeStream) {
    buffers = Buffer.concat([buffers, chunk]);
    if (buffers.length > 10) {
      encodeStream.abort();
      break;
    }
  }

  const encoding = detectFileEncoding(buffers);

  return encoding as BufferEncoding;
};

export const readFileContent = async ({
  teamId,
  bucketName,
  fileId,
  csvFormat = false
}: {
  teamId: string;
  bucketName: `${BucketNameEnum}`;
  fileId: string;
  csvFormat?: boolean;
}): Promise<{
  rawText: string;
  filename: string;
}> => {
  // read buffer
  const fileBuffer = await MongoRwaTextBuffer.findOne({ sourceId: fileId }).lean();
  if (fileBuffer) {
    return {
      rawText: fileBuffer.rawText,
      filename: fileBuffer.metadata?.filename || ''
    };
  }

  const [file, encoding, fileStream] = await Promise.all([
    getFileById({ bucketName, fileId }),
    readFileEncode({ bucketName, fileId }),
    getDownloadStream({ bucketName, fileId })
  ]);

  if (!file) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  const extension = file?.filename?.split('.')?.pop()?.toLowerCase() || '';

  const fileBuffers = await (() => {
    return new Promise<Buffer>((resolve, reject) => {
      let buffers = Buffer.from([]);
      fileStream.on('data', (chunk) => {
        buffers = Buffer.concat([buffers, chunk]);
      });
      fileStream.on('end', () => {
        resolve(buffers);
      });
      fileStream.on('error', (err) => {
        reject(err);
      });
    });
  })();

  const params: ReadFileByBufferParams = {
    teamId,
    buffer: fileBuffers,
    encoding,
    metadata: {
      relatedId: fileId
    }
  };

  const { rawText } = await (async () => {
    switch (extension) {
      case 'txt':
        return readFileRawText(params);
      case 'md':
        return readMarkdown(params);
      case 'html':
        return readHtmlRawText(params);
      case 'pdf':
        return readPdfFile(params);
      case 'docx':
        return readWordFile(params);
      case 'pptx':
        return readPptxRawText(params);
      case 'xlsx':
        const xlsxResult = await readXlsxRawText(params);
        if (csvFormat) {
          return {
            rawText: xlsxResult.formatText || ''
          };
        }
        return {
          rawText: xlsxResult.rawText
        };
      case 'csv':
        const csvResult = await readCsvRawText(params);
        if (csvFormat) {
          return {
            rawText: csvResult.formatText || ''
          };
        }
        return {
          rawText: csvResult.rawText
        };
      default:
        return Promise.reject('Only support .txt, .md, .html, .pdf, .docx, pptx, .csv, .xlsx');
    }
  })();

  if (rawText.trim()) {
    await MongoRwaTextBuffer.create({
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
