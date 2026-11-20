import {
  getChatPublishSourceName,
  getChatPublishSourceType
} from '@fastgpt/global/common/chat/publishSource';
import { extendChatPublishSources } from '@fastgpt/service/core/chat/publishSource/service';
import { buildAppChatLogFilter } from '@fastgpt/service/core/app/logs/utils';
import type { NextApiResponse } from 'next';
import {
  parseObjectId,
  readFromPrimary,
  readFromSecondary
} from '@fastgpt/service/common/mongo/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { formatDateWithOffset } from '@fastgpt/global/common/time/fixedOffset';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import {
  ChatItemCollectionName,
  ChatItemResponseCollectionName
} from '@fastgpt/service/core/chat/constants';
import { getTeamMemberMap } from '@fastgpt/service/support/user/team/utils';
import { ChatSourceTypeEnum, type ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { AppLogKeysEnum } from '@fastgpt/global/core/app/logs/constants';
import { sanitizeCsvField } from '@fastgpt/service/common/file/csv';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { buildAppAuditResource } from '@fastgpt/global/support/user/audit/type';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import {
  assertMemberRateLimit,
  MemberRateLimitPolicy
} from '@fastgpt/service/common/rateLimit/interface/member';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { getTimezoneCodeFromStr } from '@fastgpt/global/common/time/timezone';
import { getLocationFromIp } from '@fastgpt/service/common/geo';
import { getDisplayChatTitle } from '@fastgpt/service/core/chat/title';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { ExportChatLogsBodySchema } from '@fastgpt/global/openapi/core/app/log/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { isUnselectedLogUserFilter } from '@fastgpt/global/core/app/logs/utils';
const logger = getLogger(LogCategories.MODULE.APP.LOGS);

const formatJsonString = (data: any) => {
  if (data == null) return '';
  if (typeof data === 'object') {
    return sanitizeCsvField(JSON.stringify(data));
  }
  return data;
};

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const {
    appId: requestedAppId,
    dateStart,
    dateEnd,
    sources,
    tmbIds,
    outLinkUids,
    chatSearch,
    searchType,
    title,
    sourcesMap,
    logKeys = [],
    feedbackType,
    unreadOnly,
    errorFilter
  } = parseApiInput({
    req,
    bodySchema: ExportChatLogsBodySchema
  }).body;

  const locale = getLocale(req);
  const timezoneCode = getTimezoneCodeFromStr(dateStart);

  const { teamId, tmbId, app, appId } = await authApp({
    req,
    authToken: true,
    authAppApiKey: true,
    appId: requestedAppId,
    per: AppReadChatLogPerVal
  });
  await assertMemberRateLimit({
    policy: MemberRateLimitPolicy.ExportChatLogs,
    memberId: String(tmbId)
  });
  const { chatConfig } = await getAppLatestVersion(appId, app);
  const variables = (chatConfig.variables || []).filter(
    (item) => item.type !== VariableInputEnum.password
  );
  const csvHeader = `\uFEFF${title},${variables.map((variable) => formatJsonString(variable.label)).join(',')}`;
  const logExportAudit = () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.EXPORT_APP_CHAT_LOG,
      resources: [buildAppAuditResource(app)],
      params: {
        appName: app.name,
        appType: getI18nAppType(app.type)
      }
    });
  };

  // 用户未选择时鉴权后直接给空 CSV，避免再跑成员聚合和聊天日志 pipeline。
  if (isUnselectedLogUserFilter(tmbIds, outLinkUids)) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
    res.setHeader('Content-Disposition', 'attachment; filename=usage.csv; ');
    res.write(csvHeader);
    res.end();
    logExportAudit();
    return;
  }

  // Get members
  const memberDisplayMap = await getTeamMemberMap({ teamId, fields: '_id name' });
  const needVersionName = logKeys.includes(AppLogKeysEnum.VERSION_NAME);
  const needPoints = logKeys.includes(AppLogKeysEnum.POINTS);
  const needResponseTime = logKeys.includes(AppLogKeysEnum.RESPONSE_TIME);
  const needFeedback = logKeys.includes(AppLogKeysEnum.FEEDBACK);
  const needCustomFeedback = logKeys.includes(AppLogKeysEnum.CUSTOM_FEEDBACK);
  const needAnnotated = logKeys.includes(AppLogKeysEnum.ANNOTATED_COUNT);
  const needFeedbackMeta = needFeedback || needCustomFeedback || needAnnotated;

  const where = buildAppChatLogFilter({
    appId,
    dateStart,
    dateEnd,
    sources,
    tmbIds,
    outLinkUids,
    chatSearch,
    searchType,
    feedbackType,
    unreadOnly,
    errorFilter
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
  res.setHeader('Content-Disposition', 'attachment; filename=usage.csv; ');

  const appObjectId = new Types.ObjectId(appId);
  const chatItemGroupStage: Record<string, any> = {
    _id: null,
    messageCount: { $sum: 1 },
    chatDetails: {
      $push: {
        id: '$_id',
        value: '$value'
      }
    }
  };
  if (needResponseTime) {
    chatItemGroupStage.totalResponseTime = {
      $sum: {
        $cond: [{ $eq: ['$obj', 'AI'] }, { $ifNull: ['$durationSeconds', 0] }, 0]
      }
    };
    chatItemGroupStage.aiMessageCount = {
      $sum: {
        $cond: [{ $eq: ['$obj', 'AI'] }, 1, 0]
      }
    };
  }
  if (needPoints) {
    chatItemGroupStage.totalPointsFromChatItem = {
      $sum: {
        $reduce: {
          input: { $ifNull: ['$responseData', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.totalPoints', 0] }] }
        }
      }
    };
  }
  if (needFeedbackMeta) {
    chatItemGroupStage.feedbackMeta = {
      $push: {
        _id: '$_id',
        ...(needFeedback
          ? {
              userGoodFeedback: '$userGoodFeedback',
              userBadFeedback: '$userBadFeedback'
            }
          : {}),
        ...(needCustomFeedback ? { customFeedbacks: '$customFeedbacks' } : {}),
        ...(needAnnotated ? { adminFeedback: '$adminFeedback' } : {})
      }
    };
  }

  // 会话、消息和（按需）积分保持在同一次从库聚合内，保证同一副本节点一致视图，避免跨滞后从库混读；
  // 大文档 app_versions 留在批次应用层按需最小投影批量查询，并在从库未命中时显式回主库确认。
  const cursor = MongoChat.aggregate(
    [
      { $match: where },
      { $sort: { updateTime: -1 } },
      { $limit: 50000 },
      {
        $lookup: {
          from: ChatItemCollectionName,
          let: { chatId: '$chatId', appId: appObjectId },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$appId', '$$appId'] },
                    { $eq: ['$chatId', '$$chatId'] },
                    {
                      $or: [
                        { $eq: ['$sourceType', ChatSourceTypeEnum.app] },
                        { $eq: [{ $type: '$sourceType' }, 'missing'] }
                      ]
                    }
                  ]
                }
              }
            },
            { $sort: { _id: 1 } },
            { $group: chatItemGroupStage }
          ],
          as: 'chatData'
        }
      },
      ...(needPoints
        ? [
            {
              $lookup: {
                from: ChatItemResponseCollectionName,
                let: { appId: appObjectId, chatId: '$chatId' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$appId', '$$appId'] },
                          { $eq: ['$chatId', '$$chatId'] },
                          {
                            $or: [
                              { $eq: ['$sourceType', ChatSourceTypeEnum.app] },
                              { $eq: [{ $type: '$sourceType' }, 'missing'] }
                            ]
                          }
                        ]
                      }
                    }
                  },
                  {
                    $group: {
                      _id: null,
                      totalPointsFromResponse: {
                        $sum: { $ifNull: ['$data.totalPoints', 0] }
                      }
                    }
                  }
                ],
                as: 'chatItemResponsesData'
              }
            }
          ]
        : []),
      {
        $addFields: {
          messageCount: { $ifNull: [{ $arrayElemAt: ['$chatData.messageCount', 0] }, 0] },
          ...(needResponseTime
            ? {
                averageResponseTime: {
                  $cond: [
                    {
                      $gt: [{ $ifNull: [{ $arrayElemAt: ['$chatData.aiMessageCount', 0] }, 0] }, 0]
                    },
                    {
                      $divide: [
                        { $ifNull: [{ $arrayElemAt: ['$chatData.totalResponseTime', 0] }, 0] },
                        { $ifNull: [{ $arrayElemAt: ['$chatData.aiMessageCount', 0] }, 1] }
                      ]
                    },
                    0
                  ]
                }
              }
            : {}),
          errorCount: { $ifNull: ['$errorCount', 0] },
          ...(needPoints
            ? {
                totalPoints: {
                  $add: [
                    { $ifNull: [{ $arrayElemAt: ['$chatData.totalPointsFromChatItem', 0] }, 0] },
                    {
                      $ifNull: [
                        { $arrayElemAt: ['$chatItemResponsesData.totalPointsFromResponse', 0] },
                        0
                      ]
                    }
                  ]
                }
              }
            : {}),
          ...(needFeedback
            ? {
                userGoodFeedbackItems: {
                  $filter: {
                    input: { $ifNull: [{ $arrayElemAt: ['$chatData.feedbackMeta', 0] }, []] },
                    as: 'item',
                    cond: { $ifNull: ['$$item.userGoodFeedback', false] }
                  }
                },
                userBadFeedbackItems: {
                  $filter: {
                    input: { $ifNull: [{ $arrayElemAt: ['$chatData.feedbackMeta', 0] }, []] },
                    as: 'item',
                    cond: { $ifNull: ['$$item.userBadFeedback', false] }
                  }
                }
              }
            : {}),
          ...(needCustomFeedback
            ? {
                customFeedbackItems: {
                  $filter: {
                    input: { $ifNull: [{ $arrayElemAt: ['$chatData.feedbackMeta', 0] }, []] },
                    as: 'item',
                    cond: { $gt: [{ $size: { $ifNull: ['$$item.customFeedbacks', []] } }, 0] }
                  }
                }
              }
            : {}),
          ...(needAnnotated
            ? {
                markItems: {
                  $filter: {
                    input: { $ifNull: [{ $arrayElemAt: ['$chatData.feedbackMeta', 0] }, []] },
                    as: 'item',
                    cond: { $ifNull: ['$$item.adminFeedback', false] }
                  }
                }
              }
            : {}),
          chatDetails: {
            $slice: [{ $ifNull: [{ $arrayElemAt: ['$chatData.chatDetails', 0] }, []] }, -100]
          }
        }
      },
      {
        $project: {
          _id: 1,
          chatId: 1,
          title: 1,
          customTitle: 1,
          source: 1,
          sourceName: 1,
          publishSource: 1,
          updateTime: 1,
          createTime: 1,
          messageCount: 1,
          ...(needResponseTime ? { averageResponseTime: 1 } : {}),
          errorCount: 1,
          ...(needPoints ? { totalPoints: 1 } : {}),
          outLinkUid: 1,
          tmbId: 1,
          ...(needVersionName ? { appVersionId: 1 } : {}),
          ...(needFeedback ? { userGoodFeedbackItems: 1, userBadFeedbackItems: 1 } : {}),
          ...(needCustomFeedback ? { customFeedbackItems: 1 } : {}),
          ...(needAnnotated ? { markItems: 1 } : {}),
          chatDetails: 1,
          variables: 1,
          originIp: '$metadata.originIp'
        }
      }
    ],
    { ...readFromSecondary }
  ).cursor({ batchSize: 1000 });

  const versionNameMap = new Map<string, string>();
  const loadVersionNames = async (batch: any[]) => {
    if (!needVersionName) return;
    const missingMap = new Map<string, Types.ObjectId>();
    for (const doc of batch) {
      const oid = parseObjectId(doc.appVersionId);
      if (!oid) continue;
      const idStr = oid.toString();
      if (!versionNameMap.has(idStr) && !missingMap.has(idStr)) {
        missingMap.set(idStr, oid);
      }
    }
    if (missingMap.size === 0) return;

    const secondaryVersions = await MongoAppVersion.find(
      { _id: { $in: Array.from(missingMap.values()) } },
      { _id: 1, versionName: 1 },
      readFromSecondary
    ).lean();
    for (const version of secondaryVersions) {
      const idStr = String(version._id);
      versionNameMap.set(idStr, version.versionName || '');
      missingMap.delete(idStr);
    }

    // 从库未命中可能是短暂复制延迟，显式指定主库批量确认后再将真实缺失写入负缓存，
    // 避免继承连接串的 readPreference=secondaryPreferred 导致再次命中滞后副本。
    if (missingMap.size > 0) {
      const primaryVersions = await MongoAppVersion.find(
        { _id: { $in: Array.from(missingMap.values()) } },
        { _id: 1, versionName: 1 },
        readFromPrimary
      ).lean();
      for (const version of primaryVersions) {
        const idStr = String(version._id);
        versionNameMap.set(idStr, version.versionName || '');
        missingMap.delete(idStr);
      }
      for (const idStr of missingMap.keys()) {
        versionNameMap.set(idStr, '');
      }
    }
  };

  /** 每个固定批次先批量取名，再按响应背压输出，避免逐行查询和积压整份导出。 */
  const write = async (value: string) => {
    if (res.destroyed || res.writableEnded) return;
    if (res.write(value)) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        res.off('drain', done);
        res.off('close', done);
        resolve();
      };
      res.once('drain', done);
      res.once('close', done);
    });
  };

  const renderRow = (doc: any) => {
    const createdTime = doc.createTime
      ? formatDateWithOffset({
          time: doc.createTime,
          offset: timezoneCode,
          format: 'YYYY-MM-DD HH:mm:ss'
        })
      : '';
    const lastConversationTime = doc.updateTime
      ? formatDateWithOffset({
          time: doc.updateTime,
          offset: timezoneCode,
          format: 'YYYY-MM-DD HH:mm:ss'
        })
      : '';
    const channelType = doc.publishSource?.type as ChatSourceEnum | undefined;
    const source = channelType ? sourcesMap[channelType]?.label || '-' : '-';
    const titleStr = getDisplayChatTitle({ customTitle: doc.customTitle, title: doc.title });
    const authorizerId = String(doc.tmbId ?? '');
    const member = memberDisplayMap.get(authorizerId);
    // CSV 保留成员 ID；仅拼接原始姓名，避免缺名成员被展示为 id:unknown。
    const authorizer = member?.name?.trim()
      ? `${authorizerId}:${member.name}`
      : authorizerId || '-';
    const region = getLocationFromIp(doc.originIp, locale);

    const valueMap: Record<string, () => any> = {
      [AppLogKeysEnum.PUBLISH_SOURCE_TYPE]: () => source,
      [AppLogKeysEnum.SOURCE]: () =>
        getChatPublishSourceName({
          type: getChatPublishSourceType(doc),
          name: doc.publishSource?.name,
          sourceName: doc.sourceName
        }) ?? '-',
      [AppLogKeysEnum.CREATED_TIME]: () => createdTime,
      [AppLogKeysEnum.LAST_CONVERSATION_TIME]: () => lastConversationTime,
      [AppLogKeysEnum.USER]: () => doc.outLinkUid || authorizer,
      [AppLogKeysEnum.AUTH_USER]: () => authorizer,
      [AppLogKeysEnum.TITLE]: () => titleStr,
      [AppLogKeysEnum.SESSION_ID]: () => doc.chatId || '-',
      [AppLogKeysEnum.MESSAGE_COUNT]: () => doc.messageCount,
      [AppLogKeysEnum.FEEDBACK]: () => {
        const goodItems = (doc.userGoodFeedbackItems || []).map((item: any) => ({
          chatItemId: item._id,
          feedback: item.userGoodFeedback
        }));
        const badItems = (doc.userBadFeedbackItems || []).map((item: any) => ({
          chatItemId: item._id,
          feedback: item.userBadFeedback
        }));
        return formatJsonString({ good: goodItems, bad: badItems });
      },
      [AppLogKeysEnum.CUSTOM_FEEDBACK]: () => {
        const customItems = (doc.customFeedbackItems || []).map((item: any) => ({
          chatItemId: item._id,
          feedbacks: item.customFeedbacks || []
        }));
        return formatJsonString(customItems);
      },
      [AppLogKeysEnum.ANNOTATED_COUNT]: () => {
        const markItems = (doc.markItems || []).map((item: any) => ({
          chatItemId: item._id,
          feedback: item.adminFeedback
        }));
        return formatJsonString(markItems);
      },
      [AppLogKeysEnum.RESPONSE_TIME]: () =>
        doc.averageResponseTime ? Number(doc.averageResponseTime).toFixed(2) : 0,
      [AppLogKeysEnum.ERROR_COUNT]: () => doc.errorCount || 0,
      [AppLogKeysEnum.POINTS]: () => (doc.totalPoints ? Number(doc.totalPoints).toFixed(2) : 0),
      [AppLogKeysEnum.REGION]: () => region,
      [AppLogKeysEnum.VERSION_NAME]: () => {
        const versionOid = parseObjectId(doc.appVersionId);
        return versionOid ? versionNameMap.get(versionOid.toString()) || '' : '';
      },
      chatDetails: () => formatJsonString(doc.chatDetails || [])
    };

    let rowStr = [...logKeys, 'chatDetails']
      .map((key) => {
        const getter = valueMap[key];
        const val = getter ? getter() : '';
        return sanitizeCsvField(val ?? '');
      })
      .join(',');
    rowStr += `,${variables
      .map((variable) => {
        const value = doc.variables?.[variable.key] || '';
        return formatJsonString(value);
      })
      .join(',')}`;

    return `\n${rowStr}`;
  };

  const flush = async (batch: any[]) => {
    const [rows] = await Promise.all([
      extendChatPublishSources({ list: batch, teamId, appId }),
      loadVersionNames(batch)
    ]);
    for (const row of rows) {
      if (res.destroyed || res.writableEnded) break;
      await write(renderRow(row));
    }
  };

  try {
    await write(csvHeader);
    let batch: any[] = [];
    for await (const doc of cursor) {
      if (res.destroyed || res.writableEnded) break;
      batch.push(doc);
      if (batch.length === 200) {
        await flush(batch);
        batch = [];
      }
    }
    if (batch.length && !res.destroyed && !res.writableEnded) await flush(batch);
  } catch (error) {
    logger.error('export chat logs error', { error });
    if (!res.headersSent) res.status(500);
  } finally {
    await cursor.close();
    if (!res.destroyed && !res.writableEnded) res.end();
  }

  logExportAudit();
}

export default NextAPI(handler);
