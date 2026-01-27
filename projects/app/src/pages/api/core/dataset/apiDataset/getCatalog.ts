import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { NextAPI } from '@/service/middleware/entry';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type NextApiRequest } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type {
  APIFileItemType,
  PluginDatasetServerType
} from '@fastgpt/global/core/dataset/apiDataset/type';

export type GetApiDatasetCataLogProps = {
  parentId?: ParentIdType;
  pluginDatasetServer?: PluginDatasetServerType;
};

export type GetApiDatasetCataLogResponse = APIFileItemType[];

async function handler(req: NextApiRequest) {
  let { searchKey = '', parentId = null, pluginDatasetServer } = req.body;

  await authCert({ req, authToken: true });

  const data = await (
    await getApiDatasetRequest(pluginDatasetServer)
  ).listFiles({ parentId, searchKey });

  return data?.filter((item) => item.hasChild === true) || [];
}

export default NextAPI(handler);
