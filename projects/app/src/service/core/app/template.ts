import { getCommunityTemplates } from '@fastgpt/templates/register';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { cloneDeep } from 'lodash';
import { GET } from '@fastgpt/service/common/api/plusRequest';
import { SystemTemplateSchemaType } from '@fastgpt/service/core/app/templates/type';
import { isProduction } from '@fastgpt/global/common/system/constants';

const getCommercialTemplates = () => {
  return GET<SystemTemplateSchemaType[]>('/core/app/template/getTemplateList');
};

// Get template from memory or file system
const loadTemplateMarketItems = async () => {
  if (isProduction && global.appMarketTemplates && global.appMarketTemplates.length > 0)
    return cloneDeep(global.appMarketTemplates);

  try {
    if (!global.appMarketTemplates) {
      global.appMarketTemplates = [];
    }

    global.appMarketTemplates = FastGPTProUrl
      ? await getCommercialTemplates()
      : getCommunityTemplates();

    addLog.info(`Load app market templates successfully: ${global.appMarketTemplates.length}`);
    return cloneDeep(global.appMarketTemplates);
  } catch (error) {
    //@ts-ignore
    global.appMarketTemplates = undefined;
    return Promise.reject(error);
  }
};

export const getTemplateMarketItemDetail = async (id: string) => {
  const templateMarketItems = await loadTemplateMarketItems();
  return templateMarketItems.find((item) => item.templateId === id);
};

export const getTemplateMarketItemList = async () => {
  const templateMarketItems = await loadTemplateMarketItems();
  return templateMarketItems
    .filter((item) => item.isActive)
    .map((item) => ({
      templateId: item.templateId,
      name: item.name,
      avatar: item.avatar,
      intro: item.intro,
      author: item.author,
      tags: item.tags,
      type: item.type,
      userGuide: item.userGuide,
      isQuickTemplate: item.isQuickTemplate
    }));
};
