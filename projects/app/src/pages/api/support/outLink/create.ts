import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import type { OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';
import { customAlphabet } from 'nanoid';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

/* create a shareChat */
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 24);

export type OutLinkCreateQuery = {};
export type OutLinkCreateBody = OutLinkEditType &
  OutLinkEditType & {
    appId: string;
    type: PublishChannelEnum;
  };
export type OutLinkCreateResponse = string;

async function handler(
  req: ApiRequestProps<OutLinkCreateBody, OutLinkCreateQuery>
): Promise<OutLinkCreateResponse> {
  const { appId, ...props } = req.body;

  const { teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: ManagePermissionVal
  });

  const shareId = nanoid();
  await MongoOutLink.create({
    shareId,
    teamId,
    tmbId,
    appId,
    ...props
  });

  return shareId;
}

export default NextAPI(handler);
