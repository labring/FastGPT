import { isProduction, EXCLUDED_TEMPLATE_IDS } from '@fastgpt/global/common/system/constants';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { MongoAppTemplate } from './templateSchema';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { addMinutes } from 'date-fns';

const getFileTemplates = async (locale?: string): Promise<AppTemplateSchemaType[]> => {
  return (await pluginClient.listWorkflows(locale)) as AppTemplateSchemaType[];
};

const getAppTemplates = async (locale?: string) => {
  const originCommunityTemplates = await getFileTemplates(locale);
  const communityTemplates = originCommunityTemplates
    .filter((template) => !EXCLUDED_TEMPLATE_IDS.includes(template.templateId))
    .map((template) => {
      return {
        ...template,
        templateId: `${AppToolSourceEnum.community}-${template.templateId.split('.')[0]}`
      };
    });

  const dbTemplates = await MongoAppTemplate.find().lean();

  // Merge db data to community templates
  const communityTemplateConfig = communityTemplates.map((template) => {
    const config = dbTemplates.find((t) => t.templateId === template.templateId);

    if (config) {
      const merged = {
        ...template,
        ...config
      };
      return merged;
    }

    return template;
  });
  const res = [
    ...communityTemplateConfig,
    ...dbTemplates.filter((t) => isCommercialTemaplte(t.templateId))
  ].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return res;
};

export const getAppTemplatesAndLoadThem = async (refresh = false, locale = 'zh-CN') => {
  // 首次强制刷新
  if (!global.templatesRefreshTime) {
    global.templatesRefreshTime = Date.now() - 10000;
  }
  if (!global.appTemplatesByLocale) {
    global.appTemplatesByLocale = {};
  }
  if (!global.appTemplatesByLocale[locale]) {
    global.appTemplatesByLocale[locale] = [];
  }

  if (
    isProduction &&
    // 有模板缓存且对应语言有数据
    global.appTemplatesByLocale[locale].length > 0 &&
    // 缓存时间未过期
    global.templatesRefreshTime > Date.now() &&
    !refresh
  ) {
    return global.appTemplatesByLocale[locale];
  }

  try {
    const appTemplates = await getAppTemplates(locale);
    global.appTemplatesByLocale[locale] = appTemplates;
    global.templatesRefreshTime = addMinutes(new Date(), 30).getTime(); // 缓存30分钟
    return appTemplates;
  } catch (error) {
    return [];
  }
};

export const isCommercialTemaplte = (templateId: string) => {
  return templateId.startsWith(AppToolSourceEnum.commercial);
};

declare global {
  var appTemplatesByLocale: Record<string, AppTemplateSchemaType[]>;
  var templatesRefreshTime: number;
}
