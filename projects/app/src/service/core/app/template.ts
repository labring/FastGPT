import { isProduction } from '@fastgpt/service/common/system/constants';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

// Get template from memory or file system
export const getTemplateMarketItems = async () => {
  if (isProduction && global.appMarketTemplates) return global.appMarketTemplates;

  const templatesDir = path.join(process.cwd(), 'public', 'appMarketTemplates');
  const templateNames = readdirSync(templatesDir);

  global.appMarketTemplates = templateNames.map((name) => {
    try {
      const filePath = path.join(templatesDir, name, 'template.json');
      const fileContent = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);
      return data;
    } catch (error) {
      console.error(`Error fetching template ${name}:`, error);
      return null;
    }
  });

  return global.appMarketTemplates;
};

export const getTemplateMarketItemDetail = async (id: string) => {
  const templateMarketItems = await getTemplateMarketItems();
  return templateMarketItems.find((item) => item.id === id);
};

export const getTemplateMarketItemList = async () => {
  const templateMarketItems = await getTemplateMarketItems();
  return templateMarketItems.map((item) => ({
    id: item.id,
    name: item.name,
    avatar: item.avatar,
    intro: item.intro,
    author: item.author,
    authorAvatar: item.authorAvatar,
    tags: item.tags,
    type: item.type
  }));
};
