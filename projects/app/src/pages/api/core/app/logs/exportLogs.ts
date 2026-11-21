import {
  getChatPublishSourceName,
  getChatPublishSourceType
} from '@fastgpt/global/common/chat/publishSource';
import { extendChatPublishSources } from '@fastgpt/service/core/chat/publishSource/service';
import { buildAppChatLogFilter } from '@fastgpt/service/core/app/logs/utils';
import {
  computeAverageResponseTime,
  createAppChatLogExportCursor,
  createAppVersionNameLoader,
  findChatResponsePointsMap,
  findExportChatItemStatsMap,
  type AppChatLogExportDoc,
  type ExportChatItemBatchStats
} from '@fastgpt/service/core/app/logs/entity';
import type { NextApiResponse } from 'next';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { formatDateWithOffset } from '@fastgpt/global/common/time/fixedOffset';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { getTeamMemberMap } from '@fastgpt/service/support/user/team/utils';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
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

  const cursor = createAppChatLogExportCursor({
    filter: where,
    needVersionName,
    needVariables: variables.length > 0
  });
  const versionNameLoader = createAppVersionNameLoader();

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

  type ExportRenderRow = Awaited<
    ReturnType<typeof extendChatPublishSources<AppChatLogExportDoc>>
  >[number];

  const renderRow = (
    doc: ExportRenderRow,
    itemStats: ExportChatItemBatchStats | undefined,
    responsePoints: number
  ) => {
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
    const averageResponseTime = computeAverageResponseTime(
      itemStats?.totalResponseTime,
      itemStats?.aiMessageCount
    );
    const totalPoints = (itemStats?.totalPointsFromChatItem ?? 0) + responsePoints;

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
      [AppLogKeysEnum.VERSION_NAME]: () => versionNameLoader.get(doc.appVersionId),
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

  const flush = async (batch: AppChatLogExportDoc[]) => {
    const batchChatIds = Array.from(new Set(batch.map((doc) => doc.chatId).filter(Boolean)));
    const [rows, , itemStatsMap, responsePointsMap] = await Promise.all([
      extendChatPublishSources({ list: batch, teamId, appId }),
      needVersionName
        ? versionNameLoader.preload(batch.map((doc) => doc.appVersionId))
        : Promise.resolve(),
      findExportChatItemStatsMap({
        appId,
        chatIds: batchChatIds,
        needResponseTime,
        needPoints,
        needFeedback,
        needCustomFeedback,
        needAnnotated
      }),
      needPoints
        ? findChatResponsePointsMap({ appId, chatIds: batchChatIds })
        : Promise.resolve(new Map<string, number>())
    ]);
    for (const row of rows) {
      if (res.destroyed || res.writableEnded) break;
      await write(
        renderRow(row, itemStatsMap.get(row.chatId), responsePointsMap.get(row.chatId) ?? 0)
      );
    }
  };

  try {
    await write(csvHeader);
    let batch: AppChatLogExportDoc[] = [];
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
