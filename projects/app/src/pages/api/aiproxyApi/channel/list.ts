import { ApiProxyBackendResp } from '@/global/aiproxy/api';
import { ChannelInfo } from '@/global/aiproxy/types';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextApiResponse } from 'next';

export interface ChannelQueryParams {
  page: number;
  perPage: number;
}

export type ChannelList = {
  channels: ChannelInfo[];
  total: number;
};

type ApiProxyBackendChannelsSearchResponse = ApiProxyBackendResp<ChannelList>;

function validateParams(queryParams: ChannelQueryParams): string | null {
  if (queryParams.page < 1) {
    return 'Page number must be greater than 0';
  }
  if (queryParams.perPage < 1 || queryParams.perPage > 100) {
    return 'Per page must be between 1 and 100';
  }
  return null;
}

async function fetchChannels(
  queryParams: ChannelQueryParams
): Promise<{ channels: ChannelInfo[]; total: number }> {
  try {
    if (!process.env.AIPROXY_API_ENDPOINT) {
      return Promise.reject('AIPROXY_API_ENDPOINT is not configured');
    }
    if (!process.env.AIPROXY_API_TOKEN) {
      return Promise.reject('AIPROXY_API_TOKEN is not configured');
    }

    const url = new URL('/api/channels/search', process.env.AIPROXY_API_ENDPOINT);
    url.searchParams.set('p', queryParams.page.toString());
    url.searchParams.set('per_page', queryParams.perPage.toString());

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

    const result: ApiProxyBackendChannelsSearchResponse = await response.json();
    if (!result.success) {
      return Promise.reject(result.message || 'Admin channels API: AI proxy backend error');
    }

    return {
      channels: result.data?.channels ?? [],
      total: result.data?.total ?? 0
    };
  } catch (error) {
    return Promise.reject(error);
  }
}

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return Promise.reject('Method not allowed');
  }

  const queryParams: ChannelQueryParams = {
    page: parseInt(req.query.page as string) || 1,
    perPage: parseInt(req.query.perPage as string) || 10
  };

  const validationError = validateParams(queryParams);
  if (validationError) {
    return Promise.reject(validationError);
  }

  return await fetchChannels(queryParams);
}

export default NextAPI(handler);
