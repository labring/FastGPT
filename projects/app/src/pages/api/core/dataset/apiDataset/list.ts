import { APIFileItem } from '@/global/core/dataset/apiDataset';
import { NextAPI } from '@/service/middleware/entry';
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
    throw new Error('apiServer is required');
  }

  const { baseUrl, authorization } = apiServer;

  const res = await axios.post(
    `${baseUrl}/v1/file/list`,
    {
      searchKey,
      parentId
    },
    {
      headers: {
        Authorization: authorization
      }
    }
  );

  const files = res.data.data as APIFileItem[];
  if (!Array.isArray(files)) {
    throw new Error('Invalid file list format');
  }
  files.forEach((file) => {
    if (!file.id || !file.name || typeof file.type === 'undefined') {
      throw new Error('Invalid file data format');
    }
  });

  return files;
}

export default NextAPI(handler);
