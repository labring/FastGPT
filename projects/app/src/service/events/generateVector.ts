import { insertData2Dataset } from '@/service/core/dataset/data/controller';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkTeamAiPointsAndLock } from './utils';
import { checkInvalidChunkAndLock } from '@fastgpt/service/core/dataset/training/utils';
import { addMinutes } from 'date-fns';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  deleteDatasetDataVector,
  insertDatasetDataVector
} from '@fastgpt/service/common/vectorStore/controller';
import { getVectorModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { Document } from '@fastgpt/service/common/mongo';

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;

  return global.vectorQueueLen === 0;
};

/* 索引生成队列。每导入一次，就是一个单独的线程 */
export async function generateVector(): Promise<any> {
  const max = global.systemEnv?.vectorMaxProcess || 10;
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
          lockTime: { $lte: addMinutes(new Date(), -1) }
        },
        {
          lockTime: new Date()
        }
      ).select({
        _id: 1,
        teamId: 1,
        tmbId: 1,
        datasetId: 1,
        collectionId: 1,
        q: 1,
        a: 1,
        chunkIndex: 1,
        dataId: 1,
        indexes: 1,
        model: 1,
        billId: 1
      });

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
    reduceQueue();
    return generateVector();
  }

  // auth balance
  if (!(await checkTeamAiPointsAndLock(data.teamId))) {
    reduceQueue();
    return generateVector();
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
      tokens,
      model: data.model,
      billId: data.billId
    });

    addLog.info(`[Vector Queue] Finish`, {
      time: Date.now() - start
    });

    reduceQueue();
    generateVector();
  } catch (err: any) {
    addLog.error(`[Vector Queue] Error`, err);
    reduceQueue();

    if (await checkInvalidChunkAndLock({ err, data, errText: '向量模型调用失败' })) {
      return generateVector();
    }

    setTimeout(() => {
      generateVector();
    }, 1000);
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
        teamId: mongoData.teamId,
        datasetId: mongoData.datasetId,
        rebuilding: true
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
            dataId: newRebuildingData._id
          }
        ],
        { session }
      );
    }
  });

  // update vector, update dataset_data rebuilding status, delete data from training
  // 1. Insert new vector to dataset_data
  const updateResult = await Promise.all(
    mongoData.indexes.map(async (index, i) => {
      const result = await insertDatasetDataVector({
        query: index.text,
        model: getVectorModel(trainingData.model),
        teamId: mongoData.teamId,
        datasetId: mongoData.datasetId,
        collectionId: mongoData.collectionId
      });
      mongoData.indexes[i].dataId = result.insertId;
      return result;
    })
  );
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
      chunkIndex: trainingData.chunkIndex,
      indexes: trainingData.indexes,
      model: trainingData.model,
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
