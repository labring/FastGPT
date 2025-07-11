import createClient, { type SystemVarType } from '@fastgpt-sdk/plugin';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { runToolStream, type StreamDataAnswerTypeEnum } from '@fastgpt-sdk/plugin';

const PluginClientConfig = {
  baseUrl: process.env.PLUGIN_BASE_URL || '',
  token: process.env.PLUGIN_TOKEN || ''
};
const client = createClient(PluginClientConfig);

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

export async function runPluginToolStream(
  toolId: string,
  inputs: Record<string, any>,
  systemVar: SystemVarType,
  onStreamData: (type: StreamDataAnswerTypeEnum, data: string) => void
) {
  return await runToolStream({
    baseUrl: PluginClientConfig.baseUrl,
    authtoken: PluginClientConfig.token,
    toolId,
    inputs,
    systemVar,
    onStreamData
  });
}
