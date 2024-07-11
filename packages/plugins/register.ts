import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SystemPluginResponseType } from './type';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { FastGPTProUrl, isProduction } from '../service/common/system/constants';
import { GET, POST } from '@fastgpt/service/common/api/plusRequest';
import { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';

let list = ['getTime', 'fetchUrl', 'mathExprVal'];

/* Get plugins */
export const getCommunityPlugins = () => {
  return list.map<SystemPluginTemplateItemType>((name) => ({
    ...require(`./src/${name}/template.json`),
    id: `${PluginSourceEnum.community}-${name}`,
    isActive: true
  }));
};
const getCommercialPlugins = () => {
  return GET<SystemPluginTemplateItemType[]>('/core/app/plugin/getSystemPlugins');
};
export const getSystemPluginTemplates = async () => {
  if (global.systemPlugins) return global.systemPlugins;

  try {
    global.systemPlugins = [];
    global.systemPlugins = FastGPTProUrl ? await getCommercialPlugins() : getCommunityPlugins();

    return global.systemPlugins;
  } catch (error) {
    //@ts-ignore
    global.systemPlugins = undefined;
    return Promise.reject(error);
  }
};

export const getCommunityCb = async () => {
  // Do not modify the following code
  const loadModule = async (name: string) => {
    const module = await import(`./src/${name}/index`);
    return module.default;
  };

  const result = await Promise.all(
    list.map(async (name) => ({
      name,
      cb: await loadModule(name)
    }))
  );

  return result.reduce<Record<string, (e: any) => SystemPluginResponseType>>(
    (acc, { name, cb }) => {
      acc[name] = cb;
      return acc;
    },
    {}
  );
};
const getCommercialCb = async () => {
  const plugins = await getSystemPluginTemplates();
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
    global.systemPluginCb = {};
    global.systemPluginCb = FastGPTProUrl ? await getCommercialCb() : await getCommunityCb();
    return global.systemPluginCb;
  } catch (error) {
    //@ts-ignore
    global.systemPluginCb = undefined;
    return Promise.reject(error);
  }
};
