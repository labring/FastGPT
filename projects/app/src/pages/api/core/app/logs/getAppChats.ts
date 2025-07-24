import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { Types } from 'mongoose';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';

export type getAppChatsQuery = {};

export type getAppChatsBody = PaginationProps<{
  appId: string;
  search: string;
}>;

export type getAppChatsResponse = PaginationResponse<{
  chatId: string;
  title: string;
}>;

async function handler(
  req: ApiRequestProps<getAppChatsBody, getAppChatsQuery>,
  res: ApiResponseType<any>
): Promise<getAppChatsResponse> {
  const { appId, search } = req.body;
  const { pageSize = 20, offset } = parsePaginationRequest(req);

  const { teamId } = await authApp({ req, authToken: true, appId, per: WritePermissionVal });

  const where = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId),
    ...(search && {
      $or: [
        { chatId: { $regex: new RegExp(`${replaceRegChars(search)}`, 'i') } },
        { title: { $regex: new RegExp(`${replaceRegChars(search)}`, 'i') } },
        { customTitle: { $regex: new RegExp(`${replaceRegChars(search)}`, 'i') } }
      ]
    })
  };

  const [list, total] = await Promise.all([
    MongoChat.aggregate(
      [
        { $match: where },
        {
          $sort: {
            updateTime: -1
          }
        },
        { $skip: offset },
        { $limit: pageSize }
      ],
      {
        ...readFromSecondary
      }
    ),
    MongoChat.countDocuments(where, { ...readFromSecondary })
  ]);

  return {
    list: list.map((item) => ({
      chatId: item.chatId,
      title: item.customTitle || item.title
    })),
    total
  };
}

export default NextAPI(handler);
