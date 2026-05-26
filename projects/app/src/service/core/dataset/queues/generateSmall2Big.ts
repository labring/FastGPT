import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { addMinutes } from 'date-fns';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/service/common/bullmq';
import type {
  DatasetTrainingSchemaType,
  small2bigConfigType
} from '@fastgpt/global/core/dataset/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { text2Chunks } from '@fastgpt/service/worker/function';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';

const logger = getLogger(LogCategories.MODULE.DATASET.SMALL2BIG);

const reduceQueue = () => {
  global.small2bigQueueLen = global.small2bigQueueLen > 0 ? global.small2bigQueueLen - 1 : 0;
  return global.small2bigQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel?: string };
  collection: {
    small2bigConfig?: small2bigConfigType;
    indexSize?: number;
    autoIndexes?: boolean;
  };
};

type TrainingDataType = DatasetTrainingSchemaType & PopulateType;

// Truncate Answer chunks
const chunkAnswerText = async ({
  answerText,
  small2bigConfig = {
    chunkSize: 500,
    maxChildChunks: 10,
    overlapRatio: 0.1
  } as small2bigConfigType
}: {
  answerText: string;
  small2bigConfig?: small2bigConfigType;
}): Promise<string[]> => {
  const {
    chunkSize = 500,
    maxChildChunks = 10,
    overlapRatio = 0.1,
    paragraphChunkDeep,
    paragraphChunkMinSize,
    maxSize,
    customReg
  } = small2bigConfig;
  if (!answerText || answerText.trim().length === 0) {
    return [];
  }

  // while Answer.length < chunkSize * 1.5, Truncate will generate useless chunk
  if (answerText.length <= chunkSize * 1.5) {
    return [];
  }

  try {
    const { chunks } = await text2Chunks({
      text: answerText,
      chunkSize: chunkSize,
      overlapRatio: overlapRatio,
      paragraphChunkDeep: paragraphChunkDeep,
      paragraphChunkMinSize: paragraphChunkMinSize,
      maxSize: maxSize,
      customReg: customReg
    });

    // Limit the maximum number of sub-blocks to avoid excessive Answer length and storage pressure
    const limitedChunks = chunks.slice(0, maxChildChunks);

    if (limitedChunks.length < chunks.length) {
      logger.warn('Small2Big truncated chunks', {
        originalCount: chunks.length,
        maxChildChunks
      });
    }

    return limitedChunks.length > 1 ? limitedChunks : [];
  } catch (error) {
    logger.error('Small2Big chunking answer failed', { error });
    return [];
  }
};

const processSmall2BigTask = async (data: TrainingDataType) => {
  const startTime = Date.now();
  try {
    const answerText = data.a;
    // answer为空，或者 长度<chunkSize，进入下一阶段

    const childChunks = await chunkAnswerText({
      answerText,
      small2bigConfig: data.collection?.small2bigConfig
    });

    logger.debug('Small2Big generated child chunks', {
      chunkIndex: data.chunkIndex,
      answerLength: answerText.length,
      childChunksCount: childChunks.length,
      chunkingTimeMs: Date.now() - startTime
    });

    const originalIndexes = data.indexes || [];
    const small2bigIndexes = childChunks.map((text) => ({
      type: DatasetDataIndexTypeEnum.small2Big,
      text
    }));
    const allIndexes = [...originalIndexes, ...small2bigIndexes];

    await mongoSessionRun(async (session) => {
      const nextMode = getTrainingModeByCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.template,
        autoIndexes: data.collection?.autoIndexes,
        imageIndex: false,
        small2bigIndexes: false
      });

      // 更新当前训练记录到下一阶段
      await MongoDatasetTraining.updateOne(
        { _id: data._id },
        {
          $set: {
            mode: nextMode,
            retryCount: 5,
            indexes: allIndexes,
            lockTime: new Date('2000/1/1')
          }
        },
        { session }
      );

      logger.debug('Small2Big processed chunk', {
        totalTimeMs: Date.now() - startTime,
        chunkIndex: data.chunkIndex,
        small2bigIndexesCount: small2bigIndexes.length,
        nextMode
      });
    });
  } catch (error) {
    logger.error('Small2Big processing task failed', {
      error,
      timeMs: Date.now() - startTime
    });

    await MongoDatasetTraining.updateOne(
      { _id: data._id },
      {
        errorMsg: getErrText(error, 'Small2Big processing error'),
        lockTime: new Date('2000/1/1')
      }
    );
  }
};

export async function generateSmall2Big(): Promise<any> {
  logger.debug('Small2Big queue size check', { queueSize: global.small2bigQueueLen });

  const max = global.systemEnv?.qaMaxProcess || 10;
  if (global.small2bigQueueLen >= max) return;
  global.small2bigQueueLen++;

  try {
    while (true) {
      const {
        data,
        done = false,
        error = false
      } = await (async () => {
        try {
          const data = await MongoDatasetTraining.findOneAndUpdate(
            {
              mode: TrainingModeEnum.small2Big,
              retryCount: { $gt: 0 },
              lockTime: { $lte: addMinutes(new Date(), -3) }
            },
            {
              lockTime: new Date(),
              $inc: { retryCount: -1 }
            }
          )
            .populate<PopulateType>([
              {
                path: 'dataset',
                select: 'vectorModel agentModel vlmModel'
              },
              {
                path: 'collection',
                select: 'small2bigConfig indexSize autoIndexes'
              }
            ])
            .lean();

          if (!data) {
            return { done: true };
          }
          return { data };
        } catch (error) {
          return { error: true };
        }
      })();

      // Break loop
      if (done || !data) {
        break;
      }
      if (error) {
        logger.error('Small2Big queue fetch task failed', { error });
        await delay(500);
        continue;
      }

      if (!data.dataset || !data.collection) {
        logger.warn('Small2Big queue task skipped: dataset or collection missing', {
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          trainingId: data._id
        });
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }

      logger.debug('Small2Big processing chunk', { chunkIndex: data.chunkIndex });
      await processSmall2BigTask(data);
      await delay(100);
    }
  } catch (error) {
    logger.error('Small2Big queue loop failed', { error });
  }

  if (reduceQueue()) {
    logger.info('Small2Big queue drained', { queueSize: global.small2bigQueueLen });
  }
  logger.debug('Small2Big queue loop exit', { queueSize: global.small2bigQueueLen });
}
