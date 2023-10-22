/* 
  insert one data to dataset (immediately insert)
  manual input or mark data
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { SetOneDatasetDataProps } from '@/global/core/api/datasetReq';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { countPromptTokens } from '@/global/common/tiktoken';
import { getVectorModel } from '@/service/core/ai/model';
import { insertData2Dataset, hasSameValue } from '@/service/core/dataset/data/utils';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    jsonRes<string>(res, {
      data: await getVectorAndInsertDataset({
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

export async function getVectorAndInsertDataset(
  props: SetOneDatasetDataProps & { userId: string }
): Promise<string> {
  let { datasetId, collectionId, q, a, userId } = props;

  if (!datasetId) {
    return Promise.reject('知识库 ID 不能为空');
  }

  if (!q) {
    return Promise.reject('索引内容不能为空');
  }

  if (!collectionId) {
    return Promise.reject('集合 ID 和集合类型不能同时为空');
  }

  // auth collection and get dataset
  const collection = await MongoDatasetCollection.findOne({
    _id: collectionId,
    userId,
    datasetId,
    type: { $ne: DatasetCollectionTypeEnum.folder }
  }).populate('datasetId', '_id vectorModel');

  if (!collection) {
    return Promise.reject('集合不存在');
  }
  const dataset = collection.datasetId as unknown as DatasetSchemaType;

  // format data
  const formatQ = q?.replace(/\\n/g, '\n').trim().replace(/'/g, '"');
  const formatA = a?.replace(/\\n/g, '\n').trim().replace(/'/g, '"') || '';

  // token check
  const token = countPromptTokens(formatQ, 'system');

  if (token > getVectorModel(dataset.vectorModel).maxToken) {
    return Promise.reject('Q Over Tokens');
  }

  // Duplicate data check
  await hasSameValue({
    collectionId,
    q,
    a
  });

  return insertData2Dataset({
    userId,
    q: formatQ,
    a: formatA,
    collectionId,
    datasetId,
    model: dataset.vectorModel
  });
}
