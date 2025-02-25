import { ApiProxyBackendResp } from '@/global/aiproxy/api';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { NextApiResponse } from 'next';

async function updateChannelStatus(id: string, status: number): Promise<void> {
  try {
    if (!process.env.AIPROXY_API_ENDPOINT) {
      return Promise.reject('AIPROXY_API_ENDPOINT is not configured');
    }
    if (!process.env.AIPROXY_API_TOKEN) {
      return Promise.reject('AIPROXY_API_TOKEN is not configured');
    }

    const url = new URL(`/api/channel/${id}/status`, process.env.AIPROXY_API_ENDPOINT);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.AIPROXY_API_TOKEN
      },
      body: JSON.stringify({ status }),
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
  if (req.method !== 'POST') {
    return Promise.reject('Method not allowed');
  }

  const { id } = req.query;
  const { status }: { status: number } = req.body;

  return await updateChannelStatus(id, status);
}

export default NextAPI(handler);
