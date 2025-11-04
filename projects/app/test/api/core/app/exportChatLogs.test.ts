import { describe, expect, it } from 'vitest';
import { addDays } from 'date-fns';
import { getFakeUsers } from '@test/datas/users';
import { StreamCall } from '@test/utils/request';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { AppLogKeysEnum } from '@fastgpt/global/core/app/logs/constants';
import * as exportChatLogsApi from '@/pages/api/core/app/exportChatLogs';
import type { ExportChatLogsBody } from '@/pages/api/core/app/exportChatLogs';

describe('exportChatLogs API', () => {
  it('应该成功导出聊天日志并包含反馈数据的 chatItemId', async () => {
    // 创建测试用户和应用
    const users = await getFakeUsers(2);
    const user = users.owner;

    // 创建测试应用
    const app = await MongoApp.create({
      name: 'Test App',
      type: AppTypeEnum.simple,
      teamId: user.teamId,
      tmbId: user.tmbId,
      modules: [],
      version: 'v2',
      chatConfig: {
        variables: [{ key: 'var1', label: '变量1', type: 'input' }]
      }
    });

    // 授予权限
    await MongoResourcePermission.create({
      resourceType: 'app',
      teamId: user.teamId,
      resourceId: String(app._id),
      tmbId: user.tmbId,
      permission: AppReadChatLogPerVal
    });

    // 创建测试聊天记录
    const chatId = 'test-chat-' + Date.now();
    const chat = await MongoChat.create({
      chatId,
      userId: user.userId,
      teamId: user.teamId,
      tmbId: user.tmbId,
      appId: app._id,
      title: '测试对话',
      source: ChatSourceEnum.online,
      variables: { var1: 'value1' },
      updateTime: new Date(),
      createTime: new Date()
    });

    // 创建聊天项 - 带好评反馈
    const goodFeedbackItem = await MongoChatItem.create({
      chatId,
      userId: user.userId,
      teamId: user.teamId,
      tmbId: user.tmbId,
      appId: app._id,
      obj: 'AI',
      value: [{ type: 'text', text: { content: '好回答' } }],
      userGoodFeedback: '这个回答很好',
      time: new Date()
    });

    // 创建聊天项 - 带差评反馈
    const badFeedbackItem = await MongoChatItem.create({
      chatId,
      userId: user.userId,
      teamId: user.teamId,
      tmbId: user.tmbId,
      appId: app._id,
      obj: 'AI',
      value: [{ type: 'text', text: { content: '差回答' } }],
      userBadFeedback: '不够详细',
      time: new Date()
    });

    // 执行导出 - 使用 StreamCall 处理流式 CSV 响应
    const dateStart = addDays(new Date(), -1);
    const dateEnd = addDays(new Date(), 1);

    const result: any = await StreamCall<ExportChatLogsBody, {}, {}>(exportChatLogsApi.default, {
      auth: user,
      body: {
        appId: String(app._id),
        dateStart,
        dateEnd,
        title: '对话日志',
        sourcesMap: {
          [ChatSourceEnum.online]: { label: '在线对话' }
        },
        logKeys: [AppLogKeysEnum.SESSION_ID, AppLogKeysEnum.FEEDBACK]
      }
    });

    // 验证导出成功
    expect(result.error).toBeUndefined();
    expect(result.code).toBe(200);

    // 验证 CSV 数据
    const csvData = result.raw as string;
    expect(csvData).toBeDefined();
    expect(csvData.length).toBeGreaterThan(0);

    // 验证响应头包含正确的 Content-Type 和 Content-Disposition
    expect(result.headers?.['Content-Type']).toContain('text/csv');
    expect(result.headers?.['Content-Disposition']).toContain('attachment');

    // 核心验证:检查反馈数据中是否包含 chatItemId
    // 好评反馈应该包含 chatItemId 和反馈内容
    expect(csvData).toContain(String(goodFeedbackItem._id));
    expect(csvData).toContain('这个回答很好');

    // 差评反馈应该包含 chatItemId 和反馈内容
    expect(csvData).toContain(String(badFeedbackItem._id));
    expect(csvData).toContain('不够详细');

    // 验证反馈数据格式正确 (考虑 CSV 转义，引号会被转义为多个引号)
    expect(csvData).toMatch(/good.*chatItemId/);
    expect(csvData).toMatch(/bad.*chatItemId/);
  });
});
