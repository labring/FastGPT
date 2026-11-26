import type { NormalizedSynonymMappingType } from '@fastgpt/global/core/dataset/synonym';
import {
  DatasetSynonymMutationTypeEnum,
  DatasetSynonymSchemaVersion
} from '@fastgpt/global/core/dataset/synonym';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import path from 'node:path';

import { DatasetDataIndexStageEnum } from '@fastgpt/global/core/dataset/data/constants';
import { cleanupUnusedDatasetSynonymMappings } from '@fastgpt/service/core/dataset/synonym/controller';
import {
  assertDatasetSynonymEnabled,
  invalidateDatasetSynonymMatcherCache
} from '@fastgpt/service/core/dataset/synonym/entity';
import {
  hasBlockingDatasetTrainingTask,
  markDatasetDocumentRebuild
} from '@fastgpt/service/core/dataset/training/orchestration';
import { enqueueDatasetTrainingBatch } from '@fastgpt/service/core/dataset/training/runtime';

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
 * 原子切换当前同义词 matcher，并创建独立的同义词重建任务。
 * mapping、配置、data 标记和账单在同一事务中提交；保留历史词表供差量比较。
 *
 * 管理面边界：路由层只负责入参校验、鉴权和 response schema，本函数承载事务、
 * 队列忙校验、提交后入队和 matcher 缓存失效。管理页面由宿主产品实现（agent-builder
 * UI 已消费这套 API），本仓库只提供 API 契约，避免维护第二份管理实现；独立部署
 * 需要页面时直接调用 `pages/api/core/dataset/synonym/*` 即可，不需要改引擎。
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

  const { teamId, tmbId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });
  const current = await MongoDatasetSynonym.findOne({ teamId, datasetId }).lean();

  if (type === DatasetSynonymMutationTypeEnum.delete && !current) {
    throw new Error('同义词配置不存在');
  }
  if (
    expectedSynonymId &&
    (String(current?._id) !== expectedSynonymId || current?.version !== expectedFileVersion)
  ) {
    throw new Error('同义词配置已变化，请刷新页面后重试');
  }
  if (type === DatasetSynonymMutationTypeEnum.upload && current?.enabled) {
    throw new Error('知识库已配置同义词，请使用更新接口');
  }

  const synonymId = current?._id ?? new Types.ObjectId();
  const fileVersion = (current?.version ?? 0) + 1;
  // 空词表版本记为「按原文索引」，后续差量重建不能把它当作快照丢失而全量重算。
  const emptyVersions =
    mappings.length === 0
      ? [...new Set([...(current?.emptyVersions ?? []), fileVersion])]
      : (current?.emptyVersions ?? []).filter((version) => version !== fileVersion);
  const now = new Date();
  const normalizedFileName = path.basename(fileName) || 'synonyms.csv';
  const modelHandle = await getTeamModelHandle({ teamId });
  const { affectedDataCount, collectionIds } = await mongoSessionRun(async (session) => {
    const dataset = await MongoDataset.findOne({ _id: datasetId, teamId, deleteTime: null })
      .session(session)
      .lean();
    if (!dataset) throw new Error('Dataset not found');
    if (await hasBlockingDatasetTrainingTask({ teamId, datasetId }, session)) {
      throw new Error('知识库正在训练或者重建中，请稍后再修改同义词');
    }
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
                  emptyVersions,
                  schemaVersion: DatasetSynonymSchemaVersion,
                  updateTime: now
                }
              }
            : {
                $set: {
                  version: fileVersion,
                  enabled: false,
                  emptyVersions,
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
            emptyVersions,
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

    const vectorModelData = modelHandle.getModelData(
      getDatasetModelReference(dataset, 'embedding'),
      {
        type: 'embedding'
      }
    );
    const result = await markDatasetDocumentRebuild(
      {
        teamId,
        tmbId,
        datasetId,
        vectorModelId: vectorModelData.modelId!,
        indexStatus: DatasetDataIndexStageEnum.rebuildSynonymPending,
        synonymVersion: fileVersion
      },
      session
    );
    if (result.affectedDataCount === 0) {
      await cleanupUnusedDatasetSynonymMappings({ teamId, datasetId }, session);
    }
    return result;
  });
  invalidateDatasetSynonymMatcherCache({ teamId, datasetId });
  await enqueueDatasetTrainingBatch({ teamId, collectionIds });

  return {
    synonymId: String(synonymId),
    fileName: mappings.length > 0 ? normalizedFileName : '',
    size,
    uploadTime: now,
    fileVersion,
    affectedDataCount
  };
};
