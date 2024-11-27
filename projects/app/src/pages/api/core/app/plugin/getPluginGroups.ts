import type { NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { getPluginGroups, getSystemPlugins } from '@/service/core/app/plugin';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { PluginGroupSchemaType } from '@fastgpt/service/core/app/store/type';
import { defaultGroup } from '@/pages/toolkit';

export type GetSystemPluginTemplatesBody = {};

async function handler(
  req: ApiRequestProps<GetSystemPluginTemplatesBody>,
  res: NextApiResponse<any>
): Promise<PluginGroupSchemaType[]> {
  await authCert({ req, authToken: true });
  const allGroups = await getPluginGroups();

  const plugins = await getSystemPlugins();

  const result = allGroups
    .filter((group) => {
      const groupTypes = group.groupTypes.filter((type) =>
        plugins.find((plugin) => plugin.templateType === type.typeId)
      );
      return groupTypes.length > 0;
    })
    .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));

  return result;
}

export default NextAPI(handler);
