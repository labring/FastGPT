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
    apiServer
  } = req.body;

  // auth
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  // check model valid
  const vectorModelStore = getVectorModel(vectorModel);
  const agentModelStore = getLLMModel(agentModel);
  if (!vectorModelStore || !agentModelStore) {
    return Promise.reject(DatasetErrEnum.invalidVectorModelOrQAModel);
  }

  // check limit
  await checkTeamDatasetLimit(teamId);

  const { _id } = await MongoDataset.create({
    ...parseParentIdInMongo(parentId),
    name,
    intro,
    teamId,
    tmbId,
    vectorModel,
    agentModel,
    avatar,
    type,
    apiServer
  });

  return _id;
}
export default NextAPI(handler);
