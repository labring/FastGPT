import { isProduction } from '@fastgpt/global/common/system/constants';
import { GET } from '@fastgpt/service/common/api/plusRequest';
import { type SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';
import { addLog } from '@fastgpt/service/common/system/log';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';
import { getSystemToolList } from '@fastgpt/service/core/app/tool/api';
import { cloneDeep } from 'lodash';

/* Get plugins */
const getCommercialPlugins = () => {
  return GET<SystemPluginTemplateItemType[]>('/core/app/plugin/getSystemPlugins');
};

export const getSystemPlugins = async (refresh = true) => {
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

/* Get plugin callback */
// const getCommercialCb = async () => {
//   const plugins = await getSystemPlugins();
//   const result = plugins.map((plugin) => {
//     const name = plugin.id.split('-')[1];

//     return {
//       name,
//       cb: (e: any) =>
//         POST<Record<string, any>>('/core/app/plugin/run', {
//           pluginName: name,
//           data: e
//         })
//     };
//   });

//   return result.reduce<Record<string, (e: any) => SystemPluginResponseType>>(
//     (acc, { name, cb }) => {
//       acc[name] = cb;
//       return acc;
//     },
//     {}
//   );
// };

// export const getSystemPluginCb = async (refresh = false) => {
//   if (
//     isProduction &&
//     global.systemPluginCb &&
//     Object.keys(global.systemPluginCb).length > 0 &&
//     !refresh
//   )
//     return global.systemPluginCb;

//   try {
//     global.systemPluginCb = {};
//     await getSystemPlugins(refresh);
//     global.systemPluginCb = FastGPTProUrl ? await getCommercialCb() : await getCommunityCb();
//     return global.systemPluginCb;
//   } catch (error) {
//     return Promise.reject(error);
//   }
// };
