import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { getAppTemplatesAndLoadThem } from '@fastgpt/service/core/app/templates/register';
import { LocaleList } from '@fastgpt/global/common/i18n/type';

type Props = {
  templateId: string;
};

const getLocale = (req: NextApiRequest): string => {
  const locale = req.cookies['NEXT_LOCALE'];
  if (locale && LocaleList.includes(locale as any)) {
    return locale;
  }
  return 'zh-CN';
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<AppTemplateSchemaType | undefined> {
  await authCert({ req, authToken: true });
  const { templateId } = req.query as Props;

  const templateMarketItems: AppTemplateSchemaType[] = await getAppTemplatesAndLoadThem(
    false,
    getLocale(req)
  );

  return templateMarketItems.find((item) => item.templateId === templateId);
}

export default NextAPI(handler);
