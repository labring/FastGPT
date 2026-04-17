/*
  insert one data to dataset (immediately insert)
  manual input or mark data
*/
import { hasSameValue } from '@/service/core/dataset/data/utils';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { InsertDataBodySchema } from '@fastgpt/global/openapi/core/dataset/data/api';

async function handler(req: ApiRequestProps) {
  const { collectionId, q, a, indexes } = InsertDataBodySchema.parse(req.body);
  const { metadata, id } = req.body as { metadata?: Record<string, string>; id?: string };

  // Validate custom ID if provided
  if (id !== undefined) {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error(
        `Invalid ID format: ${id}. Must be a valid MongoDB ObjectID (24-character hex string)`
      );
    }

    // Check for duplicate ID
    const existing = await MongoDatasetData.findById(id);
    if (existing) {
      throw new Error(`Data with ID ${id} already exists`);
    }
  }

  // 凭证校验
  const { teamId, tmbId, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  const { dataset } = collection;
  const { _id: datasetId, vectorModel, agentModel } = dataset;

  await checkDatasetIndexLimit({
    teamId,
    insertLen: 1 + (indexes?.length || 0)
  });

  const formatQ = simpleText(q);
  const formatA = simpleText(a);
  const formatIndexes = indexes?.map((item) => ({
    ...item,
    text: simpleText(item.text)
  }));

  await hasSameValue({
    teamId,
    datasetId,
    collectionId,
    q: formatQ,
    a: formatA
  });

  // 预生成 insertId（worker 使用此 ID 写入 MongoDB）
  const insertId = id ? new Types.ObjectId(id) : new Types.ObjectId();

  // 手动插入时，qa/imageParse/databaseSchema/backup 不适用于已结构化的 q/a，降级为 chunk 基础类型
  // chunk/template 则保留原始 trainingType，配合集合增强标志走完整训练链路
  const SKIP_TYPES = [
    DatasetCollectionDataProcessModeEnum.qa,
    DatasetCollectionDataProcessModeEnum.imageParse,
    DatasetCollectionDataProcessModeEnum.databaseSchema,
    DatasetCollectionDataProcessModeEnum.backup
  ];
  const effectiveTrainingType = SKIP_TYPES.includes(
    collection.trainingType as DatasetCollectionDataProcessModeEnum
  )
    ? DatasetCollectionDataProcessModeEnum.chunk
    : (collection.trainingType as DatasetCollectionDataProcessModeEnum) ||
      DatasetCollectionDataProcessModeEnum.chunk;

  // 与文档解析保持一致：根据集合的增强配置决定训练 mode
  // imageIndex 强制 false —— 手动插入无图片
  const trainingMode = getTrainingModeByCollection({
    trainingType: effectiveTrainingType,
    autoIndexes: collection.autoIndexes,
    small2bigIndexes: collection.small2bigIndexes,
    syntheticIndex: collection.syntheticIndex,
    imageIndex: false
  });

  // 使用事务保证"占位记录写入 + 推入训练队列"的原子性
  // 推队列失败时自动回滚占位记录，避免孤儿数据
  const chunkIndex = await mongoSessionRun(async (session) => {
    const lastData = await MongoDatasetData.findOne({ collectionId })
      .sort({ chunkIndex: -1 })
      .select('chunkIndex')
      .session(session)
      .lean();
    const nextChunkIndex = (lastData?.chunkIndex ?? -1) + 1;

    await MongoDatasetData.create(
      [
        {
          _id: insertId,
          teamId,
          tmbId,
          datasetId,
          collectionId,
          q: formatQ,
          a: formatA,
          chunkIndex: nextChunkIndex,
          indexes: [],
          metadata
        }
      ],
      { session }
    );

    await pushDataListToTrainingQueue({
      teamId,
      tmbId,
      datasetId: String(datasetId),
      collectionId,
      agentModel,
      vectorModel,
      mode: trainingMode,
      billId: tmbId,
      session,
      data: [
        {
          id: insertId.toString(),
          q: formatQ,
          a: formatA,
          chunkIndex: nextChunkIndex,
          indexes: formatIndexes,
          metadata
        }
      ]
    });

    return nextChunkIndex;
  });

  (() => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_DATA,
      params: {
        collectionName: collection.name,
        datasetName: collection.dataset?.name || '',
        datasetType: getI18nDatasetType(collection.dataset?.type || '')
      }
    });
  })();

  return { insertId, chunkIndex };
}

export default NextAPI(handler);
