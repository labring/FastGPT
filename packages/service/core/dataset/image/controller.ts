import { addMinutes } from 'date-fns';
import { bucketName, MongoDatasetImageSchema } from './schema';
import { connectionMongo, Types } from '../../../common/mongo';
import fs from 'fs';
import type { FileType } from '../../../common/file/multer';
import fsp from 'fs/promises';
import { computeGridFsChunSize } from '../../../common/file/gridfs/utils';
import { setCron } from '../../../common/system/cron';
import { checkTimerLock } from '../../../common/system/timerLock/utils';
import { TimerIdEnum } from '../../../common/system/timerLock/constants';
import { addLog } from '../../../common/system/log';

const getGridBucket = () => {
  return new connectionMongo.mongo.GridFSBucket(connectionMongo.connection.db!, {
    bucketName: bucketName
  });
};

export const createDatasetImage = async ({
  teamId,
  datasetId,
  file,
  expiredTime = addMinutes(new Date(), 30)
}: {
  teamId: string;
  datasetId: string;
  file: FileType;
  expiredTime?: Date;
}): Promise<{ imageId: string; previewUrl: string }> => {
  const path = file.path;
  const gridBucket = getGridBucket();
  const metadata = {
    teamId: String(teamId),
    datasetId: String(datasetId),
    expiredTime
  };

  const stats = await fsp.stat(path);
  if (!stats.isFile()) return Promise.reject(`${path} is not a file`);

  const readStream = fs.createReadStream(path, {
    highWaterMark: 256 * 1024
  });
  const chunkSizeBytes = computeGridFsChunSize(stats.size);

  const stream = gridBucket.openUploadStream(file.originalname, {
    metadata,
    contentType: file.mimetype,
    chunkSizeBytes
  });

  // save to gridfs
  await new Promise((resolve, reject) => {
    readStream
      .pipe(stream as any)
      .on('finish', resolve)
      .on('error', reject);
  });

  return {
    imageId: String(stream.id),
    previewUrl: ''
  };
};

export const getDatasetImageReadData = async (imageId: string) => {
  // Get file metadata to get contentType
  const fileInfo = await MongoDatasetImageSchema.findOne({
    _id: new Types.ObjectId(imageId)
  }).lean();
  if (!fileInfo) {
    return Promise.reject('Image not found');
  }

  const gridBucket = getGridBucket();
  return {
    stream: gridBucket.openDownloadStream(new Types.ObjectId(imageId)),
    fileInfo
  };
};
export const getDatasetImageBase64 = async (imageId: string) => {
  // Get file metadata to get contentType
  const fileInfo = await MongoDatasetImageSchema.findOne({
    _id: new Types.ObjectId(imageId)
  }).lean();
  if (!fileInfo) {
    return Promise.reject('Image not found');
  }

  // Get image stream from GridFS
  const { stream } = await getDatasetImageReadData(imageId);

  // Convert stream to buffer
  const chunks: Buffer[] = [];

  return new Promise<string>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stream.on('end', () => {
      // Combine all chunks into a single buffer
      const buffer = Buffer.concat(chunks);
      // Convert buffer to base64 string
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${fileInfo.contentType || 'image/jpeg'};base64,${base64}`;
      resolve(dataUrl);
    });

    stream.on('error', reject);
  });
};

export const deleteDatasetImage = async (imageId: string) => {
  const gridBucket = getGridBucket();

  try {
    await gridBucket.delete(new Types.ObjectId(imageId));
  } catch (error: any) {
    const msg = error?.message;
    if (msg.includes('File not found')) {
      addLog.warn('Delete dataset image error', error);
      return;
    } else {
      return Promise.reject(error);
    }
  }
};

export const clearExpiredDatasetImageCron = async () => {
  const gridBucket = getGridBucket();
  const clearExpiredDatasetImages = async () => {
    addLog.debug('Clear expired dataset image start');

    const data = await MongoDatasetImageSchema.find(
      {
        'metadata.expiredTime': { $lt: new Date() }
      },
      '_id'
    ).lean();

    for (const item of data) {
      try {
        await gridBucket.delete(item._id);
      } catch (error) {
        addLog.error('Delete expired dataset image error', error);
      }
    }
    addLog.debug('Clear expired dataset image end');
  };

  setCron('*/10 * * * *', async () => {
    if (
      await checkTimerLock({
        timerId: TimerIdEnum.clearExpiredDatasetImage,
        lockMinuted: 9
      })
    ) {
      try {
        await clearExpiredDatasetImages();
      } catch (error) {
        addLog.error('clearExpiredDatasetImageCron error', error);
      }
    }
  });
};
