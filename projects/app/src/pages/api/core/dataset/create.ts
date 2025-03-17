import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { CreateDatasetParams } from '@/global/core/dataset/api.d';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  getLLMModel,
  getEmbeddingModel,
  getDatasetModel,
  getDefaultEmbeddingModel,
  getVlmModel
} from '@fastgpt/service/core/ai/model';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { refreshSourceAvatar } from '@fastgpt/service/common/file/image/controller';

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
    apiServer,
    feishuServer,
    yuqueServer
  } = req.body;

  // auth
  const [{ teamId, tmbId, userId }] = await Promise.all([
    authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: WritePermissionVal
    }),
    ...(parentId
      ? [
          authDataset({
            req,
            datasetId: parentId,
            authToken: true,
            authApiKey: true,
            per: WritePermissionVal
          })
        ]
      : [])
  ]);

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
          apiServer,
          feishuServer,
          yuqueServer
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

  return datasetId;
}
export default NextAPI(handler);
