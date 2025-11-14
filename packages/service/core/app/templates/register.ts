import { isProduction } from '@fastgpt/global/common/system/constants';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { MongoAppTemplate } from './templateSchema';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { addMinutes } from 'date-fns';

const getFileTemplates = async (): Promise<AppTemplateSchemaType[]> => {
  const res = await pluginClient.workflow.getTemplateList();
  if (res.status === 200) return res.body as AppTemplateSchemaType[];
  else return Promise.reject(res.body);
};

const getAppTemplates = async () => {
  const originCommunityTemplates = await getFileTemplates();
  const communityTemplates = originCommunityTemplates.map((template) => {
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
      return {
        ...template,
        ...config
      };
    }

    return template;
  });
  const res = [
    ...communityTemplateConfig,
    ...dbTemplates.filter((t) => isCommercialTemaplte(t.templateId))
  ].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return res;
};

export const getAppTemplatesAndLoadThem = async (refresh = false) => {
  // 首次强制刷新
  if (!global.templatesRefreshTime) {
    global.templatesRefreshTime = Date.now() - 10000;
  }
  if (!global.appTemplates) {
    global.appTemplates = [];
  }

  if (
    isProduction &&
    // 有模板缓存
    global.appTemplates.length > 0 &&
    // 缓存时间未过期
    global.templatesRefreshTime > Date.now() &&
    !refresh
  ) {
    return global.appTemplates;
  }

  try {
    const appTemplates = await getAppTemplates();
    global.appTemplates = appTemplates;
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
  var appTemplates: AppTemplateSchemaType[];
  var templatesRefreshTime: number;
}
