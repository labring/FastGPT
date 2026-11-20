import {
  getChatPublishSourceName,
  getChatPublishSourceType
} from '@fastgpt/global/common/chat/publishSource';
import { extendChatPublishSources } from '@fastgpt/service/core/chat/publishSource/service';
import { buildAppChatLogFilter } from '@fastgpt/service/core/app/logs/utils';
import type { NextApiResponse } from 'next';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { formatDateWithOffset } from '@fastgpt/global/common/time/fixedOffset';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
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
  const cursor = MongoChat.find(
    where,
    {
      _id: 1,
      chatId: 1,
      title: 1,
      customTitle: 1,
      source: 1,
      sourceName: 1,
      publishSource: 1,
      updateTime: 1,
      createTime: 1,
      errorCount: 1,
      outLinkUid: 1,
      tmbId: 1,
      variables: 1,
      'metadata.originIp': 1,
      ...(needVersionName ? { appVersionId: 1 } : {})
    },
    readFromSecondary
  )
    .sort({ updateTime: -1 })
    .limit(50000)
    .lean()
    .cursor({ batchSize: 1000 });

  const versionNameMap = new Map<string, string>();
  const loadVersionNames = async (batch: any[]) => {
    if (!needVersionName) return;
    const missingIds: Types.ObjectId[] = [];
    for (const doc of batch) {
      if (!doc.appVersionId || !Types.ObjectId.isValid(doc.appVersionId)) continue;
      const idStr = String(doc.appVersionId);
      if (!versionNameMap.has(idStr)) {
        versionNameMap.set(idStr, '');
        missingIds.push(new Types.ObjectId(idStr));
      }
    }
    if (missingIds.length === 0) return;

    const versions = await MongoAppVersion.find(
      { _id: { $in: missingIds } },
      { _id: 1, versionName: 1 },
      readFromSecondary
    ).lean();
    for (const version of versions) {
      versionNameMap.set(String(version._id), version.versionName || '');
    }
  };

  type ExportChatItemBatchStats = {
    _id: string;
    messageCount: number;
    totalResponseTime?: number;
    aiMessageCount?: number;
    totalPointsFromChatItem?: number;
    chatDetails: Array<{ id: Types.ObjectId; value: any }>;
    userGoodFeedbackItems?: Array<{ _id: Types.ObjectId; userGoodFeedback: any }>;
    userBadFeedbackItems?: Array<{ _id: Types.ObjectId; userBadFeedback: any }>;
    customFeedbackItems?: Array<{ _id: Types.ObjectId; customFeedbacks: any }>;
    markItems?: Array<{ _id: Types.ObjectId; adminFeedback: any }>;
  };

  const loadBatchChatItemStats = async (chatIds: string[]) => {
    if (chatIds.length === 0) return new Map<string, ExportChatItemBatchStats>();

    const groupStage: Record<string, any> = {
      _id: '$chatId',
      messageCount: { $sum: 1 },
      chatDetails: {
        $push: {
          id: '$_id',
          value: '$value'
        }
      }
    };
    if (needResponseTime) {
      groupStage.totalResponseTime = {
        $sum: {
          $cond: [{ $eq: ['$obj', 'AI'] }, { $ifNull: ['$durationSeconds', 0] }, 0]
        }
      };
      groupStage.aiMessageCount = {
        $sum: {
          $cond: [{ $eq: ['$obj', 'AI'] }, 1, 0]
        }
      };
    }
    if (needPoints) {
      groupStage.totalPointsFromChatItem = {
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
      groupStage.feedbackMeta = {
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

    const projectStage: Record<string, any> = {
      _id: 1,
      messageCount: 1,
      chatDetails: { $slice: ['$chatDetails', -100] }
    };
    if (needResponseTime) {
      projectStage.totalResponseTime = 1;
      projectStage.aiMessageCount = 1;
    }
    if (needPoints) {
      projectStage.totalPointsFromChatItem = 1;
    }
    if (needFeedback) {
      projectStage.userGoodFeedbackItems = {
        $filter: {
          input: '$feedbackMeta',
          as: 'item',
          cond: { $ifNull: ['$$item.userGoodFeedback', false] }
        }
      };
      projectStage.userBadFeedbackItems = {
        $filter: {
          input: '$feedbackMeta',
          as: 'item',
          cond: { $ifNull: ['$$item.userBadFeedback', false] }
        }
      };
    }
    if (needCustomFeedback) {
      projectStage.customFeedbackItems = {
        $filter: {
          input: '$feedbackMeta',
          as: 'item',
          cond: { $gt: [{ $size: { $ifNull: ['$$item.customFeedbacks', []] } }, 0] }
        }
      };
    }
    if (needAnnotated) {
      projectStage.markItems = {
        $filter: {
          input: '$feedbackMeta',
          as: 'item',
          cond: { $ifNull: ['$$item.adminFeedback', false] }
        }
      };
    }

    const stats = await MongoChatItem.aggregate<ExportChatItemBatchStats>(
      [
        {
          $match: {
            appId: appObjectId,
            chatId: { $in: chatIds },
            $or: [{ sourceType: ChatSourceTypeEnum.app }, { sourceType: { $exists: false } }]
          }
        },
        { $sort: { _id: 1 } },
        { $group: groupStage },
        { $project: projectStage }
      ],
      { ...readFromSecondary, allowDiskUse: true }
    );
    return new Map(stats.map((item) => [item._id, item]));
  };

  const loadBatchResponsePoints = async (chatIds: string[]) => {
    if (!needPoints || chatIds.length === 0) return new Map<string, number>();
    const stats = await MongoChatItemResponse.aggregate<{
      _id: string;
      totalPointsFromResponse: number;
    }>(
      [
        {
          $match: {
            appId: appObjectId,
            chatId: { $in: chatIds },
            $or: [{ sourceType: ChatSourceTypeEnum.app }, { sourceType: { $exists: false } }]
          }
        },
        {
          $group: {
            _id: '$chatId',
            totalPointsFromResponse: {
              $sum: { $ifNull: ['$data.totalPoints', 0] }
            }
          }
        }
      ],
      { ...readFromSecondary }
    );
    return new Map(stats.map((item) => [item._id, item.totalPointsFromResponse || 0]));
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
    const region = getLocationFromIp(doc.metadata?.originIp, locale);
    const itemStats = doc._itemStats as ExportChatItemBatchStats | undefined;
    const aiMessageCount = itemStats?.aiMessageCount ?? 0;
    const averageResponseTime =
      aiMessageCount > 0 ? (itemStats?.totalResponseTime ?? 0) / aiMessageCount : 0;
    const totalPoints =
      (itemStats?.totalPointsFromChatItem ?? 0) + ((doc._responsePoints as number) || 0);

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
      [AppLogKeysEnum.MESSAGE_COUNT]: () => itemStats?.messageCount ?? 0,
      [AppLogKeysEnum.FEEDBACK]: () => {
        const goodItems = (itemStats?.userGoodFeedbackItems || []).map((item: any) => ({
          chatItemId: item._id,
          feedback: item.userGoodFeedback
        }));
        const badItems = (itemStats?.userBadFeedbackItems || []).map((item: any) => ({
          chatItemId: item._id,
          feedback: item.userBadFeedback
        }));
        return formatJsonString({ good: goodItems, bad: badItems });
      },
      [AppLogKeysEnum.CUSTOM_FEEDBACK]: () => {
        const customItems = (itemStats?.customFeedbackItems || []).map((item: any) => ({
          chatItemId: item._id,
          feedbacks: item.customFeedbacks || []
        }));
        return formatJsonString(customItems);
      },
      [AppLogKeysEnum.ANNOTATED_COUNT]: () => {
        const markItems = (itemStats?.markItems || []).map((item: any) => ({
          chatItemId: item._id,
          feedback: item.adminFeedback
        }));
        return formatJsonString(markItems);
      },
      [AppLogKeysEnum.RESPONSE_TIME]: () =>
        averageResponseTime ? Number(averageResponseTime).toFixed(2) : 0,
      [AppLogKeysEnum.ERROR_COUNT]: () => doc.errorCount || 0,
      [AppLogKeysEnum.POINTS]: () => (totalPoints ? Number(totalPoints).toFixed(2) : 0),
      [AppLogKeysEnum.REGION]: () => region,
      [AppLogKeysEnum.VERSION_NAME]: () =>
        doc.appVersionId ? versionNameMap.get(String(doc.appVersionId)) || '' : '',
      chatDetails: () => formatJsonString(itemStats?.chatDetails || [])
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
    const batchChatIds = Array.from(new Set(batch.map((doc) => doc.chatId).filter(Boolean)));
    const [rows, , itemStatsMap, responsePointsMap] = await Promise.all([
      extendChatPublishSources({ list: batch, teamId, appId }),
      loadVersionNames(batch),
      loadBatchChatItemStats(batchChatIds),
      loadBatchResponsePoints(batchChatIds)
    ]);
    for (const row of rows) {
      if (res.destroyed || res.writableEnded) break;
      await write(
        renderRow({
          ...row,
          _itemStats: itemStatsMap.get(row.chatId),
          _responsePoints: responsePointsMap.get(row.chatId) ?? 0
        })
      );
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
