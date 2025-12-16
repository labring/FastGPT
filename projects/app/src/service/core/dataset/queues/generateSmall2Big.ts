import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { addMinutes } from 'date-fns';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/service/common/bullmq';
import type {
  DatasetTrainingSchemaType,
  small2bigConfigType
} from '@fastgpt/global/core/dataset/type';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { text2Chunks } from '@fastgpt/service/worker/function';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';

const reduceQueue = () => {
  global.small2bigQueueLen = global.small2bigQueueLen > 0 ? global.small2bigQueueLen - 1 : 0;
  return global.small2bigQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel: string };
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
    chunkSize,
    maxChildChunks,
    overlapRatio,
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
      addLog.warn(`[Small2Big] Truncated chunks from ${chunks.length} to ${maxChildChunks}`);
    }

    return limitedChunks.length > 1 ? limitedChunks : [];
  } catch (error) {
    addLog.error(`[Small2Big] Error chunking answer:`, error);
    return [];
  }
};

const processSmall2BigTask = async (data: TrainingDataType) => {
  try {
    const answerText = data.a;

    // 1. 验证 Answer 文本
    if (!answerText || answerText.trim().length === 0) {
      addLog.info(`[Small2Big Queue] Empty answer, converting to chunk mode`);

      // 直接转为 chunk 模式
      await mongoSessionRun(async (session) => {
        await MongoDatasetTraining.updateOne(
          { _id: data._id },
          {
            $set: {
              mode: TrainingModeEnum.chunk,
              lockTime: new Date('2000/1/1')
            }
          },
          { session }
        );
      });
      return;
    }

    const childChunks = await chunkAnswerText({
      answerText,
      small2bigConfig: data.collection?.small2bigConfig
    });

    // Change Mode if chunk less than 1.5 * chunkSize , No index gen
    if (childChunks.length === 0) {
      addLog.debug(
        `[Small2Big Queue] Answer too short for chunking (${answerText.length} chars), converting to chunk mode`
      );

      await mongoSessionRun(async (session) => {
        await MongoDatasetTraining.updateOne(
          { _id: data._id },
          {
            $set: {
              mode: TrainingModeEnum.chunk,
              lockTime: new Date('2000/1/1')
            }
          },
          { session }
        );
      });
      return;
    }

    addLog.info(
      `[Small2Big Queue] Generated ${childChunks.length} child chunks for chunk ${data.chunkIndex} (answer length: ${answerText.length})`
    );

    const originalIndexes = data.indexes || [];
    const small2bigIndexes = childChunks.map((text) => ({
      type: DatasetDataIndexTypeEnum.small2Big,
      text
    }));
    const allIndexes = [...originalIndexes, ...small2bigIndexes];

    await mongoSessionRun(async (session) => {
      await MongoDatasetTraining.deleteOne({ _id: data._id }, { session });

      const nextMode = getTrainingModeByCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.template,
        autoIndexes: data.collection?.autoIndexes,
        imageIndex: false,
        small2bigIndexes: false,
        syntheticIndex: false
      });

      // 创建下一阶段任务（auto 或 chunk）
      await pushDataListToTrainingQueue({
        teamId: data.teamId,
        tmbId: data.tmbId,
        datasetId: data.datasetId,
        collectionId: data.collectionId,
        agentModel: data.dataset.agentModel,
        vectorModel: data.dataset.vectorModel,
        vlmModel: data.dataset.vlmModel,
        indexSize: data.collection.indexSize,
        mode: nextMode,
        billId: data.billId,
        data: [
          {
            q: data.q,
            a: data.a,
            indexes: allIndexes,
            metadata: data.dataMetadata,
            chunkIndex: data.chunkIndex
          }
        ],
        session
      });

      addLog.info(
        `[Small2Big Queue] Successfully processed chunk ${data.chunkIndex} with ${small2bigIndexes.length} small2big indexes, next mode: ${nextMode}`
      );
    });
  } catch (error) {
    addLog.error(`[Small2Big Queue] Error processing task`, error);

    await MongoDatasetTraining.updateOne(
      { _id: data._id },
      {
        $inc: { retryCount: -1 },
        errorMsg: getErrText(error, 'Small2Big processing error'),
        lockTime: new Date('2000/1/1')
      }
    );
  }
};

export async function generateSmall2Big(): Promise<any> {
  addLog.debug(`[Small2Big Training Queue] Size: ${global.small2bigQueueLen}`);

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
        addLog.error(`[Small2Big Queue] Error`, error);
        await delay(500);
        continue;
      }

      if (!data.dataset || !data.collection) {
        addLog.warn(`[Small2Big Queue] Dataset or collection not found`, data);
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }

      addLog.debug(`[Small2Big Queue] Processing chunk: ${data.chunkIndex}`);
      await processSmall2BigTask(data);
      await delay(100);
    }
  } catch (error) {
    addLog.error(`[Small2Big Queue] Error`, error);
  }

  if (reduceQueue()) {
    addLog.info(`[Small2Big Queue] Done`);
  }
  addLog.debug(`[Small2Big Queue] break loop, current queue size: ${global.small2bigQueueLen}`);
}
