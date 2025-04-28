import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';

export type GetQuoteDataResponse = {
  collection: CollectionWithDatasetType;
  q: string;
  a: string;
};

export type GetQuoteDataProps = {
  id: string;
  appId: string;
  chatId: string;
  shareId?: string;
  outLinkUid?: string;
  teamId?: string;
  teamToken?: string;
};
async function handler(req: NextApiRequest): Promise<GetQuoteDataResponse> {
  const {
    id: dataId,
    appId,
    chatId,
    shareId,
    outLinkUid,
    teamId,
    teamToken
  } = req.body as GetQuoteDataProps;

  await authChatCrud({
    req,
    authToken: true,
    appId,
    chatId,
    shareId,
    outLinkUid,
    teamId,
    teamToken
  });

  const datasetData = await MongoDatasetData.findById(dataId);
  if (!datasetData) {
    return Promise.reject('core.dataset.error.Data not found');
  }

  const collection = await getCollectionWithDataset(datasetData.collectionId);
  if (!collection) {
    return Promise.reject('core.dataset.error.Collection not found');
  }

  return {
    collection,
    q: datasetData.q,
    a: datasetData.a
  };
}

export default NextAPI(handler);
