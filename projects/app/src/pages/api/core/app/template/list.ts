import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { AppTemplateSchemaType } from '@fastgpt/service/core/app/templates/type';
import { getAppTemplatesAndLoadThem } from '@fastgpt/templates/register';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<AppTemplateSchemaType[]> {
  await authCert({ req, authToken: true });

  const templateMarketItems = await getAppTemplatesAndLoadThem();

  return templateMarketItems.filter((item) => item.isActive);
}

export default NextAPI(handler);
