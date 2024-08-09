import { isProduction } from '@fastgpt/service/common/system/constants';
import { promises as fs } from 'fs';
import path from 'path';

let appTemplateMarketTemplatesIdList = [
  'TranslateRobot',
  'dalle',
  'chatGuide',
  'toolChat',
  'google'
];

export const getTemplateMarketItems = async () => {
  if (isProduction && global.appTemplateMarketTemplates) return global.appTemplateMarketTemplates;

  global.appTemplateMarketTemplates = await Promise.all(
    appTemplateMarketTemplatesIdList.map(async (name) => {
      try {
        const filePath = path.join(
          process.cwd(),
          'public',
          'appTemplateMarketTemplates',
          name,
          'template.json'
        );
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(fileContent);
        return data;
      } catch (error) {
        console.error(`Error fetching template ${name}:`);
        return null;
      }
    })
  );

  return global.appTemplateMarketTemplates;
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
