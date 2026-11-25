import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type { DbSession } from '@fastgpt/dal/db/types';
import type { ClientSession } from '../../common/mongo';
import { MongoDataset } from './schema';

/** 查询指定团队内可用于索引模型校验的知识库引用。 */
export const findDatasetIndexModelReferences = ({
  datasetIds,
  teamId,
  session
}: {
  datasetIds: string[];
  teamId: string;
  session?: ClientSession;
}) =>
  MongoDataset.find(
    { _id: { $in: datasetIds }, teamId, deleteTime: null },
    'vectorModelId vectorModel'
  )
    .session(session ?? null)
    .lean();

/**
 * 锁住知识库文档并递增 collectionPermissionVersion，返回最新的 apiDatasetServer 快照。
 * 写权限事务通过版本自增与并发启停托管产生写冲突，重试时重读最新配置决定是否丢弃旧轮次。
 */
export const bumpDatasetCollectionPermissionVersion = ({
  datasetId,
  teamId,
  tx
}: {
  datasetId: string;
  teamId: string;
  tx?: DbSession;
}) =>
  MongoDataset.findOneAndUpdate(
    { _id: datasetId, teamId },
    { $inc: { collectionPermissionVersion: 1 } },
    { session: unwrapMongoSession(tx), new: true }
  )
    .select('apiDatasetServer')
    .lean();
