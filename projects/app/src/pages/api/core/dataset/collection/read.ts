import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { createFileToken } from '@fastgpt/service/support/permission/controller';
import { BucketNameEnum, ReadFileBaseUrl } from '@fastgpt/global/common/file/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AuthOutLinkProps } from '@fastgpt/global/support/outLink/api';
import { authOutLink } from '@/service/support/permission/auth/outLink';

export type readCollectionSourceQuery = {};

export type readCollectionSourceBody = {
  collectionId: string;
  isShare?: boolean;
} & AuthOutLinkProps;

export type readCollectionSourceResponse = {
  type: 'url';
  value: string;
};

async function handler(
  req: ApiRequestProps<readCollectionSourceBody, readCollectionSourceQuery>
): Promise<readCollectionSourceResponse> {
  const { isShare, outLinkUid, shareId } = req.body;

  if (isShare) {
    await authOutLink({ shareId, outLinkUid });
  }

  const { collection, teamId, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: req.body.collectionId,
    per: ReadPermissionVal
  });

  const sourceUrl = await (async () => {
    if (collection.type === DatasetCollectionTypeEnum.file && collection.fileId) {
      const token = await createFileToken({
        bucketName: BucketNameEnum.dataset,
        teamId,
        tmbId,
        fileId: collection.fileId
      });

      return `${ReadFileBaseUrl}?token=${token}`;
    }
    if (collection.type === DatasetCollectionTypeEnum.link && collection.rawLink) {
      return collection.rawLink;
    }
    if (collection.type === DatasetCollectionTypeEnum.externalFile) {
      if (collection.externalFileId && collection.datasetId.externalReadUrl) {
        return collection.datasetId.externalReadUrl.replace(
          '{{fileId}}',
          collection.externalFileId
        );
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
