import type { NextApiResponse } from 'next';
import { responseWriteController } from '@fastgpt/service/common/response';
import { addDays } from 'date-fns';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import dayjs from 'dayjs';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { NextAPI } from '@/service/middleware/entry';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { GetAppChatLogsProps } from '@/global/core/api/appReq';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { Types } from 'mongoose';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatItemCollectionName } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { ChatItemValueTypeEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { MongoUser } from '@fastgpt/service/support/user/schema';

export type ExportChatLogsBody = GetAppChatLogsProps & {
  title: string;
  sourcesMap: Record<string, { label: string }>;
};

async function handler(req: ApiRequestProps<ExportChatLogsBody, {}>, res: NextApiResponse) {
  let {
    appId,
    dateStart = addDays(new Date(), -7),
    dateEnd = new Date(),
    sources,
    logTitle,

    title,
    sourcesMap
  } = req.body;

  if (!appId) {
    throw new Error('缺少参数');
  }

  const { teamId } = await authApp({ req, authToken: true, appId, per: WritePermissionVal });
  const teamMemberWithContact = await Promise.all(
    (await MongoTeamMember.find({ teamId })).map(async (member) => {
      const user = await MongoUser.findById(member.userId);
      return {
        memberId: member._id,
        teamId: member.teamId,
        userId: member.userId,
        name: member.name,
        role: member.role,
        status: member.status,
        contact: user?.contact || '-'
      };
    })
  );

  const where = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId),
    updateTime: {
      $gte: new Date(dateStart),
      $lte: new Date(dateEnd)
    },
    ...(sources && { source: { $in: sources } }),
    ...(logTitle && {
      $or: [
        { title: { $regex: new RegExp(`${replaceRegChars(logTitle)}`, 'i') } },
        { customTitle: { $regex: new RegExp(`${replaceRegChars(logTitle)}`, 'i') } }
      ]
    })
  };

  res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
  res.setHeader('Content-Disposition', 'attachment; filename=usage.csv; ');

  const cursor = MongoChat.aggregate(
    [
      { $match: where },
      {
        $sort: {
          userBadFeedbackCount: -1,
          userGoodFeedbackCount: -1,
          customFeedbacksCount: -1,
          updateTime: -1
        }
      },
      { $limit: 50000 },
      {
        $lookup: {
          from: ChatItemCollectionName,
          let: { chatId: '$chatId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$appId', new Types.ObjectId(appId)] },
                    { $eq: ['$chatId', '$$chatId'] }
                  ]
                }
              }
            },
            { $sort: { _id: 1 } },
            {
              $project: {
                value: 1,
                userGoodFeedback: 1,
                userBadFeedback: 1,
                customFeedbacks: 1,
                adminFeedback: 1
              }
            }
          ],
          as: 'chatitems'
        }
      },
      {
        $addFields: {
          userGoodFeedbackItems: {
            $filter: {
              input: '$chatitems',
              as: 'item',
              cond: { $ifNull: ['$$item.userGoodFeedback', false] }
            }
          },
          userBadFeedbackItems: {
            $filter: {
              input: '$chatitems',
              as: 'item',
              cond: { $ifNull: ['$$item.userBadFeedback', false] }
            }
          },
          customFeedbackItems: {
            $filter: {
              input: '$chatitems',
              as: 'item',
              cond: { $gt: [{ $size: { $ifNull: ['$$item.customFeedbacks', []] } }, 0] }
            }
          },
          markItems: {
            $filter: {
              input: '$chatitems',
              as: 'item',
              cond: { $ifNull: ['$$item.adminFeedback', false] }
            }
          },
          chatDetails: {
            $map: {
              input: '$chatitems',
              as: 'item',
              in: {
                id: '$$item._id',
                value: '$$item.value'
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          id: '$chatId',
          title: 1,
          customTitle: 1,
          source: 1,
          time: '$updateTime',
          messageCount: { $size: '$chatitems' },
          userGoodFeedbackItems: 1,
          userBadFeedbackItems: 1,
          customFeedbackItems: 1,
          markItems: 1,
          outLinkUid: 1,
          tmbId: 1,
          chatDetails: 1
        }
      }
    ],
    {
      ...readFromSecondary
    }
  ).cursor({ batchSize: 1000 });

  const write = responseWriteController({
    res,
    readStream: cursor
  });

  write(`\uFEFF${title}`);

  cursor.on('data', (doc) => {
    const time = dayjs(doc.time.toISOString()).format('YYYY-MM-DD HH:mm:ss');
    const source = sourcesMap[doc.source as ChatSourceEnum]?.label || doc.source;
    const title = doc.customTitle || doc.title;
    const tmbName = doc.outLinkUid
      ? doc.outLinkUid
      : teamMemberWithContact.find((member) => String(member.memberId) === String(doc.tmbId))?.name;
    const tmbContact = teamMemberWithContact.find(
      (member) => String(member.memberId) === String(doc.tmbId)
    )?.contact;

    const messageCount = doc.messageCount;
    const userGoodFeedbackItems = doc.userGoodFeedbackItems || [];
    const userBadFeedbackItems = doc.userBadFeedbackItems || [];
    const customFeedbackItems = doc.customFeedbackItems || [];
    const markItems = doc.markItems || [];
    const chatDetails = doc.chatDetails.map(
      (chat: { id: string; value: AIChatItemValueItemType[] }) => {
        return chat.value.map((item) => {
          if ([ChatItemValueTypeEnum.text, ChatItemValueTypeEnum.reasoning].includes(item.type)) {
            return item;
          }
          if (item.type === ChatItemValueTypeEnum.tool) {
            const newTools = item.tools?.map((tool) => {
              const { functionName, toolAvatar, ...rest } = tool;
              return {
                ...rest
              };
            });

            return {
              ...item,
              tools: newTools
            };
          }
          if (item.type === ChatItemValueTypeEnum.interactive) {
            const newInteractive = {
              type: item.interactive?.type,
              params: item.interactive?.params
            };

            return {
              ...item,
              interactive: newInteractive
            };
          }
        });
      }
    );

    const userGoodFeedbackItemsStr = JSON.stringify(userGoodFeedbackItems)
      .replace(/"/g, '""')
      .replace(/\n/g, '\\n');
    const userBadFeedbackItemsStr = JSON.stringify(userBadFeedbackItems)
      .replace(/"/g, '""')
      .replace(/\n/g, '\\n');
    const customFeedbackItemsStr = JSON.stringify(customFeedbackItems)
      .replace(/"/g, '""')
      .replace(/\n/g, '\\n');
    const markItemsStr = JSON.stringify(markItems).replace(/"/g, '""').replace(/\n/g, '\\n');
    const chatDetailsStr = JSON.stringify(chatDetails).replace(/"/g, '""').replace(/\n/g, '\\n');

    const res = `\n"${time}","${source}","${tmbName}","${tmbContact}","${title}","${messageCount}","${userGoodFeedbackItemsStr}","${userBadFeedbackItemsStr}","${customFeedbackItemsStr}","${markItemsStr}","${chatDetailsStr}"`;

    write(res);
  });

  cursor.on('end', () => {
    cursor.close();
    res.end();
  });

  cursor.on('error', (err) => {
    addLog.error(`export chat logs error`, err);
    res.status(500);
    res.end();
  });
}

export default NextAPI(
  useIPFrequencyLimit({ id: 'export-chat-logs', seconds: 60, limit: 1, force: true }),
  handler
);
