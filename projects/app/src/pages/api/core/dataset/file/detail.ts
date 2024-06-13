import type { NextApiRequest } from 'next';
import { authDatasetFile } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest) {
  const { fileId } = req.query as { fileId: string };
  // 凭证校验
  const { file } = await authDatasetFile({ req, authToken: true, fileId, per: ReadPermissionVal });

  return file;
}

export default NextAPI(handler);
