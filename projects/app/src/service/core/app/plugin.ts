import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';
import { getSystemToolList } from '@fastgpt/service/core/app/tool/api';
import { getCommercialPluginsAPI } from '@fastgpt/service/core/app/plugin/controller';

/**
Get plugins from pro service
*/
// const getCommercialPlugins = () => {
//   return GET<SystemPluginTemplateItemType[]>('/core/app/plugin/getSystemPlugins');
// };

/**
Get plugins from systemTool service
*/
export const getSystemTools = async () => {
  try {
    return FastGPTProUrl ? await getCommercialPluginsAPI() : await getSystemToolList();
  } catch (error) {
    return Promise.reject(error);
  }
};

// export const getSystemToolById = async (id: string) => {
//   try {
//     return FastGPTProUrl ? await getCommercialPlugins() : await getSystemToolList();
//   } catch (error) {
//     return Promise.reject(error);
//   }
// };
