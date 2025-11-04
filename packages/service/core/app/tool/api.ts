import { RunToolWithStream } from '@fastgpt/global/sdk/fastgpt-plugin';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { pluginClient, PLUGIN_BASE_URL, PLUGIN_TOKEN } from '../../../thirdProvider/fastgptPlugin';
import { addLog } from '../../../common/system/log';
import { retryFn } from '@fastgpt/global/common/system/utils';

export async function APIGetSystemToolList() {
  const res = await pluginClient.tool.list();

  if (res.status === 200) {
    return res.body.map((item) => {
      return {
        ...item,
        id: `${AppToolSourceEnum.systemTool}-${item.toolId}`,
        parentId: item.parentId ? `${AppToolSourceEnum.systemTool}-${item.parentId}` : undefined,
        avatar: item.icon
      };
    });
  }

  return Promise.reject(res.body);
}

const runToolInstance = new RunToolWithStream({
  baseUrl: PLUGIN_BASE_URL,
  token: PLUGIN_TOKEN
});
export const APIRunSystemTool = runToolInstance.run.bind(runToolInstance);

export const getSystemToolTags = () => {
  return retryFn(async () => {
    const res = await pluginClient.tool.getTags();

    if (res.status === 200) {
      const toolTypes = res.body || [];

      return toolTypes;
    }

    addLog.error('Get system tool type error', res.body);
    return [];
  });
};
