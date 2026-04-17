import { type UpdateDatasetDataProps } from '@fastgpt/global/core/dataset/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorDB/controller';
import { UpdateDatasetDataBodySchema } from '@fastgpt/global/openapi/core/dataset/data/api';

async function handler(req: ApiRequestProps) {
  const { dataId, q, a, indexes = [] } = UpdateDatasetDataBodySchema.parse(req.body);
  const { metadata } = req.body as UpdateDatasetDataProps;

  const {
    collection: {
      dataset: { _id: datasetId, vectorModel, agentModel }
    },
    teamId,
    tmbId,
    collection,
    datasetData
  } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: WritePermissionVal
  });

  if (q || a || indexes.length > 0) {
    const formatQ = simpleText(q || datasetData.q);
    const formatA = simpleText(a !== undefined ? a : datasetData.a || '');
    // 只保留用户自定义索引（custom 类型），过滤掉 default/synthesis/small2big 等系统生成的旧索引
    // 避免重新训练时把旧的增强索引带入队列，导致旧 synthesis + 新 synthesis 重复叠加
    const formatIndexes = indexes
      .filter((item) => !item.type || item.type === DatasetDataIndexTypeEnum.custom)
      .map((item) => ({
        ...item,
        text: simpleText(item.text),
        dataId: undefined // 旧向量将全部删除，训练时需重新生成
      }));

    // 手动更新时，qa/imageParse/databaseSchema/backup 不适用于已结构化的 q/a，降级为 chunk 基础类型
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
    // imageIndex 强制 false —— 手动更新无图片
    const trainingMode = getTrainingModeByCollection({
      trainingType: effectiveTrainingType,
      autoIndexes: collection.autoIndexes,
      small2bigIndexes: collection.small2bigIndexes,
      syntheticIndex: collection.syntheticIndex,
      imageIndex: false
    });

    const oldVectorIds = datasetData.indexes.map((item) => item.dataId).filter(Boolean) as string[];

    // 构建 history 更新（q 或 a 变化时写入历史记录）
    const qChanged = formatQ !== datasetData.q;
    const aChanged = formatA !== (datasetData.a || '');
    const historyUpdate =
      qChanged || aChanged
        ? {
            $push: {
              history: {
                $each: [
                  { q: datasetData.q, a: datasetData.a || '', updateTime: datasetData.updateTime }
                ],
                $position: 0,
                $slice: 10
              }
            }
          }
        : {};

    // 使用事务保证"清空旧索引 + 写入训练队列"的原子性
    // 旧向量在 session 提交后异步删除，避免孤儿数据
    await mongoSessionRun(async (session) => {
      // 先删除同 dataId 的旧训练记录，防止旧任务残留导致 rebuildData 路径还原旧 indexes
      await MongoDatasetTraining.deleteMany({ dataId }, { session });

      await MongoDatasetData.findByIdAndUpdate(
        dataId,
        {
          $set: {
            q: formatQ,
            a: formatA,
            indexes: [],
            ...(metadata !== undefined && { metadata }),
            updateTime: new Date()
          },
          ...historyUpdate
        },
        { session }
      );

      await pushDataListToTrainingQueue({
        teamId,
        tmbId,
        datasetId: String(datasetId),
        collectionId: datasetData.collectionId,
        agentModel,
        vectorModel,
        mode: trainingMode,
        billId: tmbId,
        session,
        data: [
          {
            id: dataId,
            q: formatQ,
            a: formatA,
            chunkIndex: datasetData.chunkIndex,
            indexes: formatIndexes,
            metadata: metadata ?? datasetData.metadata
          }
        ]
      });
    });

    // session 提交后删除旧向量
    if (oldVectorIds.length > 0) {
      deleteDatasetDataVector({ teamId, idList: oldVectorIds });
    }
  }

  (() => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_DATA,
      params: {
        collectionName: collection.name,
        datasetName: collection.dataset?.name || '',
        datasetType: getI18nDatasetType(collection.dataset?.type || '')
      }
    });
  })();
}

export default NextAPI(handler);
