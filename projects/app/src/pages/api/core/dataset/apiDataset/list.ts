import { NextAPI } from '@/service/middleware/entry';
import { APIFileItem, APIFileListResponse } from '@fastgpt/global/core/dataset/apiDataset';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import axios from 'axios';
import { NextApiRequest } from 'next';

export type GetApiDatasetFileListProps = {
  searchKey?: string;
  parentId?: string | null;
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

  const { apiServer } = dataset;

  if (!apiServer) {
    return Promise.reject('apiServer is required');
  }

  const { baseUrl, authorization } = apiServer;

  const { data } = await axios.post<APIFileListResponse>(
    `${baseUrl}/v1/file/list`,
    {
      searchKey,
      parentId
    },
    {
      headers: {
        Authorization: `Bearer ${authorization}`
      }
    }
  );

  const files = data.data;
  if (!Array.isArray(files)) {
    return Promise.reject('Invalid file list format');
  }
  if (files.some((file) => !file.id || !file.name || typeof file.type === 'undefined')) {
    return Promise.reject('Invalid file data format');
  }

  return files;
}

export default NextAPI(handler);
