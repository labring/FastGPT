import { getFeishuAndYuqueDatasetFileList } from '@/service/core/dataset/apiDataset/controller';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { APIFileItem } from '@fastgpt/global/core/dataset/apiDataset';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/api';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextApiRequest } from 'next';

export type GetApiDatasetFileListProps = {
  searchKey?: string;
  parentId?: ParentIdType;
  datasetId: string;
  pageToken?: string;
  offset?: number;
  pageSize: number;
};

export type GetApiDatasetFileListResponse = {
  nextPageToken?: string;
  list: APIFileItem[];
};

async function handler(req: NextApiRequest) {
  let {
    searchKey = '',
    parentId = null,
    datasetId,
    pageToken = '',
    pageSize,
    offset = 0
  } = req.body;

  const { dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const apiServer = dataset.apiServer;
  const feishuServer = dataset.feishuServer;
  const yuqueServer = dataset.yuqueServer;

  if (apiServer) {
    const { list } = await useApiDatasetRequest({ apiServer }).listFiles({
      searchKey,
      parentId,
      offset,
      pageSize
    });
    return {
      list
    };
  }
  if (feishuServer || yuqueServer) {
    return getFeishuAndYuqueDatasetFileList({
      feishuServer,
      yuqueServer,
      parentId,
      pageToken,
      pageSize
    });
  }

  return Promise.reject(DatasetErrEnum.noApiServer);
}

export default NextAPI(handler);
