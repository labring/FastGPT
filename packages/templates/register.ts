import fs, { readFileSync } from 'fs';
import path from 'path';
import { isProduction } from '@fastgpt/global/common/system/constants';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';

export const getTemplateNameList = () => {
  const currentFileUrl = new URL(import.meta.url);
  const templatesPath = path.join(path.dirname(currentFileUrl.pathname), 'src');

  return {
    templateNames: fs.readdirSync(templatesPath),
    templatesPath
  };
};

export const getFileTemplates = () => {
  const { templateNames, templatesPath } = getTemplateNameList();

  const appMarketTemplates = templateNames.map((name) => {
    const configPath = path.join(templatesPath, name, 'template.json');
    const fileContent = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(fileContent);
    return {
      ...config,
      templateId: `${PluginSourceEnum.community}-${name}`,
      isActive: true
    };
  });

  return appMarketTemplates.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
};

const getAppTemplates = async () => {
  const communityTemplates = getFileTemplates();

  const dbTemplates = await MongoAppTemplate.find();

  const communityTemplateConfig = communityTemplates.map((template) => {
    const config = dbTemplates.find((t) => t.templateId === template.templateId);

    if (config) {
      return {
        ...template,
        ...(config.isActive !== undefined && { isActive: config.isActive }),
        ...(config.tags !== undefined && { tags: config.tags }),
        ...(config.userGuide !== undefined && { userGuide: config.userGuide }),
        ...(config.isQuickTemplate !== undefined && { isQuickTemplate: config.isQuickTemplate }),
        ...(config.order !== undefined && { order: config.order })
      };
    }

    return template;
  });

  const res = [
    ...communityTemplateConfig,
    ...dbTemplates.filter((t) => !t.templateId.includes('community'))
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
    global.appTemplates = [];
    return [];
  }
};
