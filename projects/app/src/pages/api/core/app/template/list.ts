import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { SystemTemplateSchemaType } from '@fastgpt/service/core/app/templates/type';
import { getTemplateMarketItemList } from '@/service/core/app/template';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<SystemTemplateSchemaType[]> {
  await authCert({ req, authToken: true });

  return getTemplateMarketItemList();
}

export default NextAPI(handler);
