import { GET } from '@fastgpt/service/common/api/plusRequest';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';
import type { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';
import { getSystemToolList } from '@fastgpt/service/core/app/tool/api';

/**
Get plugins from pro service
*/
const getCommercialPlugins = () => {
  return GET<SystemPluginTemplateItemType[]>('/core/app/plugin/getSystemPlugins');
};

/**
Get plugins from systemTool service
*/
export const getSystemTools = async () => {
  try {
    return FastGPTProUrl ? await getCommercialPlugins() : await getSystemToolList();
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
