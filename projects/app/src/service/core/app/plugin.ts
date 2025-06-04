import { isProduction } from '@fastgpt/global/common/system/constants';
import { GET } from '@fastgpt/service/common/api/plusRequest';
import { addLog } from '@fastgpt/service/common/system/log';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';
import { getSystemToolList } from '@fastgpt/service/core/app/tool/api';
import { cloneDeep } from 'lodash';
import type { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';

/**
Get plugins from pro service
*/
const getCommercialPlugins = () => {
  return GET<SystemPluginTemplateItemType[]>('/core/app/plugin/getSystemPlugins');
};

/**
Get plugins from systemTool service
*/
export const getSystemPlugins = async (refresh = false) => {
  if (isProduction && global.systemPlugins && global.systemPlugins.length > 0 && !refresh)
    return cloneDeep(global.systemPlugins);

  try {
    if (!global.systemPlugins) {
      global.systemPlugins = [];
    }

    global.systemPlugins = FastGPTProUrl ? await getCommercialPlugins() : await getSystemToolList();

    addLog.info(`Load system plugin successfully: ${global.systemPlugins.length}`);

    return cloneDeep(global.systemPlugins);
  } catch (error) {
    global.systemPlugins = undefined;
    return Promise.reject(error);
  }
};
