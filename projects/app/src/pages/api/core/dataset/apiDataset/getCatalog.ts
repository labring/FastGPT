import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { NextAPI } from '@/service/middleware/entry';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import type {
  APIFileItem,
  APIFileServer,
  YuqueServer,
  FeishuShareServer,
  FeishuKnowledgeServer,
  FeishuPrivateServer
} from '@fastgpt/global/core/dataset/apiDataset';
import { type NextApiRequest } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export type GetApiDatasetCataLogProps = {
  parentId?: ParentIdType;
  yuqueServer?: YuqueServer;
  feishuShareServer?: FeishuShareServer;
  feishuKnowledgeServer?: FeishuKnowledgeServer;
  feishuPrivateServer?: FeishuPrivateServer;
  apiServer?: APIFileServer;
};

export type GetApiDatasetCataLogResponse = APIFileItem[];

async function handler(req: NextApiRequest) {
  let {
    searchKey = '',
    parentId = null,
    yuqueServer,
    feishuShareServer,
    apiServer,
    feishuKnowledgeServer,
    feishuPrivateServer
  } = req.body;

  await authCert({ req, authToken: true });

  const data = await (
    await getApiDatasetRequest({
      feishuShareServer,
      yuqueServer,
      apiServer,
      feishuKnowledgeServer,
      feishuPrivateServer
    })
  ).listFiles({ parentId, searchKey });

  return data?.filter((item: APIFileItem) => item.hasChild === true) || [];
}

export default NextAPI(handler);
