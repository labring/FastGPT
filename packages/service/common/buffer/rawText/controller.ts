import { retryFn } from '@fastgpt/global/common/system/utils';
import { connectionMongo } from '../../mongo';
import { MongoRawTextBufferSchema, bucketName } from './schema';
import { addLog } from '../../system/log';
import { setCron } from '../../system/cron';
import { checkTimerLock } from '../../system/timerLock/utils';
import { TimerIdEnum } from '../../system/timerLock/constants';
import { gridFsStream2Buffer } from '../../file/gridfs/utils';
import { readRawContentFromBuffer } from '../../../worker/function';

const getGridBucket = () => {
  return new connectionMongo.mongo.GridFSBucket(connectionMongo.connection.db!, {
    bucketName: bucketName
  });
};

export const addRawTextBuffer = async ({
  sourceId,
  sourceName,
  text,
  expiredTime
}: {
  sourceId: string;
  sourceName: string;
  text: string;
  expiredTime: Date;
}) => {
  const gridBucket = getGridBucket();
  const metadata = {
    sourceId,
    sourceName,
    expiredTime
  };

  const buffer = Buffer.from(text);

  const fileSize = buffer.length;
  // 单块大小：尽可能大，但不超过 14MB，不小于128KB
  const chunkSizeBytes = (() => {
    // 计算理想块大小：文件大小 ÷ 目标块数(10)。 并且每个块需要小于 14MB
    const idealChunkSize = Math.min(Math.ceil(fileSize / 10), 14 * 1024 * 1024);

    // 确保块大小至少为128KB
    const minChunkSize = 128 * 1024; // 128KB

    // 取理想块大小和最小块大小中的较大值
    let chunkSize = Math.max(idealChunkSize, minChunkSize);

    // 将块大小向上取整到最接近的64KB的倍数，使其更整齐
    chunkSize = Math.ceil(chunkSize / (64 * 1024)) * (64 * 1024);

    return chunkSize;
  })();

  const uploadStream = gridBucket.openUploadStream(sourceId, {
    metadata,
    chunkSizeBytes
  });

  return retryFn(async () => {
    return new Promise((resolve, reject) => {
      uploadStream.end(buffer);
      uploadStream.on('finish', () => {
        resolve(uploadStream.id);
      });
      uploadStream.on('error', (error) => {
        addLog.error('addRawTextBuffer error', error);
        resolve('');
      });
    });
  });
};

export const getRawTextBuffer = async (sourceId: string) => {
  const gridBucket = getGridBucket();

  return retryFn(async () => {
    const bufferData = await MongoRawTextBufferSchema.findOne(
      {
        'metadata.sourceId': sourceId
      },
      '_id metadata'
    ).lean();
    if (!bufferData) {
      return null;
    }

    // Read file content
    const downloadStream = gridBucket.openDownloadStream(bufferData._id);

    const fileBuffers = await gridFsStream2Buffer(downloadStream);

    const rawText = await (async () => {
      if (fileBuffers.length < 10000000) {
        return fileBuffers.toString('utf8');
      } else {
        return (
          await readRawContentFromBuffer({
            extension: 'txt',
            encoding: 'utf8',
            buffer: fileBuffers
          })
        ).rawText;
      }
    })();

    return {
      text: rawText,
      sourceName: bufferData.metadata?.sourceName || ''
    };
  });
};

export const deleteRawTextBuffer = async (sourceId: string): Promise<boolean> => {
  const gridBucket = getGridBucket();

  return retryFn(async () => {
    const buffer = await MongoRawTextBufferSchema.findOne({ 'metadata.sourceId': sourceId });
    if (!buffer) {
      return false;
    }

    await gridBucket.delete(buffer._id);
    return true;
  });
};

export const updateRawTextBufferExpiredTime = async ({
  sourceId,
  expiredTime
}: {
  sourceId: string;
  expiredTime: Date;
}) => {
  return retryFn(async () => {
    return MongoRawTextBufferSchema.updateOne(
      { 'metadata.sourceId': sourceId },
      { $set: { 'metadata.expiredTime': expiredTime } }
    );
  });
};

export const clearExpiredRawTextBufferCron = async () => {
  const gridBucket = getGridBucket();

  const clearExpiredRawTextBuffer = async () => {
    addLog.debug('Clear expired raw text buffer start');

    const data = await MongoRawTextBufferSchema.find(
      {
        'metadata.expiredTime': { $lt: new Date() }
      },
      '_id'
    ).lean();

    for (const item of data) {
      try {
        await gridBucket.delete(item._id);
      } catch (error) {
        addLog.error('Delete expired raw text buffer error', error);
      }
    }
    addLog.debug('Clear expired raw text buffer end');
  };

  setCron('*/10 * * * *', async () => {
    if (
      await checkTimerLock({
        timerId: TimerIdEnum.clearExpiredRawTextBuffer,
        lockMinuted: 9
      })
    ) {
      try {
        await clearExpiredRawTextBuffer();
      } catch (error) {
        addLog.error('clearExpiredRawTextBufferCron error', error);
      }
    }
  });
};
