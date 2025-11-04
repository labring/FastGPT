import { isProduction } from '@fastgpt/global/common/system/constants';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { MongoAppTemplate } from './templateSchema';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';

const getFileTemplates = async (): Promise<AppTemplateSchemaType[]> => {
  const res = await pluginClient.workflow.getTemplateList();
  if (res.status === 200) return res.body as AppTemplateSchemaType[];
  else return Promise.reject(res.body);
};

const getAppTemplates = async () => {
  const communityTemplates = await getFileTemplates();

  const dbTemplates = await MongoAppTemplate.find();

  // Merge db data to community templates
  const communityTemplateConfig = communityTemplates.map((template) => {
    const config = dbTemplates.find((t) => t.templateId === template.templateId);

    if (config) {
      return {
        ...template,
        isActive: config.isActive ?? template.isActive,
        tags: config.tags ?? template.tags,
        userGuide: config.userGuide ?? template.userGuide,
        isQuickTemplate: config.isQuickTemplate ?? template.isQuickTemplate,
        order: config.order ?? template.order
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
  if (isProduction && global.appTemplates && global.appTemplates.length > 0 && !refresh)
    return global.appTemplates;

  if (!global.appTemplates) {
    global.appTemplates = [];
  }

  try {
    const appTemplates = await getAppTemplates();
    global.appTemplates = appTemplates;
    return appTemplates;
  } catch (error) {
    // @ts-ignore
    global.appTemplates = undefined;
    return [];
  }
};

export const isCommercialTemaplte = (templateId: string) => {
  return templateId.startsWith(AppToolSourceEnum.commercial);
};

declare global {
  var appTemplates: AppTemplateSchemaType[];
}
