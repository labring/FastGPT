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
  offset: number;
  pageSize: number;
};

export type GetApiDatasetFileListResponse = {
  list: APIFileItem[];
  total: number;
};

async function handler(req: NextApiRequest) {
  let {
    searchKey = '',
    parentId = null,
    datasetId,
    nextPageToken = '',
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
    const { list, total } = await useApiDatasetRequest({ apiServer }).listFiles({
      searchKey,
      parentId,
      offset,
      pageSize
    });
    return {
      list,
      total
    };
  }
  if (feishuServer || yuqueServer) {
    return getFeishuAndYuqueDatasetFileList({
      feishuServer,
      yuqueServer,
      parentId,
      nextPageToken,
      offset,
      pageSize
    });
  }

  return Promise.reject(DatasetErrEnum.noApiServer);
}

export default NextAPI(handler);
