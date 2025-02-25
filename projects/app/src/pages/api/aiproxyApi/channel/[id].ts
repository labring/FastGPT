import { ApiProxyBackendResp } from '@/global/aiproxy/api';
import { CreateChannelRequest } from '@/global/aiproxy/types';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextApiResponse } from 'next';

async function updateChannel(channelData: CreateChannelRequest, id: string): Promise<void> {
  try {
    if (!process.env.AIPROXY_API_ENDPOINT) {
      return Promise.reject('AIPROXY_API_ENDPOINT is not configured');
    }
    if (!process.env.AIPROXY_API_TOKEN) {
      return Promise.reject('AIPROXY_API_TOKEN is not configured');
    }

    const url = new URL(`/api/channel/${id}`, process.env.AIPROXY_API_ENDPOINT);

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.AIPROXY_API_TOKEN
      },
      body: JSON.stringify(channelData),
      cache: 'no-store'
    });

    if (!response.ok) {
      return Promise.reject(`HTTP error: ${response.status} - ${await response.text()}`);
    }

    const result: ApiProxyBackendResp = await response.json();
    if (!result.success) {
      return Promise.reject(result.message || 'Admin channels API: AI proxy backend error');
    }
  } catch (error) {
    return Promise.reject(error);
  }
}

async function deleteChannel(id: string): Promise<void> {
  try {
    if (!process.env.AIPROXY_API_ENDPOINT) {
      return Promise.reject('AIPROXY_API_ENDPOINT is not configured');
    }
    if (!process.env.AIPROXY_API_TOKEN) {
      return Promise.reject('AIPROXY_API_TOKEN is not configured');
    }

    const url = new URL(`/api/channel/${id}`, process.env.AIPROXY_API_ENDPOINT);

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.AIPROXY_API_TOKEN
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      return Promise.reject(`HTTP error: ${response.status} - ${await response.text()}`);
    }

    const result: ApiProxyBackendResp = await response.json();
    if (!result.success) {
      return Promise.reject(result.message || 'Admin channels API: AI proxy backend error');
    }
  } catch (error) {
    return Promise.reject(error);
  }
}

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { id } = req.query;

  if (typeof id !== 'string') {
    return Promise.reject('Invalid channel ID');
  }

  switch (req.method) {
    case 'PUT':
      return await updateChannel(req.body, id);

    case 'DELETE':
      return await deleteChannel(id);

    default:
      return Promise.reject('Method not allowed');
  }
}

export default NextAPI(handler);
