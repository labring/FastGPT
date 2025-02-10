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
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

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
  const teamMembers = await MongoTeamMember.find({ teamId });

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
            {
              $project: {
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
          userGoodFeedbackCount: {
            $size: {
              $filter: {
                input: '$chatitems',
                as: 'item',
                cond: { $ifNull: ['$$item.userGoodFeedback', false] }
              }
            }
          },
          userBadFeedbackCount: {
            $size: {
              $filter: {
                input: '$chatitems',
                as: 'item',
                cond: { $ifNull: ['$$item.userBadFeedback', false] }
              }
            }
          },
          customFeedbacksCount: {
            $size: {
              $filter: {
                input: '$chatitems',
                as: 'item',
                cond: { $gt: [{ $size: { $ifNull: ['$$item.customFeedbacks', []] } }, 0] }
              }
            }
          },
          markCount: {
            $size: {
              $filter: {
                input: '$chatitems',
                as: 'item',
                cond: { $ifNull: ['$$item.adminFeedback', false] }
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
          userGoodFeedbackCount: 1,
          userBadFeedbackCount: 1,
          customFeedbacksCount: 1,
          markCount: 1,
          outLinkUid: 1,
          tmbId: 1
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
    const tmb = doc.outLinkUid
      ? doc.outLinkUid
      : teamMembers.find((member) => String(member._id) === String(doc.tmbId))?.name;

    const messageCount = doc.messageCount;
    const userFeedbackCount = doc.userGoodFeedbackCount || doc.userBadFeedbackCount || '-';
    const customFeedbacksCount = doc.customFeedbacksCount || '-';
    const markCount = doc.markCount;

    const res = `\n"${time}","${source}","${tmb}","${title}","${messageCount}","${userFeedbackCount}","${customFeedbacksCount}","${markCount}"`;

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
  useIPFrequencyLimit({ id: 'export-chat-logs', seconds: 2, limit: 1, force: true }),
  handler
);
