import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  getDatasetImageIndexCapability,
  getDatasetImageTrainingMode
} from '@fastgpt/service/core/dataset/utils';
import { uniqueDatasetDataMarkdownImageUrls } from '@fastgpt/service/core/dataset/data/utils';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import { isDatasetSynonymEnabled } from '@fastgpt/service/core/dataset/synonym/entity';

type DatasetRebuildContext = {
  teamId: string;
  tmbId: string;
  datasetId: string;
  billId: string;
  vectorModel: EmbeddingSystemModelDataType;
  vlmModel?: LLMSystemModelDataType;
  synonymVersion?: number;
};

/**
 * 原子领取一条标记为 rebuilding 的 data，并写入现有 training 队列。
 * 模型切换和同义词更新共用相同的图片/VLM 分流与任务结构。
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
              synonymRebuildingVersion: { $ne: context.synonymVersion }
            }
          : {
              rebuilding: true,
              teamId: context.teamId,
              datasetId: context.datasetId
            },
        context.synonymVersion
          ? {
              $set: {
                synonymRebuildingVersion: context.synonymVersion,
                updateTime: new Date()
              }
            }
          : {
              $unset: { rebuilding: '' },
              $set: { updateTime: new Date() }
            },
        { session }
      ).select({
        _id: 1,
        collectionId: 1,
        imageId: 1,
        q: 1,
        indexes: 1
      });
      if (!data) return false;

      const collection = await MongoDatasetCollection.findById(data.collectionId)
        .select('imageIndex')
        .session(session);
      if (!collection) {
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

      const { supportVlm, supportImageIndex } = getDatasetImageIndexCapability({
        vectorModel: context.vectorModel,
        vlmModel: context.vlmModel
      });
      const hasMarkdownImages =
        !!collection.imageIndex && uniqueDatasetDataMarkdownImageUrls([data.q]).length > 0;
      const mode = getDatasetImageTrainingMode({
        supportVlm,
        supportImageIndex,
        imageId: data.imageId,
        hasMarkdownImages
      });

      await MongoDatasetTraining.create(
        [
          {
            teamId: context.teamId,
            tmbId: context.tmbId,
            datasetId: context.datasetId,
            collectionId: data.collectionId,
            billId: context.billId,
            mode,
            ...(context.synonymVersion && { synonymVersion: context.synonymVersion }),
            ...(context.synonymVersion && { expireAt: null }),
            dataId: data._id,
            ...(data.imageId && { imageId: data.imageId }),
            ...(mode === TrainingModeEnum.image && {
              q: data.q,
              indexes: data.indexes
            }),
            retryCount: 50
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
 * 传入 session 时与调用方的 rebuilding 标记原子提交，避免只留下标记而没有任务。
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
