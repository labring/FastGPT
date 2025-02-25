import { ChannelTypeMapName } from '@/global/aiproxy/types';
import { ApiProxyBackendResp } from '@/global/aiproxy/api';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { NextApiResponse } from 'next';

type ApiProxyBackendChannelTypeMapNameResponse = ApiProxyBackendResp<ChannelTypeMapName>;

async function fetchChannelTypeNames(): Promise<ChannelTypeMapName> {
  try {
    if (!process.env.AIPROXY_API_ENDPOINT) {
      return Promise.reject('AIPROXY_API_ENDPOINT is not configured');
    }
    if (!process.env.AIPROXY_API_TOKEN) {
      return Promise.reject('AIPROXY_API_TOKEN is not configured');
    }

    const url = new URL('/api/channels/type_metas', process.env.AIPROXY_API_ENDPOINT);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.AIPROXY_API_TOKEN
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      return Promise.reject(`HTTP error: ${response.status} - ${await response.text()}`);
    }

    const result: ApiProxyBackendChannelTypeMapNameResponse = await response.json();
    if (!result.success) {
      return Promise.reject(result.message || 'Admin channels API: AI proxy backend error');
    }

    if (!result.data) {
      return Promise.reject('No data received');
    }
    return result.data;
  } catch (error) {
    return Promise.reject(error);
  }
}

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return Promise.reject('Method not allowed');
  }

  return await fetchChannelTypeNames();
}

export default NextAPI(handler);
