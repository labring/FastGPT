import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/getApiRequest';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import type {
  APIFileItem,
  APIFileServer,
  YuqueServer,
  FeishuServer
} from '@fastgpt/global/core/dataset/apiDataset';
import { type NextApiRequest } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export type GetApiDatasetCataLogProps = {
  parentId?: ParentIdType;
  yuqueServer?: YuqueServer;
  feishuServer?: FeishuServer;
  apiServer?: APIFileServer;
};

export type GetApiDatasetCataLogResponse = APIFileItem[];

async function handler(req: NextApiRequest) {
  let { parentId = null, yuqueServer, feishuServer, apiServer } = req.body;

  await authCert({ req, authToken: true });

  const data = await (async () => {
    if (feishuServer || yuqueServer || apiServer) {
      const apiDataset = await getApiDatasetRequest({
        feishuServer,
        yuqueServer,
        apiServer
      });

      const result = await apiDataset?.listFiles({ parentId });
      return result || [];
    }
    return Promise.reject(DatasetErrEnum.noApiServer);
  })();

  return data?.filter((item: APIFileItem) => item.hasChild === true) || [];
}

export default NextAPI(handler);
