import { NextAPI } from '@/service/middleware/entry';
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
};

export type GetApiDatasetFileListResponse = APIFileItem[];

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
  if (!apiServer) {
    return Promise.reject('apiServer is required');
  }

  return useApiDatasetRequest({ apiServer }).listFiles({ searchKey, parentId });
}

export default NextAPI(handler);
