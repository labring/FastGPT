import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export type GetDatasetTagsResponse = PaginationResponse<DatasetTagType>;
export type GetDatasetTagsProps = PaginationProps<{
  datasetId: string;
  searchText?: string;
}>;

async function handler(
  req: ApiRequestProps<{}, GetDatasetTagsProps>
): Promise<GetDatasetTagsResponse> {
  let { datasetId, pageSize, current, searchText } = req.query;
  if (!datasetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }
  searchText = searchText?.replace(/'/g, '');

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const match = {
    teamId,
    datasetId,
    ...(searchText
      ? {
          tag: new RegExp(searchText, 'i')
        }
      : {})
  };

  const [tags, total]: [DatasetTagType[], number] = await Promise.all([
    MongoDatasetCollectionTags.find(match)
      .sort({ _id: -1 })
      .skip(pageSize * (current - 1))
      .limit(pageSize)
      .lean(),
    MongoDatasetCollectionTags.countDocuments(match)
  ]);

  return {
    list: tags,
    total
  };
}

export default NextAPI(handler);
