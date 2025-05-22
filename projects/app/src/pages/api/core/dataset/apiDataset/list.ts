import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/getApiRequest';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { type NextApiRequest } from 'next';

export type GetApiDatasetFileListProps = {
  searchKey?: string;
  parentId?: ParentIdType;
  datasetId: string;
};

async function handler(req: NextApiRequest) {
  let { searchKey = '', parentId = null, datasetId } = req.body;

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

  const apiDataset = await getApiDatasetRequest({
    apiServer,
    yuqueServer,
    feishuServer
  });

  if (apiDataset) {
    return apiDataset?.listFiles({ searchKey, parentId });
  }

  return Promise.reject(DatasetErrEnum.noApiServer);
}

export default NextAPI(handler);
