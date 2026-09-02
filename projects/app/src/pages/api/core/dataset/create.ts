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
import {
  getDefaultEmbeddingModelData,
  getDefaultLLMModelData,
  getDefaultVLMModelData,
  getOptionalEmbeddingModelData,
  getOptionalLLMModelData,
  getOptionalVlmModelData
} from '@fastgpt/service/core/ai/model';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

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
    apiDatasetServer
  } = parseApiInput({ req, bodySchema: CreateDatasetBodySchema }).body;

  // auth
  const { teamId, tmbId, userId } = parentId
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

  // check model valid
  const vectorModelStore =
    getOptionalEmbeddingModelData({ modelId: vectorModelId, model: vectorModel }) ??
    getDefaultEmbeddingModelData();
  const agentModelStore =
    getOptionalLLMModelData({ modelId: agentModelId, model: agentModel }) ??
    getDefaultLLMModelData();
  const vlmModelStore =
    getOptionalVlmModelData({ modelId: vlmModelId, model: vlmModel }) ?? getDefaultVLMModelData();

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
          apiDatasetServer
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
