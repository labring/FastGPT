/* 
    Create one dataset collection
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { TextCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { TrainingModeEnum, DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/limit/dataset';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataToDatasetCollection } from '@/service/core/dataset/data/controller';
import { hashStr } from '@fastgpt/global/common/string/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const {
      text,
      trainingType = TrainingModeEnum.chunk,
      chunkSize = 512,
      chunkSplitter,
      qaPrompt,
      ...body
    } = req.body as TextCreateDatasetCollectionParams;

    const { teamId, tmbId } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId: body.datasetId,
      per: 'w'
    });

    // 1. split text to chunks
    const { chunks } = splitText2Chunks({
      text,
      chunkLen: chunkSize,
      overlapRatio: trainingType === TrainingModeEnum.chunk ? 0.2 : 0,
      customReg: chunkSplitter ? [chunkSplitter] : [],
      countTokens: false
    });

    // 2. check dataset limit
    await checkDatasetLimit({
      teamId,
      freeSize: global.feConfigs?.subscription?.datasetStoreFreeSize,
      insertLen: predictDataLimitLength(trainingType, chunks)
    });

    // 3. create collection
    const collectionId = await createOneCollection({
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.virtual,

      trainingType,
      chunkSize,
      chunkSplitter,
      qaPrompt,

      hashRawText: hashStr(text),
      rawTextLength: text.length
    });

    // 4. push chunks to training queue
    const insertResults = await pushDataToDatasetCollection({
      teamId,
      tmbId,
      collectionId,
      trainingMode: trainingType,
      data: chunks.map((text, index) => ({
        q: text,
        chunkIndex: index
      }))
    });

    jsonRes(res, {
      data: { collectionId, results: insertResults }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
