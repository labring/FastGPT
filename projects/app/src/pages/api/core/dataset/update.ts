import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  UpdateDatasetBodySchema,
  type UpdateDatasetBody
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum, TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ClientSession } from 'mongoose';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  syncChildrenPermission,
  replaceResourceClbs
} from '@fastgpt/service/support/permission/inheritPermission';
import { syncDatasetFolderCollectionPermissions } from '@fastgpt/service/core/dataset/collection/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  removeDatasetSyncJobScheduler,
  upsertDatasetSyncJobScheduler
} from '@fastgpt/service/core/dataset/datasetSync';
import { delDatasetRelevantData } from '@fastgpt/service/core/dataset/controller';
import { isEqual } from 'lodash';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { getEmbeddingModelById, getLLMModelById } from '@fastgpt/service/core/ai/model';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { computedCollectionChunkSettings } from '@fastgpt/global/core/dataset/training/utils';
import { checkDatabaseConnection } from '@fastgpt/service/core/dataset/database/clientManager';
import {
  deleteResourceClbs,
  getResourceOwnedClbs
} from '@fastgpt/service/support/permission/controller';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { assertModelAvailable, authModel } from '@fastgpt/service/support/permission/model/auth';

// 更新知识库接口
// 包括如下功能：
// 1. 更新应用的信息（包括名称，类型，头像，介绍等）
// 2. 更新数据库的配置信息
// 3. 移动知识库
// 操作权限：
// 1. 更新信息和配置编排需要有知识库的写权限
// 2. 移动应用需要有
//  (1) 父目录的管理权限
//  (2) 目标目录的管理权限
//  (3) 如果从根目录移动或移动到根目录，需要有团队的应用创建权限
async function handler(req: ApiRequestProps<UpdateDatasetBody>) {
  let {
    id,
    parentId,
    name,
    avatar,
    intro,
    agentModelId,
    vectorModelId,
    vlmModelId,
    websiteConfig,
    externalReadUrl,
    apiDatasetServer,
    autoSync,
    chunkSettings,
    databaseConfig
  } = UpdateDatasetBodySchema.parse(req.body);
  const { inheritParentPermission = true } = req.body as { inheritParentPermission?: boolean };

  const { dataset, permission, tmbId, teamId } = await authDataset({
    req,
    authToken: true,
    datasetId: id,
    per: ManagePermissionVal
  });
  await Promise.all([
    agentModelId
      ? authModel({
          req,
          authToken: true,
          authApiKey: true,
          modelId: agentModelId,
          per: ReadPermissionVal,
          resourceContext: { datasetId: id }
        }).then(({ model }) => {
          assertModelAvailable(model, { type: ModelTypeEnum.llm });
        })
      : undefined,
    vectorModelId
      ? authModel({
          req,
          authToken: true,
          authApiKey: true,
          modelId: vectorModelId,
          per: ReadPermissionVal,
          resourceContext: { datasetId: id }
        }).then(({ model }) => {
          assertModelAvailable(model, { type: ModelTypeEnum.embedding });
        })
      : undefined,
    vlmModelId
      ? authModel({
          req,
          authToken: true,
          authApiKey: true,
          modelId: vlmModelId,
          per: ReadPermissionVal,
          resourceContext: { datasetId: id }
        }).then(({ model }) => {
          assertModelAvailable(model, { type: ModelTypeEnum.llm, requireVision: true });
        })
      : undefined
  ]);

  const isMove = parentId !== undefined && String(parentId) !== String(dataset.parentId ?? '');

  let targetName = '';

  chunkSettings = chunkSettings
    ? computedCollectionChunkSettings({
        ...chunkSettings,
        llmModel: getLLMModelById(dataset.agentModelId),
        vectorModel: getEmbeddingModelById(dataset.vectorModelId)
      })
    : undefined;

  if (isMove) {
    if (parentId) {
      // move to a folder, check the target folder's permission
      const { dataset: targetDataset } = await authDataset({
        req,
        authToken: true,
        datasetId: parentId,
        per: ManagePermissionVal
      });
      targetName = targetDataset.name;
    } else {
      targetName = 'root';
    }
    if (dataset.parentId) {
      // move from a folder, check the (old) folder's permission
      await authDataset({
        req,
        authToken: true,
        datasetId: dataset.parentId,
        per: ManagePermissionVal
      });
    }
    if (parentId === null || !dataset.parentId) {
      // move to root or move from root
      await authUserPer({
        req,
        authToken: true,
        per: TeamDatasetCreatePermissionVal
      });
    }
  }

  const isFolder = dataset.type === DatasetTypeEnum.folder;

  updateTraining({
    teamId: dataset.teamId,
    datasetId: id,
    agentModelId
  });

  const onUpdate = async (session: ClientSession) => {
    // Website dataset update chunkSettings, need to clean up dataset
    if (
      dataset.type === DatasetTypeEnum.websiteDataset &&
      chunkSettings &&
      dataset.chunkSettings &&
      !isEqual(
        {
          imageIndex: dataset.chunkSettings.imageIndex,
          autoIndexes: dataset.chunkSettings.autoIndexes,
          hypeIndexes: dataset.chunkSettings.hypeIndexes,
          hypeIndexPrompt: dataset.chunkSettings.hypeIndexPrompt,
          autoIndexesPrompt: dataset.chunkSettings.autoIndexesPrompt,
          imageIndexPrompt: dataset.chunkSettings.imageIndexPrompt,
          trainingType: dataset.chunkSettings.trainingType,
          chunkSettingMode: dataset.chunkSettings.chunkSettingMode,
          chunkSplitMode: dataset.chunkSettings.chunkSplitMode,
          chunkSize: dataset.chunkSettings.chunkSize,
          chunkSplitter: dataset.chunkSettings.chunkSplitter,
          indexSize: dataset.chunkSettings.indexSize,
          qaPrompt: dataset.chunkSettings.qaPrompt
        },
        {
          imageIndex: chunkSettings.imageIndex,
          autoIndexes: chunkSettings.autoIndexes,
          hypeIndexes: dataset.chunkSettings.hypeIndexes,
          hypeIndexPrompt: dataset.chunkSettings.hypeIndexPrompt,
          autoIndexesPrompt: dataset.chunkSettings.autoIndexesPrompt,
          imageIndexPrompt: dataset.chunkSettings.imageIndexPrompt,
          trainingType: chunkSettings.trainingType,
          chunkSettingMode: chunkSettings.chunkSettingMode,
          chunkSplitMode: chunkSettings.chunkSplitMode,
          chunkSize: chunkSettings.chunkSize,
          chunkSplitter: chunkSettings.chunkSplitter,
          indexSize: chunkSettings.indexSize,
          qaPrompt: chunkSettings.qaPrompt
        }
      )
    ) {
      await delDatasetRelevantData({ datasets: [dataset], session });
    }
    if (dataset.type === DatasetTypeEnum.database && databaseConfig) {
      await checkDatabaseConnection(databaseConfig);
    }
    const apiDatasetParams = (() => {
      if (!apiDatasetServer) return {};

      const flattenObjectWithConditions = (
        obj: any,
        prefix = 'apiDatasetServer'
      ): Record<string, any> => {
        const result: Record<string, any> = {};

        if (!obj || typeof obj !== 'object') return result;

        Object.keys(obj).forEach((key) => {
          const value = obj[key];
          const newKey = prefix ? `${prefix}.${key}` : key;

          if (typeof value === 'object' && !Array.isArray(value)) {
            // Recursively flatten nested objects
            Object.assign(result, flattenObjectWithConditions(value, newKey));
          } else {
            // Add non-empty primitive values
            result[newKey] = value;
          }
        });

        return result;
      };
      return flattenObjectWithConditions(apiDatasetServer);
    })();

    // vlmModelId 为 null 时表示清空，用 $unset 删除字段；有值时用 $set 更新
    const updateData: Record<string, any> = {
      ...parseParentIdInMongo(parentId),
      ...(name && { name }),
      ...(avatar && { avatar }),
      ...(agentModelId && { agentModelId }),
      ...(vectorModelId && { vectorModelId }),
      ...(vlmModelId !== undefined && vlmModelId !== null && { vlmModelId }),
      ...(websiteConfig && { websiteConfig }),
      ...(databaseConfig && { databaseConfig }),
      ...(chunkSettings && { chunkSettings }),
      ...(intro !== undefined && { intro }),
      ...(externalReadUrl !== undefined && { externalReadUrl }),
      ...(isMove && { inheritPermission: inheritParentPermission }),
      ...(typeof autoSync === 'boolean' && { autoSync }),
      ...apiDatasetParams
    };
    const unsetData: Record<string, any> = {
      ...(vlmModelId === null && { vlmModelId: '' })
    };

    await MongoDataset.findByIdAndUpdate(
      id,
      {
        ...(Object.keys(updateData).length > 0 ? { $set: updateData } : {}),
        ...(Object.keys(unsetData).length > 0 ? { $unset: unsetData } : {})
      },
      { session }
    );

    await updateSyncSchedule({
      dataset,
      autoSync
    });

    await getS3AvatarSource().refreshAvatar(avatar, dataset.avatar, session);
  };

  await mongoSessionRun(async (session) => {
    if (isMove) {
      if (inheritParentPermission) {
        const parentClbs = await getResourceOwnedClbs({
          teamId: dataset.teamId,
          resourceId: parentId,
          resourceType: PerResourceTypeEnum.dataset,
          session
        });

        // Replace own clbs with parent clbs (move = full inheritance)
        await replaceResourceClbs({
          resourceType: PerResourceTypeEnum.dataset,
          teamId: dataset.teamId,
          resourceId: id,
          collaborators: parentClbs,
          session
        });

        // Sync to inherited children folders
        await syncChildrenPermission({
          resource: dataset,
          resourceType: PerResourceTypeEnum.dataset,
          resourceModel: MongoDataset,
          folderTypeList: [DatasetTypeEnum.folder],
          collaborators: parentClbs,
          session
        });

        // 同步权限到该 dataset 下 type: folder 的 collection
        await syncDatasetFolderCollectionPermissions({
          datasetId: id,
          teamId: dataset.teamId,
          collaborators: parentClbs,
          session
        });
      }
      // else: keep independent, no permission sync

      logDatasetMove({ tmbId, teamId, dataset, targetName });
      return onUpdate(session);
    } else {
      logDatasetUpdate({ tmbId, teamId, dataset });
      return onUpdate(session);
    }
  });
}
export default NextAPI(handler);

