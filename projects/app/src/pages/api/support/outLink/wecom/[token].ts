import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { plusRequest } from '@fastgpt/service/common/api/plusRequest';

export type OutLinkWecomQuery = any;
export type OutLinkWecomBody = any;
export type OutLinkWecomResponse = {};

async function handler(
  req: ApiRequestProps<OutLinkWecomBody, OutLinkWecomQuery>,
  res: ApiResponseType<any>
): Promise<any> {
  // WARN: it is not supported yet.
  return {};
  const { token, type } = req.query;
  const result = await plusRequest({
    url: `support/outLink/wecom/${token}`,
    params: {
      ...req.query,
      type
    },
    data: req.body
  });
  if (result.data?.data?.message) {
    // chanllege
    res.send(result.data.data.message);
    res.end();
  }

  res.send('success');
  res.end();
}

export default handler;
