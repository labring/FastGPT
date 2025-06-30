import createClient, { type SystemVarType } from '@fastgpt-sdk/plugin';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';

const client = createClient({
  baseUrl: process.env.PLUGIN_BASE_URL || '',
  token: process.env.PLUGIN_TOKEN || ''
});

export async function getSystemToolList() {
  const res = await client.tool.list();

  if (res.status === 200) {
    return res.body.map((item) => {
      return {
        ...item,
        id: `${PluginSourceEnum.systemTool}-${item.id}`,
        parentId: item.parentId ? `${PluginSourceEnum.systemTool}-${item.parentId}` : undefined
      };
    });
  }

  return Promise.reject(res.body);
}

export async function runTool({
  toolId,
  inputs,
  systemVar
}: {
  toolId: string;
  inputs: Record<string, any>;
  systemVar: SystemVarType;
}) {
  const res = await client.tool.run({
    body: {
      toolId,
      inputs,
      systemVar
    }
  });

  if (res.status === 200 && res.body.output) {
    return res.body.output;
  } else {
    return Promise.reject(res.body);
  }
}
