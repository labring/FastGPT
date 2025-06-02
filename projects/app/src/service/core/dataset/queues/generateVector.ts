import { insertData2Dataset } from '@/service/core/dataset/data/controller';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  deleteDatasetDataVector,
  insertDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import type { Document } from '@fastgpt/service/common/mongo';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getMaxIndexSize } from '@fastgpt/global/core/dataset/training/utils';

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;

  return global.vectorQueueLen === 0;
};
const reduceQueueAndReturn = (delay = 0) => {
  reduceQueue();
  if (delay) {
    setTimeout(() => {
      generateVector();
    }, delay);
  } else {
    generateVector();
  }
};

/* 索引生成队列。每导入一次，就是一个单独的线程 */
export async function generateVector(): Promise<any> {
  const max = global.systemEnv?.vectorMaxProcess || 10;
  addLog.debug(`[Vector Queue] Queue size: ${global.vectorQueueLen}`);

  if (global.vectorQueueLen >= max) return;
  global.vectorQueueLen++;
  const start = Date.now();

  // get training data
  const {
    data,
    done = false,
    error = false
  } = await (async () => {
    try {
      const data = await MongoDatasetTraining.findOneAndUpdate(
        {
          mode: TrainingModeEnum.chunk,
          retryCount: { $gt: 0 },
          lockTime: { $lte: addMinutes(new Date(), -3) }
        },
        {
          lockTime: new Date(),
          $inc: { retryCount: -1 }
        }
      );

      // task preemption
      if (!data) {
        return {
          done: true
        };
      }
      return {
        data
      };
    } catch (error) {
      addLog.error(`Get Training Data error`, error);
      return {
        error: true
      };
    }
  })();

  if (done || !data) {
    if (reduceQueue()) {
      addLog.info(`[Vector Queue] Done`);
    }
    return;
  }
  if (error) {
    addLog.error(`[Vector Queue] Error`, { error });
    return reduceQueueAndReturn();
  }

  // auth balance
  if (!(await checkTeamAiPointsAndLock(data.teamId))) {
    return reduceQueueAndReturn();
  }

  addLog.info(`[Vector Queue] Start`);

  try {
    const { tokens } = await (async () => {
      if (data.dataId) {
        return rebuildData({ trainingData: data });
      } else {
        return insertData({ trainingData: data });
      }
    })();

    // push usage
    pushGenerateVectorUsage({
      teamId: data.teamId,
      tmbId: data.tmbId,
      inputTokens: tokens,
      model: data.model,
      billId: data.billId
    });

    addLog.info(`[Vector Queue] Finish`, {
      time: Date.now() - start
    });

    return reduceQueueAndReturn();
  } catch (err: any) {
    addLog.error(`[Vector Queue] Error`, err);
    await MongoDatasetTraining.updateOne(
      {
        teamId: data.teamId,
        datasetId: data.datasetId,
        _id: data._id
      },
      {
        errorMsg: getErrText(err, 'unknown error')
      }
    );
    return reduceQueueAndReturn(1000);
  }
}

const rebuildData = async ({
  trainingData
}: {
  trainingData: Document<unknown, {}, DatasetTrainingSchemaType> &
    Omit<
      DatasetTrainingSchemaType &
        Required<{
          _id: string;
        }>,
      never
    >;
}) => {
  // find data
  const mongoData = await MongoDatasetData.findById(
    trainingData.dataId,
    'indexes teamId datasetId collectionId'
  );

  if (!mongoData) {
    await trainingData.deleteOne();
    return Promise.reject('Not data');
  }

  const deleteVectorIdList = mongoData.indexes.map((index) => index.dataId);

  // Find next rebuilding data to insert training queue
  await mongoSessionRun(async (session) => {
    // get new mongoData insert to training
    const newRebuildingData = await MongoDatasetData.findOneAndUpdate(
      {
        rebuilding: true,
        teamId: mongoData.teamId,
        datasetId: mongoData.datasetId
      },
      {
        $unset: {
          rebuilding: null
        },
        updateTime: new Date()
      },
      { session }
    ).select({
      _id: 1,
      collectionId: 1
    });

    if (newRebuildingData) {
      await MongoDatasetTraining.create(
        [
          {
            teamId: mongoData.teamId,
            tmbId: trainingData.tmbId,
            datasetId: mongoData.datasetId,
            collectionId: newRebuildingData.collectionId,
            billId: trainingData.billId,
            mode: TrainingModeEnum.chunk,
            model: trainingData.model,
            dataId: newRebuildingData._id,
            retryCount: 50
          }
        ],
        { session, ordered: true }
      );
    }
  });

  // update vector, update dataset_data rebuilding status, delete data from training
  // 1. Insert new vector to dataset_data
  const updateResult: {
    tokens: number;
    insertId: string;
  }[] = [];
  let i = 0;
  for await (const index of mongoData.indexes) {
    const result = await insertDatasetDataVector({
      query: index.text,
      model: getEmbeddingModel(trainingData.model),
      teamId: mongoData.teamId,
      datasetId: mongoData.datasetId,
      collectionId: mongoData.collectionId
    });
    mongoData.indexes[i].dataId = result.insertId;
    updateResult.push(result);
    i++;
  }

  const { tokens } = await mongoSessionRun(async (session) => {
    // 2. Ensure that the training data is deleted after the Mongo update is successful
    await mongoData.save({ session });
    // 3. Delete the training data
    await trainingData.deleteOne({ session });

    // 4. Delete old vector
    await deleteDatasetDataVector({
      teamId: mongoData.teamId,
      idList: deleteVectorIdList
    });

    return {
      tokens: updateResult.reduce((acc, cur) => acc + cur.tokens, 0)
    };
  });

  return { tokens };
};

const insertData = async ({
  trainingData
}: {
  trainingData: Document<unknown, {}, DatasetTrainingSchemaType> &
    Omit<
      DatasetTrainingSchemaType &
        Required<{
          _id: string;
        }>,
      never
    >;
}) => {
  const { tokens } = await mongoSessionRun(async (session) => {
    // insert new data to dataset
    const { tokens } = await insertData2Dataset({
      teamId: trainingData.teamId,
      tmbId: trainingData.tmbId,
      datasetId: trainingData.datasetId,
      collectionId: trainingData.collectionId,
      q: trainingData.q,
      a: trainingData.a,
      imageId: trainingData.imageId,
      chunkIndex: trainingData.chunkIndex,
      indexSize: trainingData.indexSize || getMaxIndexSize(getEmbeddingModel(trainingData.model)),
      indexes: trainingData.indexes,
      embeddingModel: trainingData.model,
      session
    });
    // delete data from training
    await trainingData.deleteOne({ session });

    return {
      tokens
    };
  });

  return { tokens };
};
