import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import axios from 'axios';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { isInternalAddress } from '@fastgpt/service/common/system/utils';
import { type NextApiResponse } from 'next';

export type FetchWorkflowBody = {
  url: string;
};

export type FetchWorkflowQuery = {};

export type FetchWorkflowResponseType = {
  data: Record<string, any>;
};

async function handler(
  req: ApiRequestProps<FetchWorkflowBody, FetchWorkflowQuery>,
  res: NextApiResponse
): Promise<FetchWorkflowResponseType> {
  await authCert({ req, authToken: true });

  const url = req.body?.url;

  if (!url) {
    return Promise.reject('Url is empty');
  }
  if (isInternalAddress(url)) {
    return Promise.reject('Url is invalid');
  }

  const { data } = await axios.get(url, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; FastGPT/1.0)'
    },
    timeout: 30000,
    validateStatus: (status) => status < 500
  });

  return data;
}

export default NextAPI(handler);
