import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import * as fs from 'fs';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export type writefileQuery = {};

export type writefileBody = {
  name: string;
  content: string;
};

export type writefileResponse = {};

async function handler(
  req: ApiRequestProps<writefileBody, writefileQuery>,
  res: ApiResponseType<any>
): Promise<writefileResponse> {
  await authCert({ req, authRoot: true });
  const { name, content } = req.body;
  await fs.promises.writeFile(`public/${name}`, content);
  return {};
}

export default NextAPI(handler);
