import type { NextApiRequest, NextApiResponse } from 'next';
import { loadOpenAPISchemaFromUrl } from '@fastgpt/global/common/string/swagger';
import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { isInternalAddress } from '@fastgpt/service/common/system/utils';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const apiURL = req.body.url as string;

  if (!apiURL) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const isInternal = isInternalAddress(apiURL);

  if (isInternal) {
    return Promise.reject('Invalid url');
  }

  return await loadOpenAPISchemaFromUrl(apiURL);
}

export default NextAPI(handler);
