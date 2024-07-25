import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
export type UserAccountUpdateNotificationMethodQuery = {};
export type UserAccountUpdateNotificationMethodBody = {
  account: string;
  verifyCode: string;
};
export type UserAccountUpdateNotificationMethodResponse = {};
async function handler(
  req: ApiRequestProps<
    UserAccountUpdateNotificationMethodBody,
    UserAccountUpdateNotificationMethodQuery
  >,
  _res: ApiResponseType<any>
): Promise<UserAccountUpdateNotificationMethodResponse> {
  // TODO: implement
  const { account, verifyCode } = req.body;
  console.log(account, verifyCode);
  return {};
}

export default NextAPI(handler);
