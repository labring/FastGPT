import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { PLUGIN_BASE_URL, PLUGIN_TOKEN } from '@fastgpt/service/thirdProvider/fastgptPlugin';

export type PluginQuery = {
  pluginRequestPath: string[];
};
export type PluginBody = {};
export type PluginResponse = {};

async function handler(req: ApiRequestProps<PluginBody, PluginQuery>, res: ApiResponseType<any>) {
  const { pluginRequestPath } = req.query;
  const urlObj = new URL(pluginRequestPath.join('/'), PLUGIN_BASE_URL);
  Object.entries(req.query).forEach(([key, value]) => {
    if (key !== 'pluginRequestPath') {
      urlObj.searchParams.set(key, String(value));
    }
  });
  const body =
    req.method?.toUpperCase() === 'POST' || req.method === 'PUT'
      ? JSON.stringify(req.body)
      : undefined;
  const pluginRes = await fetch(urlObj.toString(), {
    method: req.method,
    body,
    headers: {
      authtoken: PLUGIN_TOKEN,
      'Content-Type': 'application/json'
    }
  });
  res.status(pluginRes.status);
  res.json(await pluginRes.json());
}

export default handler;
