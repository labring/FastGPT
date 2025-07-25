import createClient, { RunToolWithStream } from '@fastgpt-sdk/plugin';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';

const BASE_URL = process.env.PLUGIN_BASE_URL || '';
const TOKEN = process.env.PLUGIN_TOKEN || '';

const client = createClient({
  baseUrl: BASE_URL,
  token: TOKEN
});

export async function getSystemToolList() {
  const res = await client.tool.list();

  if (res.status === 200) {
    return res.body.map((item) => {
      return {
        ...item,
        id: `${PluginSourceEnum.systemTool}-${item.id}`,
        parentId: item.parentId ? `${PluginSourceEnum.systemTool}-${item.parentId}` : undefined,
        avatar:
          item.avatar && item.avatar.startsWith('/imgs/tools/')
            ? `/api/system/pluginImgs/${item.avatar.replace('/imgs/tools/', '')}`
            : item.avatar
      };
    });
  }

  return Promise.reject(res.body);
}

export async function deleteSystemTool(toolId: string) {
  const res = await client.tool.delete({ body: { toolId } });

  if (res.status === 200) {
    return res.body;
  }

  return Promise.reject(res.body);
}

export async function uploadSystemTool(url: string) {
  const res = await client.tool.upload({ body: { url } });

  if (res.status === 200) {
    return res.body;
  }

  return Promise.reject(res.body);
}

const runToolInstance = new RunToolWithStream({
  baseUrl: BASE_URL,
  token: TOKEN
});
export const runSystemTool = runToolInstance.run.bind(runToolInstance);
