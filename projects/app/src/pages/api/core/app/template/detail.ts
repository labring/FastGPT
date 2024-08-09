import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { TemplateMarketItemType } from '@fastgpt/global/core/workflow/type';
import { getTemplateMarketItemDetail } from '@/service/core/app/template';

type Props = {
  templateId: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<TemplateMarketItemType | undefined> {
  await authCert({ req, authToken: true });
  const { templateId } = req.query as Props;

  return getTemplateMarketItemDetail(templateId);
}

export default NextAPI(handler);
