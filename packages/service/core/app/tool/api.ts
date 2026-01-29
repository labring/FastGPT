import { RunToolWithStream } from '@fastgpt/global/sdk/fastgpt-plugin';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { pluginClient, PLUGIN_BASE_URL, PLUGIN_TOKEN } from '../../../thirdProvider/fastgptPlugin';
import { retryFn } from '@fastgpt/global/common/system/utils';

export async function APIGetSystemToolList() {
  const tools = await pluginClient.listTools();

  return tools.map((item) => {
    return {
      ...item,
      id: `${AppToolSourceEnum.systemTool}-${item.toolId}`,
      parentId: item.parentId ? `${AppToolSourceEnum.systemTool}-${item.parentId}` : undefined,
      avatar: item.icon
    };
  });
}

const runToolInstance = new RunToolWithStream(PLUGIN_BASE_URL, PLUGIN_TOKEN);

export const APIRunSystemTool = runToolInstance.run.bind(runToolInstance);

export const getSystemToolTags = () => retryFn(async () => await pluginClient.getToolTags());
