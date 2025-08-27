import { RunToolWithStream } from '@fastgpt/global/sdk/fastgpt-plugin';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { pluginClient, BASE_URL, TOKEN } from '../../../thirdProvider/fastgptPlugin';
import { isProduction } from '@fastgpt/global/common/system/constants';

export async function APIGetSystemToolList() {
  const res = await pluginClient.tool.list();

  if (res.status === 200) {
    return res.body.map((item) => {
      return {
        ...item,
        id: `${PluginSourceEnum.systemTool}-${item.id}`,
        parentId: item.parentId ? `${PluginSourceEnum.systemTool}-${item.parentId}` : undefined,
        avatar:
          item.avatar && item.avatar.startsWith('/imgs/tools/')
            ? `/api/system/plugin/tools/${item.avatar.replace('/imgs/tools/', '')}`
            : item.avatar
      };
    });
  }

  return Promise.reject(res.body);
}

// Tool Types Cache
export type ToolTypeItem = {
  type: string;
  name: {
    en: string;
    'zh-CN': string;
    'zh-Hant': string;
  };
};

function getCachedToolTypes() {
  if (!global.toolTypes_cache) {
    global.toolTypes_cache = {
      expires: 0,
      data: [] as ToolTypeItem[]
    };
  }
  return global.toolTypes_cache;
}

export const cleanToolTypesCache = () => {
  global.toolTypes_cache = undefined;
};

export const APIGetToolTypes = async (): Promise<ToolTypeItem[]> => {
  if (getCachedToolTypes().expires > Date.now() && isProduction) {
    return getCachedToolTypes().data;
  } else {
    const res = await pluginClient.tool.getType();

    if (res.status === 200) {
      const toolTypes = res.body || [];

      // Cache for 60 minutes
      global.toolTypes_cache = {
        expires: Date.now() + 60 * 60 * 1000,
        data: toolTypes
      };

      return toolTypes;
    }

    return Promise.reject(res.body);
  }
};

const runToolInstance = new RunToolWithStream({
  baseUrl: BASE_URL,
  token: TOKEN
});
export const APIRunSystemTool = runToolInstance.run.bind(runToolInstance);

declare global {
  var toolTypes_cache:
    | {
        expires: number;
        data: ToolTypeItem[];
      }
    | undefined;
}
