import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { rebuildableDatasetDataMatch } from '@fastgpt/global/core/dataset/data/utils';
import { isDatasetSynonymEnabled } from '@fastgpt/service/core/dataset/synonym/entity';

type DatasetRebuildContext = {
  teamId: string;
  tmbId: string;
  datasetId: string;
  billId: string;
  synonymVersion?: number;
};

/**
 * 原子领取一条处于 rebuildIndexPending 的 data，并写入现有 training 队列。
 * 模型切换和同义词更新都只创建 rebuild 阶段，索引内容由 worker 从 data 读取。
 */
export const enqueueNextDatasetRebuildTask = async (
  context: DatasetRebuildContext,
  session?: ClientSession
) => {
  if (context.synonymVersion && !isDatasetSynonymEnabled()) return false;

  const enqueue = async (session: ClientSession) => {
    while (true) {
      const data = await MongoDatasetData.findOneAndUpdate(
        context.synonymVersion
          ? {
              teamId: context.teamId,
              datasetId: context.datasetId,
              synonymVersion: { $ne: context.synonymVersion },
              synonymRebuildingVersion: { $ne: context.synonymVersion },
              // 待索引数据不参与同义词重建：其向量必然按处理时刻的词表生成，
              // 选中会与在途任务争抢同一 dataId。
              ...rebuildableDatasetDataMatch
            }
          : {
              indexStatus: DatasetDataIndexStatusEnum.rebuildIndexPending,
              teamId: context.teamId,
              datasetId: context.datasetId
            },
        context.synonymVersion
          ? {
              $set: {
                indexStatus: DatasetDataIndexStatusEnum.rebuildIndexRunning,
                synonymRebuildingVersion: context.synonymVersion,
                updateTime: new Date()
              }
            }
          : {
              $set: {
                indexStatus: DatasetDataIndexStatusEnum.rebuildIndexRunning,
                updateTime: new Date()
              }
            },
        { session }
      ).select({
        _id: 1,
        collectionId: 1,
        chunkIndex: 1
      });
      if (!data) return false;

      const collection = await MongoDatasetCollection.findById(data.collectionId)
        .select('_id')
        .session(session);
      if (!collection) {
        await MongoDatasetData.updateOne(
          { _id: data._id },
          { $set: { indexStatus: DatasetDataIndexStatusEnum.indexed } },
          { session }
        );
        // collection 可能处于删除中间态；同义词重建只需跳过入队，不能删除业务 data。
        if (context.synonymVersion) {
          await MongoDatasetData.updateOne(
            { _id: data._id },
            {
              $set: { synonymVersion: context.synonymVersion },
              $unset: { synonymRebuildingVersion: '' }
            },
            { session }
          );
        }
        continue;
      }

      await MongoDatasetTraining.create(
        [
          {
            teamId: context.teamId,
            tmbId: context.tmbId,
            datasetId: context.datasetId,
            collectionId: data.collectionId,
            billId: context.billId,
            mode: TrainingModeEnum.rebuild,
            ...(context.synonymVersion && { synonymVersion: context.synonymVersion }),
            ...(context.synonymVersion && { expireAt: null }),
            dataId: data._id,
            chunkIndex: data.chunkIndex,
            retryCount: 3
          }
        ],
        { session, ordered: true }
      );
      return true;
    }
  };

  return session ? enqueue(session) : mongoSessionRun(enqueue);
};

/**
 * 创建受 vector worker 并发上限约束的种子任务，后续任务由 worker 链式补充。
 * 传入 session 时与调用方的待重建状态原子提交，避免只留下标记而没有任务。
 */
export const seedDatasetRebuildTasks = async (
  context: DatasetRebuildContext,
  session?: ClientSession
) => {
  const seed = async (session: ClientSession) => {
    const seedCount = (global.systemEnv?.vectorMaxProcess ?? 10) * 2;
    let createdCount = 0;
    for (let i = 0; i < seedCount; i++) {
      if (!(await enqueueNextDatasetRebuildTask(context, session))) break;
      createdCount += 1;
    }
    return createdCount;
  };

  if (session) return seed(session);

  const seedCount = (global.systemEnv?.vectorMaxProcess ?? 10) * 2;
  let createdCount = 0;
  for (let i = 0; i < seedCount; i++) {
    try {
      if (!(await enqueueNextDatasetRebuildTask(context))) break;
      createdCount += 1;
    } catch {}
  }
  return createdCount;
};
