/* push data to training queue */
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { TrainingModeEnum, TrainingTypeMap } from '@fastgpt/global/core/dataset/constant';
import { startQueue } from '@/service/utils/tools';
import { countPromptTokens } from '@fastgpt/global/common/string/tiktoken';
import type { PushDataResponse } from '@/global/core/api/datasetRes.d';
import type { PushDatasetDataProps } from '@/global/core/dataset/api.d';
import { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api';
import { getQAModel, getVectorModel } from '@/service/core/ai/model';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { simpleText } from '@fastgpt/global/common/string/tools';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { collectionId, data, mode = TrainingModeEnum.chunk } = req.body as PushDatasetDataProps;

    if (!collectionId || !Array.isArray(data)) {
      throw new Error('collectionId or data is empty');
    }

    if (!TrainingTypeMap[mode]) {
      throw new Error(`Mode is not ${Object.keys(TrainingTypeMap).join(', ')}`);
    }

    if (data.length > 200) {
      throw new Error('Data is too long, max 200');
    }

    // 凭证校验
    const { teamId, tmbId } = await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId,
      per: 'w'
    });

    jsonRes<PushDataResponse>(res, {
      data: await pushDataToDatasetCollection({
        ...req.body,
        teamId,
        tmbId
      })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});

export async function pushDataToDatasetCollection({
  teamId,
  tmbId,
  collectionId,
  data,
  mode,
  prompt,
  billId
}: {
  teamId: string;
  tmbId: string;
} & PushDatasetDataProps): Promise<PushDataResponse> {
  const { datasetId, model, maxToken } = await checkModelValid({
    mode,
    collectionId
  });

  // format q and a, remove empty char
  data.forEach((item) => {
    item.q = simpleText(item.q);
    item.a = simpleText(item.a);

    item.indexes = item.indexes
      ?.map((index) => {
        return {
          ...index,
          text: simpleText(index.text)
        };
      })
      .filter(Boolean);
  });

  // filter repeat or equal content
  const set = new Set();
  const filterResult: Record<string, PushDatasetDataChunkProps[]> = {
    success: [],
    overToken: [],
    repeat: [],
    error: []
  };
  await Promise.all(
    data.map(async (item) => {
      if (!item.q) {
        filterResult.error.push(item);
        return;
      }

      const text = item.q + item.a;

      // count q token
      const token = countPromptTokens(item.q);

      if (token > maxToken) {
        filterResult.overToken.push(item);
        return;
      }

      if (set.has(text)) {
        console.log('repeat', item);
        filterResult.repeat.push(item);
      } else {
        filterResult.success.push(item);
        set.add(text);
      }
    })
  );

  // 插入记录
  const insertRes = await MongoDatasetTraining.insertMany(
    filterResult.success.map((item) => ({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      billId,
      mode,
      prompt,
      model,
      q: item.q,
      a: item.a,
      indexes: item.indexes
    }))
  );

  insertRes.length > 0 && startQueue();
  delete filterResult.success;

  return {
    insertLen: insertRes.length,
    ...filterResult
  };
}

export async function checkModelValid({
  mode,
  collectionId
}: {
  mode: `${TrainingModeEnum}`;
  collectionId: string;
}) {
  const {
    datasetId: { _id: datasetId, vectorModel, agentModel }
  } = await getCollectionWithDataset(collectionId);

  if (mode === TrainingModeEnum.chunk) {
    if (!collectionId) return Promise.reject(`CollectionId is empty`);
    const vectorModelData = getVectorModel(vectorModel);
    if (!vectorModelData) {
      return Promise.reject(`Model ${vectorModel} is inValid`);
    }
    return {
      datasetId,
      maxToken: vectorModelData.maxToken * 1.5,
      model: vectorModelData.model
    };
  }

  if (mode === TrainingModeEnum.qa) {
    const qaModelData = getQAModel(agentModel);
    if (!qaModelData) {
      return Promise.reject(`Model ${agentModel} is inValid`);
    }
    return {
      datasetId,
      maxToken: qaModelData.maxContext * 0.8,
      model: qaModelData.model
    };
  }
  return Promise.reject(`Mode ${mode} is inValid`);
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '12mb'
  }
};
