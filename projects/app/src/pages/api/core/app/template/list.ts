import type { NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { getAppTemplatesAndLoadThem } from '@fastgpt/templates/register';
import { AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ApiRequestProps } from '@fastgpt/service/type/next';

export type ListParams = {
  isQuickTemplate?: boolean;
  type?: AppTypeEnum | 'all';
};

async function handler(
  req: ApiRequestProps<ListParams>,
  res: NextApiResponse<any>
): Promise<AppTemplateSchemaType[]> {
  await authCert({ req, authToken: true });

  const { isQuickTemplate = false, type = 'all' } = req.query;

  const templateMarketItems = await getAppTemplatesAndLoadThem();

  let filteredItems = templateMarketItems.filter((item) => {
    if (!item.isActive) return false;
    if (type === 'all') return true;
    return item.type === type;
  });

  if (isQuickTemplate) {
    if (filteredItems.some((item) => item.isQuickTemplate !== undefined)) {
      filteredItems = filteredItems.filter((item) => item.isQuickTemplate);
    } else {
      filteredItems = filteredItems.slice(0, 3);
    }
  }

  return filteredItems.map((item) => {
    return {
      templateId: item.templateId,
      name: item.name,
      intro: item.intro,
      avatar: item.avatar,
      tags: item.tags,
      type: item.type,
      author: item.author,
      userGuide: item.userGuide,
      workflow: {}
    };
  });
}

export default NextAPI(handler);
