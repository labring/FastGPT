import { RunToolWithStream } from '@fastgpt/global/sdk/fastgpt-plugin';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { pluginClient, BASE_URL, TOKEN } from '../../../thirdProvider/fastgptPlugin';

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
