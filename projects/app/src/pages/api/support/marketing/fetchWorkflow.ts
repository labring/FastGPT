import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { axios } from '@fastgpt/service/common/api/axios';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { isInternalAddress, PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';
import { type NextApiResponse } from 'next';
import {
  FetchWorkflowBodySchema,
  FetchWorkflowResponseSchema,
  type FetchWorkflowBodyType,
  type FetchWorkflowResponseType
} from '@fastgpt/global/openapi/common/other/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps<FetchWorkflowBodyType>,
  _res: NextApiResponse
): Promise<FetchWorkflowResponseType> {
  await authCert({ req, authToken: true });

  const { url } = parseApiInput({ req, bodySchema: FetchWorkflowBodySchema }).body;
  if (await isInternalAddress(url)) {
    return Promise.reject(PRIVATE_URL_TEXT);
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

  // Check type
  if (typeof data !== 'object') {
    return Promise.reject('Invalid data');
  }

  return FetchWorkflowResponseSchema.parse(data);
}

export default NextAPI(handler);