const updateTraining = async ({
  teamId,
  datasetId,
  agentModelId
}: {
  teamId: string;
  datasetId: string;
  agentModelId?: string;
}) => {
  if (!agentModelId) return;

  await MongoDatasetTraining.updateMany(
    {
      teamId,
      datasetId,
      mode: { $in: [TrainingModeEnum.qa, TrainingModeEnum.auto] }
    },
    {
      $set: {
        retryCount: 5,
        lockTime: new Date('2000/1/1')
      }
    }
  );
};

const updateSyncSchedule = async ({
  dataset,
  autoSync
}: {
  dataset: DatasetSchemaType;
  autoSync?: boolean;
}) => {
  if (typeof autoSync !== 'boolean') return;

  // Update all collection nextSyncTime
  if (autoSync) {
    // upsert Job Scheduler
    return upsertDatasetSyncJobScheduler({ datasetId: dataset._id });
  } else {
    // remove Job Scheduler
    return removeDatasetSyncJobScheduler(dataset._id);
  }
};

const logDatasetMove = ({
  tmbId,
  teamId,
  dataset,
  targetName
}: {
  tmbId: string;
  teamId: string;
  dataset: any;
  targetName: string;
}) => {
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.MOVE_DATASET,
      params: {
        datasetName: dataset.name,
        targetFolderName: targetName,
        datasetType: getI18nDatasetType(dataset.type)
      }
    });
  })();
};

const logDatasetUpdate = ({
  tmbId,
  teamId,
  dataset
}: {
  tmbId: string;
  teamId: string;
  dataset: any;
}) => {
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_DATASET,
      params: {
        datasetName: dataset.name,
        datasetType: getI18nDatasetType(dataset.type)
      }
    });
  })();
};
