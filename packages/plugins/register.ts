import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import { SystemPluginResponseType } from './type';
import { FastGPTProUrl, isProduction } from '../service/common/system/constants';
import { GET, POST } from '@fastgpt/service/common/api/plusRequest';
import { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';
import { cloneDeep } from 'lodash';
import { WorkerNameEnum, runWorker } from '@fastgpt/service/worker/utils';

// Run in main thread
const staticPluginList = [
  'getTime',
  'fetchUrl',
  'Doc2X',
  'Doc2X/URLPDF2text',
  'Doc2X/URLImg2text',
  'feishu'
];
// Run in worker thread (Have npm packages)
const packagePluginList = [
  'mathExprVal',
  'duckduckgo',
  'duckduckgo/search',
  'duckduckgo/searchImg',
  'duckduckgo/searchNews',
  'duckduckgo/searchVideo'
];

const list = [...staticPluginList, ...packagePluginList];

/* Get plugins */
export const getCommunityPlugins = () => {
  return list.map<SystemPluginTemplateItemType>((name) => {
    const config = require(`./src/${name}/template.json`);

    const isFolder = list.find((item) => item.startsWith(`${name}/`));

    const parentIdList = name.split('/').slice(0, -1);
    const parentId =
      parentIdList.length > 0 ? `${PluginSourceEnum.community}-${parentIdList.join('/')}` : null;

    return {
      ...config,
      id: `${PluginSourceEnum.community}-${name}`,
      isFolder,
      parentId,
      isActive: true
    };
  });
};
const getCommercialPlugins = () => {
  return GET<SystemPluginTemplateItemType[]>('/core/app/plugin/getSystemPlugins');
};
export const getSystemPluginTemplates = async (refresh = false) => {
  if (isProduction && global.systemPlugins && !refresh) return cloneDeep(global.systemPlugins);

  try {
    if (!global.systemPlugins) {
      global.systemPlugins = [];
    }

    global.systemPlugins = FastGPTProUrl ? await getCommercialPlugins() : getCommunityPlugins();

    return cloneDeep(global.systemPlugins);
  } catch (error) {
    //@ts-ignore
    global.systemPlugins = undefined;
    return Promise.reject(error);
  }
};

export const getCommunityCb = async () => {
  const loadCommunityModule = async (name: string) => {
    const module = await import(`./src/${name}/index`);
    return module.default;
  };

  const result = (
    await Promise.all(
      list.map(async (name) => {
        try {
          return {
            name,
            cb: staticPluginList.includes(name)
              ? await loadCommunityModule(name)
              : (e: any) => {
                  return runWorker(WorkerNameEnum.systemPluginRun, {
                    pluginName: name,
                    data: e
                  });
                }
          };
        } catch (error) {}
      })
    )
  ).filter(Boolean) as {
    name: string;
    cb: any;
  }[];

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
