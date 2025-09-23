import { NextAPI } from '@/service/middleware/entry';
import { type DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { formatDatasetDataValue } from '@fastgpt/service/core/dataset/data/controller';

export type GetQuoteDataResponse = {
  collection: DatasetCollectionSchemaType;
  q: string;
  a?: string;
};

export type GetQuoteDataProps =
  | {
      id: string;
    }
  | ({
      id: string;
      appId: string;
      chatId: string;
      chatItemDataId: string;
    } & OutLinkChatAuthProps);

async function handler(req: ApiRequestProps<GetQuoteDataProps>): Promise<GetQuoteDataResponse> {
  const { id: dataId } = req.body;

  // Auth
  const { collection, q, a } = await (async () => {
    if ('chatId' in req.body) {
      const { appId, chatId, shareId, outLinkUid, teamId, teamToken, chatItemDataId } = req.body;
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
        return Promise.reject(i18nT('common:data_not_found'));
      }

      const [collection, { responseDetail }] = await Promise.all([
        MongoDatasetCollection.findById(datasetData.collectionId).lean(),
        authChatCrud({
          req,
          authToken: true,
          appId,
          chatId,
          shareId,
          outLinkUid,
          teamId,
          teamToken
        }),
        authCollectionInChat({
          appId,
          chatId,
          chatItemDataId,
          collectionIds: [String(datasetData.collectionId)]
        })
      ]);
      if (!collection) {
        return Promise.reject('Can not find the collection');
      }
      if (!responseDetail) {
        return Promise.reject(ChatErrEnum.unAuthChat);
      }

      return {
        collection,
        ...formatDatasetDataValue({
          teamId: datasetData.teamId,
          datasetId: datasetData.datasetId,
          q: datasetData.q,
          a: datasetData.a,
          imageId: datasetData.imageId
        })
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
        ...formatDatasetDataValue({
          teamId: datasetData.teamId,
          datasetId: datasetData.datasetId,
          q: datasetData.q,
          a: datasetData.a,
          imageId: datasetData.imageId
        })
      };
    }
  })();

  return {
    collection,
    q,
    a
  };
}

export default NextAPI(handler);
