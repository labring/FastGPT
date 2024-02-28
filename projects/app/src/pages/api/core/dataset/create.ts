import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { CreateDatasetParams } from '@/global/core/dataset/api.d';
import { createDefaultCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getLLMModel, getVectorModel, getDatasetModel } from '@fastgpt/service/core/ai/model';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const {
      parentId,
      name,
      type = DatasetTypeEnum.dataset,
      avatar,
      vectorModel = global.vectorModels[0].model,
      agentModel = getDatasetModel().model
    } = req.body as CreateDatasetParams;

    // auth
    const { teamId, tmbId } = await authUserNotVisitor({ req, authToken: true, authApiKey: true });

    // check model valid
    const vectorModelStore = getVectorModel(vectorModel);
    const agentModelStore = getLLMModel(agentModel);
    if (!vectorModelStore || !agentModelStore) {
      throw new Error('vectorModel or qaModel is invalid');
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
      type
    });

    if (type === DatasetTypeEnum.dataset) {
      await createDefaultCollection({
        datasetId: _id,
        teamId,
        tmbId
      });
    }

    jsonRes(res, { data: _id });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
