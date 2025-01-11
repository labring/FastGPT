import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { CreateDatasetParams } from '@/global/core/dataset/api.d';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getLLMModel, getVectorModel, getDatasetModel } from '@fastgpt/service/core/ai/model';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
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
    vectorModel = global.vectorModels[0].model,
    agentModel = getDatasetModel().model,
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
  const vectorModelStore = getVectorModel(vectorModel);
  const agentModelStore = getLLMModel(agentModel);
  if (!vectorModelStore || !agentModelStore) {
    return Promise.reject(DatasetErrEnum.invalidVectorModelOrQAModel);
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
          avatar,
          type,
          apiServer,
          feishuServer,
          yuqueServer
        }
      ],
      { session }
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
