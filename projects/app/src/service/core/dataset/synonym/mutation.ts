import type { ApiRequestProps } from '@fastgpt/next/type';
import path from 'node:path';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import type { NormalizedSynonymMappingType } from '@fastgpt/global/core/dataset/synonym';
import {
  DatasetSynonymMutationTypeEnum,
  DatasetSynonymSchemaVersion
} from '@fastgpt/global/core/dataset/synonym';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import {
  getDatasetAgentModel,
  getDatasetEmbeddingModel,
  getDatasetVlmModel
} from '@fastgpt/service/core/dataset/model';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  assertDatasetSynonymEnabled,
  invalidateDatasetSynonymMatcherCache
} from '@fastgpt/service/core/dataset/synonym/entity';
import { seedDatasetRebuildTasks } from '../queues/rebuild';

const SYNONYM_MAPPING_BATCH_SIZE = 1000;

type DatasetSynonymMutationProps = {
  req: ApiRequestProps;
  datasetId: string;
  mappings: NormalizedSynonymMappingType[];
  fileName: string;
  size: number;
} & (
  | {
      type: DatasetSynonymMutationTypeEnum.upload;
      expectedSynonymId?: never;
      expectedFileVersion?: never;
    }
  | {
      type: DatasetSynonymMutationTypeEnum.update | DatasetSynonymMutationTypeEnum.delete;
      expectedSynonymId: string;
      expectedFileVersion: number;
    }
);

/**
 * 原子切换当前同义词 matcher，并复用模型切换的全量 rebuild 编排重建历史数据。
 * mapping、配置、data 标记和普通 rebuild 种子任务在同一事务中提交。
 */
export const createDatasetSynonymMutation = async ({
  req,
  datasetId,
  mappings,
  fileName,
  size,
  expectedSynonymId,
  expectedFileVersion,
  type
}: DatasetSynonymMutationProps) => {
  assertDatasetSynonymEnabled();

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });
  const [current, existingTraining, existingRebuildingData] = await Promise.all([
    MongoDatasetSynonym.findOne({ teamId, datasetId }).lean(),
    MongoDatasetTraining.exists({ teamId, datasetId }),
    MongoDatasetData.exists({ teamId, datasetId, rebuilding: true })
  ]);

  if (type === DatasetSynonymMutationTypeEnum.delete && !current) {
    throw new Error('同义词配置不存在');
  }
  if (
    expectedSynonymId &&
    (String(current?._id) !== expectedSynonymId || current?.version !== expectedFileVersion)
  ) {
    throw new Error('同义词配置已变化，请刷新页面后重试');
  }
  if (existingTraining || existingRebuildingData) {
    throw new Error('知识库正在训练或者重建中，请稍后再修改同义词');
  }
  if (type === DatasetSynonymMutationTypeEnum.upload && current?.enabled) {
    throw new Error('知识库已配置同义词，请使用更新接口');
  }

  const synonymId = current?._id ?? new Types.ObjectId();
  const fileVersion = (current?.version ?? 0) + 1;
  const now = new Date();
  const normalizedFileName = path.basename(fileName) || 'synonyms.csv';
  const vectorModelData = getDatasetEmbeddingModel(dataset);
  const agentModelData = getDatasetAgentModel(dataset);
  const vlmModelData = getDatasetVlmModel(dataset);
  const { usageId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: `${dataset.name}-同义词重建`,
    billSource: UsageSourceEnum.training,
    vectorModelId: vectorModelData.modelId!,
    agentModelId: agentModelData.modelId,
    vllmModelId: vlmModelData?.modelId
  });

  const affectedDataCount = await mongoSessionRun(async (session) => {
    // 分批发送 mapping，避免单个 bulkWrite 命令接近 MongoDB 的批量上限。
    for (let offset = 0; offset < mappings.length; offset += SYNONYM_MAPPING_BATCH_SIZE) {
      const batch = mappings.slice(offset, offset + SYNONYM_MAPPING_BATCH_SIZE);
      await MongoDatasetSynonymMapping.bulkWrite(
        batch.map((mapping) => ({
          insertOne: {
            document: {
              logicalMappingId: new Types.ObjectId(),
              teamId,
              datasetId,
              synonymFileId: synonymId,
              fileVersion,
              standardizedTerm: mapping.standardizedTerm,
              normalizedStandardizedTerm: mapping.normalizedStandardizedTerm,
              synonymTerms: mapping.synonymTerms,
              normalizedSynonymTerms: mapping.normalizedSynonymTerms,
              allTerms: mapping.allTerms,
              fingerprint: mapping.fingerprint,
              createTime: now,
              updateTime: now
            }
          }
        })),
        { session, ordered: true }
      );
    }

    const configResult = await (() => {
      if (current) {
        return MongoDatasetSynonym.updateOne(
          { _id: synonymId, version: current.version },
          mappings.length > 0
            ? {
                $set: {
                  teamId,
                  datasetId,
                  fileName: normalizedFileName,
                  size,
                  uploadTime: now,
                  uploaderId: tmbId,
                  version: fileVersion,
                  enabled: true,
                  schemaVersion: DatasetSynonymSchemaVersion,
                  updateTime: now
                }
              }
            : {
                $set: {
                  version: fileVersion,
                  enabled: false,
                  schemaVersion: DatasetSynonymSchemaVersion,
                  updateTime: now
                },
                $unset: {
                  fileName: '',
                  size: '',
                  uploadTime: '',
                  uploaderId: '',
                  rebuildTotal: '',
                  rebuildCompleted: ''
                }
              },
          { session }
        );
      }

      return MongoDatasetSynonym.create(
        [
          {
            _id: synonymId,
            teamId,
            datasetId,
            fileName: normalizedFileName,
            size,
            uploadTime: now,
            uploaderId: tmbId,
            version: fileVersion,
            enabled: true,
            schemaVersion: DatasetSynonymSchemaVersion,
            updateTime: now
          }
        ],
        { session, ordered: true }
      ).then(() => ({ modifiedCount: 1 }));
    })();

    if ((await configResult).modifiedCount !== 1) {
      throw new Error('同义词配置已变化，请刷新页面后重试');
    }

    await MongoDatasetSynonymMapping.deleteMany(
      {
        teamId,
        datasetId,
        fileVersion: { $ne: fileVersion }
      },
      { session }
    );

    const affectedDataCount = await MongoDatasetData.countDocuments({
      teamId,
      datasetId,
      synonymVersion: { $ne: fileVersion }
    }).session(session);
    if (affectedDataCount > 0) {
      await seedDatasetRebuildTasks(
        {
          teamId,
          tmbId,
          datasetId,
          billId: String(usageId),
          vectorModel: vectorModelData,
          vlmModel: vlmModelData,
          synonymVersion: fileVersion
        },
        session
      );
    }
    return affectedDataCount;
  });
  invalidateDatasetSynonymMatcherCache({ teamId, datasetId });

  return {
    synonymId: String(synonymId),
    fileName: mappings.length > 0 ? normalizedFileName : '',
    size,
    uploadTime: now,
    fileVersion,
    affectedDataCount
  };
};
