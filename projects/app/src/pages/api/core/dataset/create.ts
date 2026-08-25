import { NextAPI } from '@/service/middleware/entry';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  CreateDatasetBodySchema,
  CreateDatasetResponseSchema,
  type CreateDatasetResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  getDefaultEmbeddingModel,
  getDefaultDatasetTextLLMModel,
  getDefaultVLMModel,
  getEmbeddingModel,
  getLLMModel,
  getVlmModel,
  assertModelUsable
} from '@fastgpt/service/core/ai/model/cache';
import { resolveModelId } from '@fastgpt/service/core/ai/compat/resolveModelId';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authModels } from '@fastgpt/service/support/permission/model/auth';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<CreateDatasetResponse> {
  const {
    parentId,
    name,
    intro,
    type = DatasetTypeEnum.dataset,
    avatar,
    // Resolve legacy names only after the caller's team is known.
    vectorModelId,
    agentModelId,
    vlmModelId,
    vectorModel,
    agentModel,
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

  const resolvedVectorModelId =
    vectorModelId ??
    (vectorModel ? resolveModelId(vectorModel, teamId) : undefined) ??
    getDefaultEmbeddingModel()?.id ??
    '';
  const resolvedAgentModelId =
    agentModelId ??
    (agentModel ? resolveModelId(agentModel, teamId) : undefined) ??
    getDefaultDatasetTextLLMModel()?.id ??
    '';
  const resolvedVlmModelId =
    vlmModelId ??
    (vlmModel ? resolveModelId(vlmModel, teamId) : undefined) ??
    getDefaultVLMModel()?.id;

  const vectorModelStore = assertModelUsable(getEmbeddingModel(resolvedVectorModelId));
  const agentModelStore = assertModelUsable(getLLMModel(resolvedAgentModelId));
  if (resolvedVlmModelId) {
    assertModelUsable(getVlmModel(resolvedVlmModelId));
  }

  // Model permission: reject unauthorized models (design AUTH-TC11)
  await authModels({
    req,
    authToken: true,
    authApiKey: true,
    modelIds: [resolvedVectorModelId, resolvedAgentModelId, resolvedVlmModelId],
    per: ReadPermissionVal
  });

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
          vectorModelId: resolvedVectorModelId,
          agentModelId: resolvedAgentModelId,
          vlmModelId: resolvedVlmModelId,
          avatar,
          type,
          apiDatasetServer
        }
      ],
      { session, ordered: true }
    );

    await MongoResourcePermission.insertOne({
      teamId,
      tmbId,
      resourceId: dataset._id,
      permission: OwnerRoleVal,
      resourceType: PerResourceTypeEnum.dataset
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
