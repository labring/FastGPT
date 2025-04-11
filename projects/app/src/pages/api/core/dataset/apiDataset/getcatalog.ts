import { getProApiDatasetFileListRequest } from '@/service/core/dataset/apiDataset/controller';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { APIFileItem } from '@fastgpt/global/core/dataset/apiDataset';
import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/api';
import { NextApiRequest } from 'next';
import { YuqueServer, FeishuServer } from '@fastgpt/global/core/dataset/apiDataset';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
export type GetApiDatasetCataLogProps = {
  searchKey?: string;
  parentId?: ParentIdType;
  yuqueServer?: YuqueServer;
  feishuServer?: FeishuServer;
  apiServer?: string;
};

export type GetApiDatasetCataLogResponse = APIFileItem[];

async function handler(req: NextApiRequest) {
  let { searchKey = '', parentId = null, yuqueServer, feishuServer, apiServer } = req.body;

  const { userId } = await authCert({ req, authToken: true });

  feishuServer = feishuServer;
  yuqueServer = yuqueServer;
  apiServer = apiServer;

  const data = await (async () => {
    if (apiServer) {
      return useApiDatasetRequest({ apiServer }).listFiles({ searchKey, parentId });
    }
    if (feishuServer || yuqueServer) {
      return getProApiDatasetFileListRequest({
        feishuServer,
        yuqueServer,
        parentId
      });
    }
    return Promise.reject(DatasetErrEnum.noApiServer);
  })();
  return data.filter((item: APIFileItem) => item.hasChild === true);
}

export default NextAPI(handler);
