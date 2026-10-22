import { connectionLogMongo, connectionMongo, Types } from '@fastgpt/service/common/mongo';
export const db = () => connectionMongo.connection.db!;

/** 等待测试库自动建索引完成，避免建索引与真实迁移事务争抢集合锁。 */
export const initializeMongoModels = async () => {
  await Promise.all(
    [connectionMongo, connectionLogMongo].flatMap((connection) =>
      Object.values(connection.models).map((model) => model.init())
    )
  );
};

/** 用真实 Mongo 验证跨集合提交和重跑；绕过当前 enum 写入历史 chunk 记录。 */
export const seed = async (
  options: {
    mode?: string;
    status?: string;
    existing?: boolean;
    lockTime?: Date;
    retryCount?: number;
    imageId?: string;
  } = {}
) => {
  const scope = {
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    datasetId: new Types.ObjectId(),
    collectionId: new Types.ObjectId()
  };
  await db().collection('datasets').insertOne({ _id: scope.datasetId, teamId: scope.teamId });
  await db()
    .collection('dataset_collections')
    .insertOne({ _id: scope.collectionId, ...scope });
  const dataId = new Types.ObjectId();
  if (options.existing) {
    await db()
      .collection('dataset_datas')
      .insertOne({
        _id: dataId,
        ...scope,
        q: 'original',
        indexes: [{ type: 'custom', text: 'original index', dataId: 'old-vector' }],
        ...(options.status && { indexStatus: options.status })
      });
  }
  const task = {
    _id: new Types.ObjectId(),
    ...scope,
    mode: options.mode ?? 'chunk',
    billId: 'original-bill',
    q: 'draft text',
    a: 'answer',
    dataMetadata: { source: 'original' },
    indexes: [{ type: 'custom', text: 'custom draft' }],
    imageDescMap: { image: 'description' },
    retryCount: options.retryCount ?? 2,
    errorMsg: 'original error',
    lockTime: options.lockTime ?? new Date(0),
    expireAt: null,
    chunkIndex: 3,
    ...(options.existing && { dataId }),
    ...(options.imageId && { imageId: options.imageId })
  };
  await db().collection('dataset_trainings').insertOne(task);
  return task;
};
