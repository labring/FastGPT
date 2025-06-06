import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { createFileToken } from '@fastgpt/service/support/permission/controller';
import { BucketNameEnum, ReadFileBaseUrl } from '@fastgpt/global/common/file/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';

export type readCollectionSourceQuery = {};

export type readCollectionSourceBody = {
  collectionId: string;

  appId?: string;
  chatId?: string;
  chatItemDataId?: string;
} & OutLinkChatAuthProps;

export type readCollectionSourceResponse = {
  type: 'url';
  value: string;
};

async function handler(
  req: ApiRequestProps<readCollectionSourceBody, readCollectionSourceQuery>
): Promise<readCollectionSourceResponse> {
  const { collectionId, appId, chatId, chatItemDataId, shareId, outLinkUid, teamId, teamToken } =
    req.body;

  const {
    collection,
    teamId: userTeamId,
    tmbId: uid,
    authType
  } = await (async () => {
    if (!appId || !chatId || !chatItemDataId) {
      return authDatasetCollection({
        req,
        authToken: true,
        authApiKey: true,
        collectionId: req.body.collectionId,
        per: ReadPermissionVal
      });
    }

    /* 
      1. auth chat read permission
      2. auth collection quote in chat
      3. auth outlink open show quote
    */
    const [authRes, collection] = await Promise.all([
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
      getCollectionWithDataset(collectionId),
      authCollectionInChat({ appId, chatId, chatItemDataId, collectionIds: [collectionId] })
    ]);

    if (!authRes.showRawSource) {
      return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
    }

    return {
      ...authRes,
      collection
    };
  })();

  const sourceUrl = await (async () => {
    if (collection.type === DatasetCollectionTypeEnum.file && collection.fileId) {
      const token = await createFileToken({
        bucketName: BucketNameEnum.dataset,
        teamId: userTeamId,
        uid,
        fileId: collection.fileId,
        customExpireMinutes: authType === 'outLink' ? 5 : undefined
      });

      return `${ReadFileBaseUrl}/${collection.name}?token=${token}`;
    }
    if (collection.type === DatasetCollectionTypeEnum.link && collection.rawLink) {
      return collection.rawLink;
    }
    if (collection.type === DatasetCollectionTypeEnum.apiFile && collection.apiFileId) {
      return (await getApiDatasetRequest(collection.dataset.apiDatasetServer)).getFilePreviewUrl({
        apiFileId: collection.apiFileId
      });
    }
    if (collection.type === DatasetCollectionTypeEnum.externalFile) {
      if (collection.externalFileId && collection.dataset.externalReadUrl) {
        return collection.dataset.externalReadUrl.replace('{{fileId}}', collection.externalFileId);
      }
      if (collection.externalFileUrl) {
        return collection.externalFileUrl;
      }
    }

    return '';
  })();

  return {
    type: 'url',
    value: sourceUrl
  };
}

export default NextAPI(handler);
