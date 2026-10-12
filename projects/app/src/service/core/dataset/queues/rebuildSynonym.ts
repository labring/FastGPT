import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { rebuildableDatasetDataMatch } from '@fastgpt/global/core/dataset/data/utils';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { isDatasetSynonymEnabled } from '@fastgpt/service/core/dataset/synonym/entity';

type SynonymRebuildContext = Pick<
  DatasetTrainingSchemaType,
  'teamId' | 'tmbId' | 'datasetId' | 'billId'
>;

/**
 * 原子领取同义词待重建数据并创建独立 training，不在任务中保存词表版本。
 * 词表版本从当前配置读取，仅写入 data 的领取标记；已入队或失败的数据不会再次被领取。
 * 删除词表仍保留递增版本的配置，需重建为未经同义词转换的原始索引。
 */
export const enqueueNextDatasetSynonymRebuildTask = async (
  context: SynonymRebuildContext,
  session?: ClientSession
) => {
  if (!isDatasetSynonymEnabled()) return false;
  const enqueue = async (session: ClientSession) => {
    const config = await MongoDatasetSynonym.findOne({
      teamId: context.teamId,
      datasetId: context.datasetId
    })
      .select('version')
      .session(session)
      .lean();
    if (!config) throw new Error('同义词配置不存在，无法继续重建');
    while (true) {
      const data = await MongoDatasetData.findOneAndUpdate(
        {
          teamId: context.teamId,
          datasetId: context.datasetId,
          $or: [
            { indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymPending },
            // 兼容迁移前的版本领取链路：旧轮次未入队的数据尚无 Pending 状态。
            // 每次仅领取一条，避免迁移时在单事务中更新整个知识库。
            {
              synonymVersion: { $ne: config.version },
              synonymRebuildingVersion: { $ne: config.version },
              ...rebuildableDatasetDataMatch
            }
          ]
        },
        {
          $set: {
            indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymRunning,
            synonymRebuildingVersion: config.version,
            updateTime: new Date()
          }
        },
        { session }
      ).select('_id collectionId chunkIndex');
      if (!data) return false;
      const collection = await MongoDatasetCollection.exists({ _id: data.collectionId }).session(
        session
      );
      if (!collection) {
        // 集合删除中间态只跳过入队，数据的删除由集合清理负责。
        await MongoDatasetData.updateOne(
          { _id: data._id },
          {
            $set: {
              indexStatus: DatasetDataIndexStatusEnum.indexed,
              synonymVersion: config.version
            },
            $unset: { synonymRebuildingVersion: '' }
          },
          { session }
        );
        continue;
      }
      await MongoDatasetTraining.create(
        [
          {
            ...context,
            collectionId: data.collectionId,
            mode: TrainingModeEnum.rebuildSynonym,
            expireAt: null,
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

/** 创建同义词重建首批任务，后续由同义词 Worker 续接；与词表和待重建状态同事务提交。 */
export const seedDatasetSynonymRebuildTasks = async (
  context: SynonymRebuildContext,
  session?: ClientSession
) => {
  const seed = async (session: ClientSession) => {
    const seedCount = (global.systemEnv?.vectorMaxProcess ?? 10) * 2;
    let createdCount = 0;
    for (let i = 0; i < seedCount; i++) {
      if (!(await enqueueNextDatasetSynonymRebuildTask(context, session))) break;
      createdCount += 1;
    }
    return createdCount;
  };
  return session ? seed(session) : mongoSessionRun(seed);
};
