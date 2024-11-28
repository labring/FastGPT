import { APIFileItem } from '@/global/core/dataset/type';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import axios from 'axios';
import { NextApiRequest } from 'next';

export type GetApiDatasetFileListProps = {
  searchKey?: string;
  parentId?: string | null;
  datasetId: string;
  apiServer: {
    baseUrl: string;
    authorization: string;
  };
};

export type GetApiDatasetFileListResponse = APIFileItem[];

async function handler(req: NextApiRequest) {
  let { searchKey = '', parentId = null, datasetId, apiServer } = req.body;

  await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

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

  return res.data.data;
}

export default NextAPI(handler);
