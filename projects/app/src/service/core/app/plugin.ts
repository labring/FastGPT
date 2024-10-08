import { FastGPTProUrl, isProduction } from '@fastgpt/service/common/system/constants';
import { cloneDeep } from 'lodash';
import { getCommunityCb, getCommunityPlugins } from '@fastgpt/plugins/register';
import { GET, POST } from '@fastgpt/service/common/api/plusRequest';
import { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';
import { addLog } from '@fastgpt/service/common/system/log';
import { SystemPluginResponseType } from '@fastgpt/plugins/type';

/* Get plugins */
const getCommercialPlugins = () => {
  return GET<SystemPluginTemplateItemType[]>('/core/app/plugin/getSystemPlugins');
};
export const getSystemPlugins = async (refresh = false) => {
  if (isProduction && global.systemPlugins && !refresh) return cloneDeep(global.systemPlugins);

  try {
    if (!global.systemPlugins) {
      global.systemPlugins = [];
    }

    global.systemPlugins = FastGPTProUrl ? await getCommercialPlugins() : getCommunityPlugins();

    addLog.info(`Load system plugin successfully: ${global.systemPlugins.length}`);

    return cloneDeep(global.systemPlugins);
  } catch (error) {
    //@ts-ignore
    global.systemPlugins = undefined;
    return Promise.reject(error);
  }
};

/* Get plugin callback */
const getCommercialCb = async () => {
  const plugins = await getSystemPlugins();
  const result = plugins.map((plugin) => {
    const name = plugin.id.split('-')[1];

    return {
      name,
      cb: (e: any) =>
        POST<Record<string, any>>('/core/app/plugin/run', {
          pluginName: name,
          data: e
        })
    };
  });

  return result.reduce<Record<string, (e: any) => SystemPluginResponseType>>(
    (acc, { name, cb }) => {
      acc[name] = cb;
      return acc;
    },
    {}
  );
};
export const getSystemPluginCb = async () => {
  if (isProduction && global.systemPluginCb) return global.systemPluginCb;

  try {
    await getSystemPlugins();
    global.systemPluginCb = {};
    global.systemPluginCb = FastGPTProUrl ? await getCommercialCb() : await getCommunityCb();
    return global.systemPluginCb;
  } catch (error) {
    //@ts-ignore
    global.systemPluginCb = undefined;
    return Promise.reject(error);
  }
};
