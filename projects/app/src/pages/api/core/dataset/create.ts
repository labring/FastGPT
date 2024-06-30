import type { NextApiRequest } from 'next';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { CreateDatasetParams } from '@/global/core/dataset/api.d';
import { createDefaultCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getLLMModel, getVectorModel, getDatasetModel } from '@fastgpt/service/core/ai/model';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { NullPermission, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest) {
  const {
    parentId,
    name,
    type = DatasetTypeEnum.dataset,
    avatar,
    vectorModel = global.vectorModels[0].model,
    agentModel = getDatasetModel().model,
    defaultPermission = NullPermission
  } = req.body as CreateDatasetParams;

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
    throw new Error('vectorModel or qaModel is invalid'); // TODO: use enum code
  }

  // check limit
  await checkTeamDatasetLimit(teamId);

  const { _id } = await MongoDataset.create({
    name,
    teamId,
    tmbId,
    vectorModel,
    agentModel,
    avatar,
    parentId: parentId || null,
    type,
    defaultPermission
  });

  if (type === DatasetTypeEnum.dataset) {
    await createDefaultCollection({
      datasetId: _id,
      teamId,
      tmbId
    });
  }

  return _id;
}

export default NextAPI(handler);
