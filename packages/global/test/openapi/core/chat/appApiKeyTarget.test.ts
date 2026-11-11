import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import * as history from '@fastgpt/global/openapi/core/chat/history/api';
import * as record from '@fastgpt/global/openapi/core/chat/record/api';
import * as feedback from '@fastgpt/global/openapi/core/chat/feedback/api';
import * as file from '@fastgpt/global/openapi/core/chat/file/api';
import * as sandbox from '@fastgpt/global/openapi/core/ai/sandbox/api';
import * as log from '@fastgpt/global/openapi/core/app/log/api';
import {
  InitChatQuerySchema,
  StopV2ChatSchema
} from '@fastgpt/global/openapi/core/chat/controler/api';
import { ResumeStreamParamsSchema } from '@fastgpt/global/openapi/core/ai/api';
import { CreateQuestionGuideV2BodySchema } from '@fastgpt/global/openapi/core/ai/agent/api';
import { QueryChatInputGuideBodySchema } from '@fastgpt/global/openapi/core/chat/inputGuide/api';
import {
  ReadCollectionSourceBodySchema,
  ExportCollectionBodySchema
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import { GetQuoteDataBodySchema } from '@fastgpt/global/openapi/core/dataset/data/api';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import { apiDocOpenAPIDocument } from '@fastgpt/global/openapi/provider/systemopenapi';
import { AppLogTimespanEnum } from '@fastgpt/global/core/app/logs/constants';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const id = '68ad85a7463006c963799a05';
const chat = { chatId: 'chat-1' };
const message = { ...chat, dataId: 'message-1' };
const quote = { ...chat, chatItemDataId: 'message-1' };
const dates = { dateStart: '2026-11-01T00:00:00.000Z', dateEnd: '2026-11-02T00:00:00.000Z' };
// 一个参数表覆盖每个实际开放入口，防止后续新增接口只开放 Key 却遗漏省略 ID 的契约。
const cases: [string, z.ZodType, Record<string, unknown>][] = [
  ['/core/chat/init', InitChatQuerySchema, chat],
  ['/v2/chat/stop', StopV2ChatSchema, chat],
  ['/core/chat/resume', ResumeStreamParamsSchema, chat],
  ['/core/chat/history/getHistories', history.GetHistoriesBodySchema, {}],
  [
    '/core/chat/history/getHistoryStatus',
    history.GetHistoryStatusBodySchema,
    { chatIds: ['chat-1'] }
  ],
  ['/core/chat/history/markRead', history.MarkChatReadBodySchema, chat],
  ['/core/chat/history/updateHistory', history.UpdateHistoryBodySchema, chat],
  ['/core/chat/history/delHistory', history.DelChatHistorySchema, chat],
  ['/core/chat/history/clearHistories', history.ClearChatHistoriesSchema, {}],
  ['/core/chat/history/batchDelete', history.ChatBatchDeleteBodySchema, { chatIds: ['chat-1'] }],
  ['/core/chat/record/getResData', record.GetResDataQuerySchema, message],
  [
    '/core/chat/record/delete',
    record.DeleteChatRecordBodySchema,
    { ...chat, contentId: 'message-1' }
  ],
  [
    '/core/chat/record/getQuote',
    record.GetQuoteBodySchema,
    { ...quote, datasetDataIdList: [id], collectionIdList: [id] }
  ],
  [
    '/core/chat/record/getCollectionQuote',
    record.GetCollectionQuoteBodySchema,
    { ...quote, collectionId: id }
  ],
  ['/core/chat/record/getPaginationRecords', record.GetPaginationRecordsBodySchema, chat],
  ['/core/chat/record/getRecords_v2', record.GetRecordsV2BodySchema, chat],
  [
    '/core/chat/record/getSpeech',
    record.GetChatSpeechBodySchema,
    { input: 'Hello', ttsConfig: { type: 'none' } }
  ],
  ['/v1/audio/transcriptions', record.AudioTranscriptionsDataSchema, { ...chat, duration: 1 }],
  [
    '/core/chat/feedback/updateFeedbackReadStatus',
    feedback.UpdateFeedbackReadStatusBodySchema,
    { ...message, isRead: true }
  ],
  [
    '/core/chat/feedback/adminUpdate',
    feedback.AdminUpdateFeedbackBodySchema,
    { ...message, datasetId: id, feedbackDataId: id, q: 'question' }
  ],
  [
    '/core/chat/feedback/closeCustom',
    feedback.CloseCustomFeedbackBodySchema,
    { ...message, index: 0 }
  ],
  ['/core/chat/feedback/updateUserFeedback', feedback.UpdateUserFeedbackBodySchema, message],
  [
    '/core/chat/feedback/getFeedbackRecordIds',
    feedback.GetFeedbackRecordIdsBodySchema,
    { ...chat, feedbackType: 'good' }
  ],
  [
    '/core/chat/file/presignChatFileGetUrl',
    file.PresignChatFileGetUrlSchema,
    { ...chat, key: 'file-key' }
  ],
  [
    '/core/chat/file/presignChatFilePostUrl',
    file.PresignChatFilePostUrlSchema,
    { ...chat, filename: 'file.txt' }
  ],
  ['/core/ai/sandbox/download', sandbox.SandboxDownloadBodySchema, chat],
  ['/core/ai/sandbox/upload', sandbox.SandboxUploadQuerySchema, { ...chat, path: 'file.txt' }],
  ['/core/ai/sandbox/checkExist', sandbox.SandboxCheckExistBodySchema, chat],
  ['/core/ai/sandbox/getTicket', sandbox.SandboxGetTicketBodySchema, { ...chat, channel: 'fs' }],
  [
    '/core/ai/sandbox/getHtmlPreviewLink',
    sandbox.SandboxGetHtmlPreviewLinkBodySchema,
    { ...chat, filePath: 'index.html' }
  ],
  ['/core/ai/agent/v2/createQuestionGuide', CreateQuestionGuideV2BodySchema, chat],
  ['/core/chat/inputGuide/query', QueryChatInputGuideBodySchema, { searchKey: '' }],
  ['/core/dataset/collection/read', ReadCollectionSourceBodySchema, { ...quote, collectionId: id }],
  ['/core/dataset/collection/export', ExportCollectionBodySchema, { ...quote, collectionId: id }],
  ['/core/dataset/data/getQuoteData', GetQuoteDataBodySchema, { ...quote, id }],
  ['/core/app/logs/list', log.GetAppChatLogsBodySchema, dates],
  ['/core/app/logs/search', log.SearchAppChatLogsBodySchema, dates],
  [
    '/core/app/logs/exportLogs',
    log.ExportChatLogsBodySchema,
    { ...dates, title: 'logs', sourcesMap: {}, logKeys: [] }
  ],
  ['/core/app/logs/getUsers', log.GetLogUsersBodySchema, dates],
  ['/proApi/core/app/logs/getTotalData', log.GetTotalDataQuerySchema, {}],
  [
    '/proApi/core/app/logs/getChartData',
    log.GetChartDataBodySchema,
    {
      ...dates,
      userTimespan: AppLogTimespanEnum.day,
      chatTimespan: AppLogTimespanEnum.day,
      appTimespan: AppLogTimespanEnum.day
    }
  ]
];

describe('application API key targets across dialogue APIs', () => {
  it.each(cases)(
    '%s accepts both explicit and Key-bound application targets',
    (_path, schema, input) => {
      expect(schema.safeParse({ ...input, appId: id })).toMatchObject({ success: true });
      const result = schema.safeParse(input);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('appId', id);
        expect(result.data).not.toHaveProperty('sourceId', id);
      }
    }
  );

  it('documents the application log search cursor contract', () => {
    const operation = openAPIDocument.paths?.['/core/app/logs/search']?.post;
    expect(operation).toMatchObject({
      summary: '搜索应用日志列表',
      description: '按游标搜索应用的对话日志列表，每页固定 50 条且不查询总数'
    });
    const cursor = JSON.stringify(operation?.requestBody);
    expect(cursor).toContain('上一页响应中的 nextCursor');
    expect(cursor).toContain('68ad85a7463006c963799a05');
  });

  it('publishes the no-appId union branch in every dialogue operation', () => {
    /** 检查最终生成的文档，避免 union/intersection 合并后重新暴露服务端固定字段。 */
    const checkAppKeyBranch = (value: unknown, path: string) => {
      if (!value || typeof value !== 'object') return;
      if ('title' in value && value.title === '应用 API Key（无需 appId）') {
        expect(JSON.stringify(value), path).not.toMatch(/"sourceType":/);
        if (path === '/core/chat/history/getHistories')
          expect(JSON.stringify(value), path).not.toMatch(/"source":/);
        return;
      }
      Object.values(value).forEach((child) => checkAppKeyBranch(child, path));
    };

    for (const [path] of cases) {
      const operation = openAPIDocument.paths?.[path];
      expect(operation, path).toBeDefined();
      expect(JSON.stringify(operation), path).toMatch(/API Key（无需 appId/);
      checkAppKeyBranch(operation, path);
    }
  });

  it.each([
    ['DevAPI', openAPIDocument],
    ['System OpenAPI', apiDocOpenAPIDocument]
  ] as const)('hides customUid from unsupported Body and Query identities in %s', (_, document) => {
    const checked = { body: 0, query: 0 };

    /** 检查最终文档的整棵输入 Schema，覆盖分页交集和 Query 对象包装中的来源分支。 */
    const checkBranches = (value: unknown, location: keyof typeof checked, path: string) => {
      if (!value || typeof value !== 'object') return;
      if (
        'title' in value &&
        ['Skill 调试会话', '外链会话', '直接访问资源'].includes(String(value.title))
      ) {
        expect(JSON.stringify(value), `${location} ${path}: ${value.title}`).not.toMatch(
          /"customUid":/
        );
        checked[location]++;
      }
      Object.values(value).forEach((child) => checkBranches(child, location, path));
    };

    for (const [path, item] of Object.entries(document.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        const operation = item[method];
        if (!operation) continue;
        checkBranches(operation.requestBody, 'body', path);
        checkBranches(operation.parameters, 'query', path);
      }
    }

    expect(checked.body).toBeGreaterThan(0);
    expect(checked.query).toBeGreaterThan(0);
  });

  it('derives the App target without accepting caller-controlled type or history source', () => {
    expect(history.GetHistoriesBodySchema.parse({})).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: undefined
    });
    // 兼容旧客户端显式传 app，但不允许切换到其他资源类型。
    expect(
      history.GetHistoriesBodySchema.parse({ sourceType: ChatSourceTypeEnum.app })
    ).toMatchObject({ sourceType: ChatSourceTypeEnum.app, sourceId: undefined });
    for (const input of [{ source: ChatSourceEnum.api }, { source: ChatSourceEnum.online }])
      expect(history.GetHistoriesBodySchema.safeParse(input).success).toBe(false);

    expect(
      history.GetHistoriesBodySchema.parse({ appId: id, source: ChatSourceEnum.online })
    ).toMatchObject({ source: ChatSourceEnum.online });
  });

  it('retains invalid-target guards and keeps draft/editor uploads explicit', () => {
    for (const input of [
      { appId: 'invalid' },
      { skillId: 'invalid' },
      { sourceType: 'workflowBuilder' },
      { outLinkAuthData: {} }
    ])
      expect(history.GetHistoriesBodySchema.safeParse(input).success).toBe(false);
    expect(
      file.PresignDraftChatFilePostUrlSchema.safeParse({
        ...chat,
        filename: 'file.txt',
        fileSelectConfig: {}
      }).success
    ).toBe(false);
  });
});
