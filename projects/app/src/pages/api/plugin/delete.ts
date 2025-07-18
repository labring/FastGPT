import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { cleanSystemPluginCache } from '@fastgpt/service/core/app/plugin/controller';

const PLUGIN_BASE_URL = process.env.PLUGIN_BASE_URL;

type RequestBody = {
  toolId: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { toolId }: RequestBody = req.body;

    const actualToolId = toolId.includes('-') ? toolId.split('-').slice(1).join('-') : toolId;

    if (!PLUGIN_BASE_URL) {
      return Promise.reject('Plugin service URL is not configured');
    }

    const pluginUrl = `${PLUGIN_BASE_URL}/tool/delete`;

    const response = await fetch(pluginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ toolId: actualToolId })
    });

    const responseData = await response.text();

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.status(response.status);

    if (response.ok) {
      try {
        await cleanSystemPluginCache();
      } catch (error) {
        console.error('Clear plugin cache error:', error);
      }
    }

    if (responseData) {
      try {
        const jsonData = JSON.parse(responseData);
        return jsonRes(res, jsonData);
      } catch {
        return res.send(responseData);
      }
    } else {
      Promise.reject('Delete failed');
    }
  } catch (error) {
    Promise.reject(error);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: true
  }
};
