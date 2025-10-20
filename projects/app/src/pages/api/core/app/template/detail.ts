import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { getAppTemplatesAndLoadThem } from '@fastgpt/templates/register';
import { isEnLocale } from '@fastgpt/service/common/middle/i18n';

type Props = {
  templateId: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<AppTemplateSchemaType | undefined> {
  await authCert({ req, authToken: true });
  const { templateId } = req.query as Props;

  const templateMarketItems: AppTemplateSchemaType[] = await getAppTemplatesAndLoadThem(
    false,
    isEnLocale(req)
  );

  return templateMarketItems.find((item) => item.templateId === templateId);
}

export default NextAPI(handler);
