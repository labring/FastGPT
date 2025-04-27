import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import axios from 'axios';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export type FetchWorkflowBody = {
  url: string;
};

export type FetchWorkflowQuery = {
  url: string;
};

export type FetchWorkflowResponseType = ApiResponseType<{
  data: JSON;
}>;

async function handler(
  req: ApiRequestProps<FetchWorkflowBody, FetchWorkflowQuery>,
  res: FetchWorkflowResponseType
) {
  await authCert({ req, authToken: true });

  const url = req.body?.url || req.query?.url;

  if (!url) {
    return Promise.reject('app:type.error.URLempty');
  }

  const response = await axios.get(url, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; FastGPT/1.0)'
    },
    timeout: 30000,
    validateStatus: (status) => status < 500
  });

  const contentType = response.headers['content-type'] || '';

  if (!response.data || response.data.length === 0) {
    return Promise.reject('app:type.error.workflowresponseempty');
  }

  JSON.parse(JSON.stringify(response.data));

  return response.data;
}

export default NextAPI(handler);
