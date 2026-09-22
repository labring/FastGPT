import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { forwardOffiaccount } from '@fastgpt/service/thirdProvider/fastgptPro/api';

export type OutLinkOffiAccountQuery = any;
export type OutLinkOffiAccountBody = any;
async function handler(
  req: ApiRequestProps<OutLinkOffiAccountBody, OutLinkOffiAccountQuery>,
  res: ApiResponseType<any>
): Promise<any> {
  const { token } = req.query;
  const result = await forwardOffiaccount({
    token,
    method: req.method,
    params: req.query,
    data: req.body
  });

  return res.send(result.data?.data?.message ?? '');
}

export default handler;
