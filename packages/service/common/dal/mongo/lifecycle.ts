import type { Mongoose } from 'mongoose';
import { getLogger, LogCategories } from '../../logger';
import { MongoIndexManager } from '../../mongo';
import {
  getMemberGroupModel,
  getGroupMemberModel,
  getOrgModel,
  getOrgMemberModel,
  getTeamMemberModel,
  getTeamModel,
  getTmpDataModel,
  getUserModel
} from '@fastgpt/dal/mongodb/business';
import { serviceEnv } from '../../../env';

const logger = getLogger(LogCategories.INFRA.MONGO);

/**
 * 同步 DAL Model 索引：补建当前 Schema 索引，并清理该 Schema 明确登记的历史索引。
 *
 * 与旧 Model 的 syncMongoIndex 保持同一套 MongoIndexManager 语义；测试与构建阶段跳过。
 * DAL Model 与旧 Model 指向同一集合，索引创建幂等，同步顺序不影响正确性。
 */
export const syncDalModelIndexes = async (client: Mongoose) => {
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    !serviceEnv.SYNC_INDEX
  ) {
    return;
  }

  const models = [
    getUserModel(client),
    getTeamModel(client),
    getTeamMemberModel(client),
    getMemberGroupModel(client),
    getGroupMemberModel(client),
    getOrgModel(client),
    getOrgMemberModel(client),
    getTmpDataModel(client)
  ];

  await Promise.all(
    models.map((model) =>
      MongoIndexManager.syncModelIndexes({ model, logger }).catch((error) => {
        logger.error('Failed to ensure DAL MongoDB indexes', {
          modelName: model.modelName,
          collectionName: model.collection.collectionName,
          error
        });
      })
    )
  );
};
