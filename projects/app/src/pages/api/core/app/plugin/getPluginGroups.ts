import type { NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { getPluginGroups } from '@/service/core/app/plugin';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { PluginGroupSchemaType } from '@fastgpt/service/core/app/store/type';

export type GetSystemPluginTemplatesBody = {};

async function handler(
  req: ApiRequestProps<GetSystemPluginTemplatesBody>,
  res: NextApiResponse<any>
): Promise<PluginGroupSchemaType[]> {
  await authCert({ req, authToken: true });

  return getPluginGroups();
}

export default NextAPI(handler);
