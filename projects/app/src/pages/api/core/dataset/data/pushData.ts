/* push data to training queue */
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, TrainingData } from '@/service/mongo';
import { MongoDataset } from '@fastgpt/core/dataset/schema';
import { authUser } from '@fastgpt/support/user/auth';
import { authDataset } from '@/service/utils/auth';
import { withNextCors } from '@/service/utils/tools';
import { TrainingModeEnum } from '@/constants/plugin';
import { startQueue } from '@/service/utils/tools';
import { getVectorModel } from '@/service/utils/data';
import { DatasetDataItemType } from '@/types/core/dataset/data';
import { countPromptTokens } from '@/utils/common/tiktoken';
import type { PushDataResponse } from '@/global/core/api/datasetRes.d';
import type { PushDataProps } from '@/global/core/api/datasetReq.d';
import { authFileIdValid } from '@/service/dataset/auth';

const modeMap = {
  [TrainingModeEnum.index]: true,
  [TrainingModeEnum.qa]: true
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { kbId, data, mode = TrainingModeEnum.index } = req.body as PushDataProps;

    if (!kbId || !Array.isArray(data)) {
      throw new Error('KbId or data is empty');
    }

    if (modeMap[mode] === undefined) {
      throw new Error('Mode is error');
    }

    if (data.length > 500) {
      throw new Error('Data is too long, max 500');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true, authApiKey: true });

    jsonRes<PushDataResponse>(res, {
      data: await pushDataToKb({
        ...req.body,
        userId
      })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});

export async function pushDataToKb({
  userId,
  kbId,
  data,
  mode,
  prompt,
  billId
}: { userId: string } & PushDataProps): Promise<PushDataResponse> {
  const [kb, vectorModel] = await Promise.all([
    authDataset({
      userId,
      kbId
    }),
    (async () => {
      if (mode === TrainingModeEnum.index) {
        const vectorModel = (await MongoDataset.findById(kbId, 'vectorModel'))?.vectorModel;

        return getVectorModel(vectorModel || global.vectorModels[0].model);
      }
      return global.vectorModels[0];
    })()
  ]);

  const modeMaxToken = {
    [TrainingModeEnum.index]: vectorModel.maxToken * 1.5,
    [TrainingModeEnum.qa]: global.qaModel.maxToken * 0.8
  };

  // filter repeat or equal content
  const set = new Set();
  const filterResult: Record<string, DatasetDataItemType[]> = {
    success: [],
    overToken: [],
    fileIdInvalid: [],
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
      const token = countPromptTokens(item.q, 'system');

      if (token > modeMaxToken[mode]) {
        filterResult.overToken.push(item);
        return;
      }

      try {
        await authFileIdValid(item.file_id);
      } catch (error) {
        filterResult.fileIdInvalid.push(item);
        return;
      }

      if (!set.has(text)) {
        filterResult.success.push(item);
        set.add(text);
      }
    })
  );

  // 插入记录
  const insertRes = await TrainingData.insertMany(
    filterResult.success.map((item) => ({
      ...item,
      userId,
      kbId,
      mode,
      prompt,
      billId,
      vectorModel: vectorModel.model
    }))
  );

  insertRes.length > 0 && startQueue();
  delete filterResult.success;

  return {
    insertLen: insertRes.length,
    ...filterResult
  };
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '12mb'
  }
};
