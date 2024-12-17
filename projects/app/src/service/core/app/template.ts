import { isProduction } from '@fastgpt/global/common/system/constants';
import { getCommunityTemplates } from '@fastgpt/templates/register';

// Get template from memory or file system
const loadTemplateMarketItems = async () => {
  if (isProduction && global.appMarketTemplates) return global.appMarketTemplates;

  return getCommunityTemplates();
};

export const getTemplateMarketItemDetail = async (id: string) => {
  const templateMarketItems = await loadTemplateMarketItems();
  return templateMarketItems.find((item) => item.id === id);
};

export const getTemplateMarketItemList = async () => {
  const templateMarketItems = await loadTemplateMarketItems();
  return templateMarketItems.map((item) => ({
    id: item.id,
    name: item.name,
    avatar: item.avatar,
    intro: item.intro,
    author: item.author,
    tags: item.tags,
    type: item.type
  }));
};
