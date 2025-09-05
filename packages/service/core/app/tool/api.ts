import type { I18nStringStrictType, ToolTypeEnum } from '@fastgpt/global/sdk/fastgpt-plugin';
import { RunToolWithStream } from '@fastgpt/global/sdk/fastgpt-plugin';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { pluginClient, BASE_URL, TOKEN } from '../../../thirdProvider/fastgptPlugin';
import { addLog } from '../../../common/system/log';
import { retryFn } from '@fastgpt/global/common/system/utils';

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

const runToolInstance = new RunToolWithStream({
  baseUrl: BASE_URL,
  token: TOKEN
});
export const APIRunSystemTool = runToolInstance.run.bind(runToolInstance);

// Tool Types Cache
type SystemToolTypeItem = {
  type: ToolTypeEnum;
  name: I18nStringStrictType;
};

export const getSystemToolTypes = (): Promise<SystemToolTypeItem[]> => {
  return retryFn(async () => {
    const res = await pluginClient.tool.getType();

    if (res.status === 200) {
      const toolTypes = res.body || [];

      return toolTypes;
    }

    addLog.error('Get system tool type error', res.body);
    return [];
  });
};
