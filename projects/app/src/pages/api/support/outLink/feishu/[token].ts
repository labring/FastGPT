import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { postForwardFeishu } from '@fastgpt/service/thirdProvider/fastgptPro/api';

export type OutLinkFeishuQuery = any;
export type OutLinkFeishuBody = any;
async function handler(
  req: ApiRequestProps<OutLinkFeishuBody, OutLinkFeishuQuery>,
  res: ApiResponseType<any>
): Promise<void> {
  // send to pro
  const { token } = req.query;
  const result = await postForwardFeishu({ token, data: req.body, headers: req.headers as any });
  res.json(result);
}

export default handler;
