import { NextAPI } from '@/service/middleware/entry';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  CreateDatasetBodySchema,
  CreateDatasetResponseSchema,
  type CreateDatasetResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import {
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';

import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { getAuthorizedModelIds } from '@fastgpt/service/support/permission/model/auth';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';

async function handler(req: ApiRequestProps): Promise<CreateDatasetResponse> {
  const {
    parentId,
    name,
    intro,
    type = DatasetTypeEnum.dataset,
    avatar,
    vectorModelId,
    vectorModel,
    agentModelId,
    agentModel,
    vlmModelId,
    vlmModel,
    apiDatasetServer,
    sangforFileParseConfig,
    inheritPermission
  } = parseApiInput({ req, bodySchema: CreateDatasetBodySchema }).body;

  // auth
  const { teamId, tmbId, userId, isRoot } = parentId
    ? await authDataset({
        req,
        datasetId: parentId,
        authToken: true,
        authApiKey: true,
        per: WritePermissionVal
      })
    : await authUserPer({
        req,
        authToken: true,
        authApiKey: true,
        per: TeamDatasetCreatePermissionVal
      });

  // check model valid & permission
  const modelHandle = await getTeamModelHandle({ teamId });
  const authorizedIds = await getAuthorizedModelIds({
    actor: { teamId, tmbId, isRoot },
    handle: modelHandle
  });
  const vectorModelStore =
    modelHandle.getModelData(
      { modelId: vectorModelId, model: vectorModel },
      { type: 'embedding', optional: true, authorizedIds }
    ) ?? modelHandle.getDefaultModelData('embedding', { authorizedIds });
  const agentModelStore =
    modelHandle.getModelData(
      { modelId: agentModelId, model: agentModel },
      { type: 'llm', optional: true, authorizedIds }
    ) ?? modelHandle.getDefaultModelData('llm', { authorizedIds });
  // 显式空值表示“不设置”，不能再补系统默认或按旧名称恢复；仅未传引用时沿用默认（无权限默认 VLM 自动降级为 undefined）。
  const vlmModelStore = (() => {
    if (vlmModelId !== undefined)
      return modelHandle.getModelData(
        { modelId: vlmModelId },
        { type: 'llm', vision: true, optional: true, authorizedIds }
      );
    if (vlmModel !== undefined)
      return modelHandle.getModelData(
        { model: vlmModel },
        { type: 'llm', vision: true, optional: true, authorizedIds }
      );
    return modelHandle.getDefaultModelData('datasetImageLLM', { authorizedIds });
  })();

  // check limit
  await checkTeamDatasetLimit(teamId);

  const datasetId = await mongoSessionRun(async (session) => {
    const [dataset] = await MongoDataset.create(
      [
        {
          ...parseParentIdInMongo(parentId),
          name,
          intro,
          teamId,
          tmbId,
          vectorModelId: vectorModelStore.modelId,
          agentModelId: agentModelStore.modelId,
          ...(vlmModelStore?.modelId && { vlmModelId: vlmModelStore.modelId }),
          avatar,
          type,
          apiDatasetServer,
          ...(sangforFileParseConfig && { sangforFileParseConfig }),
          // 独立态创建（sangfor 专用）只对文件夹生效，其余类型固定按继承态创建
          inheritPermission: type === DatasetTypeEnum.folder ? inheritPermission : true
        }
      ],
      { session, ordered: true }
    );

    await createResourceDefaultCollaborators({
      resource: dataset,
      resourceType: PerResourceTypeEnum.dataset,
      tmbId,
      session
    });

    await getS3AvatarSource().refreshAvatar(avatar, undefined, session);

    return dataset._id;
  });

  pushTrack.createDataset({
    type,
    teamId,
    tmbId,
    uid: userId
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_DATASET,
      params: {
        datasetName: name,
        datasetType: getI18nDatasetType(type)
      }
    });
  })();

  return CreateDatasetResponseSchema.parse(datasetId);
}
export default NextAPI(handler);
