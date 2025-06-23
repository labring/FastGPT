import createClient, { type SystemVarType } from '@fastgpt-sdk/plugin';

const client = createClient({
  baseUrl: process.env.PLUGIN_BASE_URL || '',
  token: process.env.PLUGIN_TOKEN || ''
});

export async function getSystemToolList() {
  const res = await client.tool.list();
  if (res.status === 200) return res.body;
  return Promise.reject(res.body);
}

export async function getSystemTool({ toolId }: { toolId: string }) {
  const res = await client.tool.getTool({
    query: {
      toolId
    }
  });
  if (res.status === 200) {
    return res.body;
  } else {
    return Promise.reject(res.body);
  }
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
