import { NextAPI } from '@/service/middleware/entry';
import { authChatTargetCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { formatDatasetDataValue } from '@fastgpt/service/core/dataset/data/controller';
import { UserError } from '@fastgpt/global/common/error/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetQuoteDataBodySchema,
  GetQuoteDataResponseSchema,
  type GetQuoteDataResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';

async function handler(req: ApiRequestProps): Promise<GetQuoteDataResponse> {
  const body = parseApiInput({ req, bodySchema: GetQuoteDataBodySchema }).body;
  const { id: dataId } = body;

  // Auth
  const { collection, q, a } = await (async () => {
    if (body.chatId && body.sourceType && body.chatItemDataId) {
      const { sourceType, sourceId, chatId, outLinkAuthData } = body;
      const authRes = await authChatTargetCrud({
        req,
        authToken: true,
        sourceType,
        sourceId,
        chatId,
        outLinkAuthData
      });
      const resolvedSourceId = authRes.sourceId;

      const datasetData = await MongoDatasetData.findById(dataId).lean();
      if (!datasetData) {
        return Promise.reject(new UserError(i18nT('common:data_not_found')));
      }

      const [collection] = await Promise.all([
        MongoDatasetCollection.findById(datasetData.collectionId).lean(),
        authCollectionInChat({
          sourceType,
          sourceId: resolvedSourceId,
          chatId,
          collectionIds: [datasetData.collectionId]
        })
      ]);
      if (!collection) {
        return Promise.reject(new UserError('Can not find the collection'));
      }
      if (!authRes.showCite) {
        return Promise.reject(new UserError(ChatErrEnum.unAuthChat));
      }

      return {
        collection,
        ...(await formatDatasetDataValue({
          q: datasetData.q,
          a: datasetData.a,
          imageId: datasetData.imageId
        }))
      };
    } else {
      const { datasetData, collection } = await authDatasetData({
        req,
        authToken: true,
        authApiKey: true,
        dataId,
        per: ReadPermissionVal
      });
      return {
        collection,
        ...(await formatDatasetDataValue({
          q: datasetData.q,
          a: datasetData.a,
          imageId: datasetData.imageId
        }))
      };
    }
  })();

  return GetQuoteDataResponseSchema.parse({
    collection,
    q,
    a
  });
}

export default NextAPI(handler);
