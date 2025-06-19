import type { CreateDatasetParams } from '@/global/core/dataset/api.d';
import { NextAPI } from '@/service/middleware/entry';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { refreshSourceAvatar } from '@fastgpt/service/common/file/image/controller';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  getDatasetModel,
  getDefaultEmbeddingModel,
  getEmbeddingModel,
  getLLMModel
} from '@fastgpt/service/core/ai/model';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';

export type DatasetCreateQuery = {};
export type DatasetCreateBody = CreateDatasetParams;
export type DatasetCreateResponse = string;

async function handler(
  req: ApiRequestProps<DatasetCreateBody, DatasetCreateQuery>
): Promise<DatasetCreateResponse> {
  const {
    parentId,
    name,
    intro,
    type = DatasetTypeEnum.dataset,
    avatar,
    vectorModel = getDefaultEmbeddingModel()?.model,
    agentModel = getDatasetModel()?.model,
    vlmModel,
    apiDatasetServer
  } = req.body;

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
  const vectorModelStore = getEmbeddingModel(vectorModel);
  const agentModelStore = getLLMModel(agentModel);
  if (!vectorModelStore) {
    return Promise.reject(`System not embedding model`);
  }
  if (!agentModelStore) {
    return Promise.reject(`System not llm model`);
  }

  // check limit
  await checkTeamDatasetLimit(teamId);

  const datasetId = await mongoSessionRun(async (session) => {
    const [{ _id }] = await MongoDataset.create(
      [
        {
          ...parseParentIdInMongo(parentId),
          name,
          intro,
          teamId,
          tmbId,
          vectorModel,
          agentModel,
          vlmModel,
          avatar,
          type,
          apiDatasetServer
        }
      ],
      { session, ordered: true }
    );
    await refreshSourceAvatar(avatar, undefined, session);

    return _id;
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

  return datasetId;
}
export default NextAPI(handler);
