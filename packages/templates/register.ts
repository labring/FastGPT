import fs from 'fs';
import path from 'path';
import { isProduction } from '@fastgpt/global/common/system/constants';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';

const getTemplateNameList = () => {
  const currentFileUrl = new URL(import.meta.url);
  const filePath = decodeURIComponent(
    process.platform === 'win32'
      ? currentFileUrl.pathname.substring(1) // Remove leading slash on Windows
      : currentFileUrl.pathname
  );
  const templatesPath = path.join(path.dirname(filePath), 'src');

  return fs.promises.readdir(templatesPath);
};

const getFileTemplates = async (): Promise<AppTemplateSchemaType[]> => {
  const templateNames = await getTemplateNameList();

  return Promise.all(
    templateNames.map<Promise<AppTemplateSchemaType>>(async (name) => {
      const fileContent = (await import(`./src/${name}/template.json`))?.default;

      return {
        ...fileContent,
        templateId: `${PluginSourceEnum.community}-${name}`,
        isActive: true
      };
    })
  );
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
    ...dbTemplates.filter((t) => !isCommunityTemplate(t.templateId))
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

export const isCommunityTemplate = (templateId: string) => {
  return templateId.startsWith(PluginSourceEnum.community);
};
