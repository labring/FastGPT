import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { forwardWecom } from '@fastgpt/service/thirdProvider/fastgptPro/api';

export type OutLinkWecomQuery = any;
export type OutLinkWecomBody = any;
async function handler(
  req: ApiRequestProps<OutLinkWecomBody, OutLinkWecomQuery>,
  res: ApiResponseType<any>
): Promise<any> {
  const { token } = req.query;
  const result = await forwardWecom({
    token,
    method: req.method,
    params: req.query,
    data: req.body
  });
  if (result.data?.data?.message) {
    return res.send(result.data.data.message);
  }

  return res.send('success');
}

export default handler;
