import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import type { AppDeleteJobData } from '@fastgpt/service/core/app/delete';
import { addAppDeleteJob } from '@fastgpt/service/core/app/delete';
import { appDeleteProcessor } from '@fastgpt/service/core/app/delete/processor';
import handler from '@/pages/api/core/app/del';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { MongoChatFavouriteApp } from '@fastgpt/service/core/chat/favouriteApp/schema';
import { MongoChatSetting } from '@fastgpt/service/core/chat/setting/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoAppLogKeys } from '@fastgpt/service/core/app/logs/logkeysSchema';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

// Mock dependencies for queue functionality
vi.mock('@fastgpt/service/common/bullmq', () => ({
  getQueue: vi.fn(),
  getWorker: vi.fn(),
  QueueNames: {
    appDelete: 'app-delete'
  }
}));

// Mock S3 and image removal functions
vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    deleteChatFilesByPrefix: vi.fn().mockResolvedValue(undefined)
  })
}));

vi.mock('@fastgpt/service/common/file/image/controller', () => ({
  removeImageByPath: vi.fn().mockResolvedValue(undefined)
}));

// Import mocked modules for type access
import { getQueue, getWorker, QueueNames } from '@fastgpt/service/common/bullmq';

const mockGetQueue = vi.mocked(getQueue);
const mockGetWorker = vi.mocked(getWorker);

describe('App Delete Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addAppDeleteJob', () => {
    it('should add job to queue with correct parameters', async () => {
      const mockQueue = {
        add: vi.fn().mockResolvedValue({ id: 'job-123' })
      };
      mockGetQueue.mockReturnValue(mockQueue as any);

      const jobData: AppDeleteJobData = {
        teamId: 'team-123',
        appId: 'app-123'
      };

      const result = await addAppDeleteJob(jobData);

      expect(mockGetQueue).toHaveBeenCalledWith(QueueNames.appDelete, {
        defaultJobOptions: {
          attempts: 10,
          backoff: {
            type: 'exponential',
            delay: 5000
          },
          removeOnComplete: true,
          removeOnFail: { age: 30 * 24 * 60 * 60 }
        }
      });

      expect(mockQueue.add).toHaveBeenCalledWith('delete_app', jobData, {
        jobId: 'team-123:app-123',
        delay: 1000
      });

      expect(result).toEqual({ id: 'job-123' });
    });

    it('should use correct jobId format for preventing duplicates', async () => {
      const mockQueue = {
        add: vi.fn().mockResolvedValue({ id: 'job-456' })
      };
      mockGetQueue.mockReturnValue(mockQueue as any);

      const jobData: AppDeleteJobData = {
        teamId: 'team-xyz',
        appId: 'app-abc'
      };

      await addAppDeleteJob(jobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'delete_app',
        jobData,
        expect.objectContaining({
          jobId: 'team-xyz:app-abc'
        })
      );
    });
  });
});

describe('App Delete API Integration', () => {
  let rootUser: any;

  beforeEach(async () => {
    // Get root user for testing
    rootUser = await getRootUser();
  });

  it('should successfully delete an app and mark it for deletion', async () => {
    // Create a test app first
    const testApp = await MongoApp.create({
      name: 'Test App for Deletion',
      teamId: rootUser.teamId,
      tmbId: rootUser.tmbId,
      type: AppTypeEnum.simple,
      modules: []
    });

    // Mock the queue to avoid actual background deletion
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-123' })
    };
    mockGetQueue.mockReturnValue(mockQueue as any);

    // Call the delete API
    const result = await Call(handler, {
      auth: rootUser,
      query: { appId: String(testApp._id) }
    });

    expect(result.code).toBe(200);
    expect(Array.isArray(result.data)).toBe(true);

    // Verify the app is marked for deletion
    const deletedApp = await MongoApp.findOne({ _id: testApp._id });
    expect(deletedApp?.deleteTime).not.toBeNull();

    // Verify queue job was added
    expect(mockQueue.add).toHaveBeenCalledWith(
      'delete_app',
      {
        teamId: rootUser.teamId,
        appId: String(testApp._id)
      },
      {
        jobId: `${rootUser.teamId}:${testApp._id}`,
        delay: 1000
      }
    );

    // Cleanup
    await MongoApp.deleteOne({ _id: testApp._id });
  });

  it('should handle folder deletion correctly', async () => {
    // Create a folder
    const testFolder = await MongoApp.create({
      name: 'Test Folder',
      teamId: rootUser.teamId,
      tmbId: rootUser.tmbId,
      type: AppTypeEnum.folder,
      parentId: null
    });

    // Create a child app in the folder
    const childApp = await MongoApp.create({
      name: 'Child App',
      teamId: rootUser.teamId,
      tmbId: rootUser.tmbId,
      type: AppTypeEnum.simple,
      parentId: testFolder._id,
      modules: []
    });

    // Mock the queue
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-folder' })
    };
    mockGetQueue.mockReturnValue(mockQueue as any);

    // Call the delete API
    const result = await Call(handler, {
      auth: rootUser,
      query: { appId: String(testFolder._id) }
    });

    expect(result.code).toBe(200);
    expect(Array.isArray(result.data)).toBe(true);

    // Folders should not be included in the response
    const deletedAppIds = result.data as string[];
    expect(deletedAppIds).not.toContain(String(testFolder._id));
    expect(deletedAppIds).toContain(String(childApp._id));

    // Cleanup
    await mongoSessionRun(async (session) => {
      await MongoApp.deleteOne({ _id: testFolder._id }, { session });
      await MongoApp.deleteOne({ _id: childApp._id }, { session });
    });
  });

  it('should handle non-existent app gracefully', async () => {
    const nonExistentId = '507f1f77bcf86cd799439011';

    const result = await Call(handler, {
      auth: rootUser,
      query: { appId: nonExistentId }
    });

    expect(result.code).toBe(500);
    expect(result.error).toBe('appUnExist');
  });
});

describe('App Delete Data Cleanup Verification', () => {
  let rootUser: any;
  let testApp: any;
  let teamId: string;
  let appId: string;

  beforeEach(async () => {
    rootUser = await getRootUser();
    teamId = rootUser.teamId;

    // 创建测试应用
    testApp = await MongoApp.create({
      name: 'Test App for Full Deletion',
      teamId: teamId,
      tmbId: rootUser.tmbId,
      type: AppTypeEnum.simple,
      modules: [
        {
          flowPosition: { x: 100, y: 100 },
          inputs: [],
          outputs: [],
          avatar: '/test/avatar.png',
          name: 'Test Module',
          intro: 'Test module intro',
          flowType: FlowNodeTypeEnum.chatNode,
          version: '1.0'
        }
      ],
      avatar: '/test/app-avatar.png'
    });
    appId = String(testApp._id);

    // 创建相关测试数据
    await createAllRelatedTestData(appId, teamId);
  });

  afterEach(async () => {
    // 清理测试数据，确保测试环境干净
    await cleanupTestData(appId, teamId);
  });

  describe('Complete Data Deletion Verification', () => {
    it('should delete ALL related data when app deletion queue job is processed', async () => {
      // 1. 验证测试数据创建成功
      await verifyTestDataExists(appId, teamId);

      // 2. 标记应用为删除状态（模拟 API 调用后的状态）
      await MongoApp.updateOne({ _id: appId }, { deleteTime: new Date() });

      // 3. 执行删除处理器（模拟队列任务执行）
      const mockJob = {
        data: { teamId, appId },
        id: 'test-job-id'
      };

      await appDeleteProcessor(mockJob);

      // 4. 验证所有相关数据都被删除
      await verifyAllDataDeleted(appId, teamId);

      // 5. 验证应用本身被删除
      const deletedApp = await MongoApp.findOne({ _id: appId });
      expect(deletedApp).toBeNull();
    });

    it('should handle deletion of nested apps and their data', async () => {
      // 创建父子应用结构
      const parentApp = await MongoApp.create({
        name: 'Parent App',
        teamId: teamId,
        tmbId: rootUser.tmbId,
        type: AppTypeEnum.simple,
        modules: []
      });

      const childApp = await MongoApp.create({
        name: 'Child App',
        teamId: teamId,
        tmbId: rootUser.tmbId,
        type: AppTypeEnum.simple,
        parentId: parentApp._id,
        modules: []
      });

      // 为子应用创建相关数据
      await createAllRelatedTestData(String(childApp._id), teamId);

      // 标记父应用为删除状态
      await MongoApp.updateOne({ _id: parentApp._id }, { deleteTime: new Date() });

      // 执行删除（应该级联删除子应用）
      const mockJob = {
        data: { teamId, appId: String(parentApp._id) },
        id: 'test-nested-job'
      };

      await appDeleteProcessor(mockJob);

      // 验证父应用和子应用都被删除
      expect(await MongoApp.countDocuments({ _id: parentApp._id })).toBe(0);
      expect(await MongoApp.countDocuments({ _id: childApp._id })).toBe(0);

      // 验证子应用的相关数据也被删除
      await verifyAllDataDeleted(String(childApp._id), teamId);

      // 清理
      await MongoApp.deleteMany({
        _id: { $in: [parentApp._id, childApp._id] },
        teamId
      });
    });

    it('should handle batch deletion of multiple apps', async () => {
      // 创建多个应用
      const app2 = await MongoApp.create({
        name: 'Test App 2',
        teamId: teamId,
        tmbId: rootUser.tmbId,
        type: AppTypeEnum.simple,
        modules: []
      });

      const app2Id = String(app2._id);
      await createAllRelatedTestData(app2Id, teamId);

      // 标记两个应用为删除状态
      await MongoApp.updateMany({ _id: { $in: [appId, app2Id] } }, { deleteTime: new Date() });

      // 删除第一个应用
      const mockJob1 = {
        data: { teamId, appId },
        id: 'test-batch-job-1'
      };

      await appDeleteProcessor(mockJob1);

      // 验证第一个应用的数据被删除
      await verifyAllDataDeleted(appId, teamId);
      expect(await MongoApp.countDocuments({ _id: appId })).toBe(0);

      // 第二个应用的数据应该仍然存在
      await verifyTestDataExists(app2Id, teamId);

      // 清理
      await cleanupTestData(app2Id, teamId);
      await MongoApp.deleteOne({ _id: app2Id });
    });
  });

  // 辅助函数：创建所有相关测试数据
  async function createAllRelatedTestData(appId: string, teamId: string) {
    const timestamp = Date.now();

    // 1. 创建聊天记录
    await MongoChat.create({
      appId: appId,
      teamId: teamId,
      tmbId: rootUser.tmbId,
      chatId: `test-chat-${timestamp}`,
      title: 'Test Chat',
      source: ChatSourceEnum.test,
      customTitle: false,
      variables: [],
      status: 'finish'
    });

    // 2. 创建聊天项
    await MongoChatItem.create({
      appId: appId,
      teamId: teamId,
      tmbId: rootUser.tmbId,
      chatId: `test-chat-${timestamp}`,
      time: timestamp,
      obj: 'Human',
      value: 'Hello, this is a test message',
      userBadFeedback: null,
      adminBadFeedback: null
    });

    // 3. 创建聊天项响应
    await MongoChatItemResponse.create({
      appId: appId,
      teamId: teamId,
      tmbId: rootUser.tmbId,
      chatItemId: `test-chat-item-${timestamp}`,
      time: timestamp,
      text: 'This is a test response',
      q: 'Test question',
      a: 'Test answer',
      responseData: []
    });

    // 4. 创建分享链接
    await MongoOutLink.create({
      appId: appId,
      teamId: teamId,
      tmbId: rootUser.tmbId,
      name: 'Test Share Link',
      shareId: `test_share_${timestamp}`,
      type: 'share',
      limit: 100,
      immediateReturn: false
    });

    // 5. 创建 OpenAPI 配置
    await MongoOpenApi.create({
      appId: appId,
      teamId: teamId,
      tmbId: rootUser.tmbId,
      apiKey: `test_api_${timestamp}`,
      limit: 1000
    });

    // 6. 创建应用版本
    await MongoAppVersion.create({
      appId: appId,
      teamId: teamId,
      tmbId: rootUser.tmbId,
      version: '1.0.0',
      nodes: [],
      edges: []
    });

    // 7. 创建聊天输入引导
    await MongoChatInputGuide.create({
      appId: appId,
      text: 'Test input guide',
      userKey: 'test_user',
      createTime: timestamp
    });

    // 8. 创建精选应用记录
    await MongoChatFavouriteApp.create({
      teamId: teamId,
      tmbId: rootUser.tmbId,
      appId: appId,
      name: 'Test Favourite App'
    });

    // 9. 创建快捷应用设置（包含此应用）
    await MongoChatSetting.findOneAndUpdate(
      { teamId: teamId },
      {
        teamId: teamId,
        tmbId: rootUser.tmbId,
        quickAppIds: [appId]
      },
      { upsert: true }
    );

    // 10. 创建权限记录
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: teamId,
      tmbId: rootUser.tmbId,
      resourceId: appId,
      permission: 100 // 100 = write permission
    });

    // 11. 创建日志密钥
    await MongoAppLogKeys.create({
      appId: appId,
      teamId: teamId,
      key: `test_key_${timestamp}`,
      createTime: timestamp
    });
  }

  // 辅助函数：验证测试数据存在
  async function verifyTestDataExists(appId: string, teamId: string) {
    expect(await MongoChat.countDocuments({ appId })).toBeGreaterThan(0);
    expect(await MongoChatItem.countDocuments({ appId })).toBeGreaterThan(0);
    expect(await MongoChatItemResponse.countDocuments({ appId })).toBeGreaterThan(0);
    expect(await MongoOutLink.countDocuments({ appId })).toBeGreaterThan(0);
    expect(await MongoOpenApi.countDocuments({ appId })).toBeGreaterThan(0);
    expect(await MongoAppVersion.countDocuments({ appId })).toBeGreaterThan(0);
    expect(await MongoChatInputGuide.countDocuments({ appId })).toBeGreaterThan(0);
    expect(await MongoChatFavouriteApp.countDocuments({ teamId, appId })).toBeGreaterThan(0);

    const chatSettings = await MongoChatSetting.findOne({ teamId });
    expect(chatSettings?.quickAppIds).toContain(appId);

    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: PerResourceTypeEnum.app,
        teamId,
        resourceId: appId
      })
    ).toBeGreaterThan(0);

    expect(await MongoAppLogKeys.countDocuments({ appId })).toBeGreaterThan(0);
  }

  // 辅助函数：验证所有数据被删除
  async function verifyAllDataDeleted(appId: string, teamId: string) {
    // 验证聊天相关数据被删除
    expect(await MongoChat.countDocuments({ appId })).toBe(0);
    expect(await MongoChatItem.countDocuments({ appId })).toBe(0);
    expect(await MongoChatItemResponse.countDocuments({ appId })).toBe(0);

    // 验证应用配置数据被删除
    expect(await MongoOutLink.countDocuments({ appId })).toBe(0);
    expect(await MongoOpenApi.countDocuments({ appId })).toBe(0);
    expect(await MongoAppVersion.countDocuments({ appId })).toBe(0);
    expect(await MongoChatInputGuide.countDocuments({ appId })).toBe(0);

    // 验证用户相关数据被删除
    expect(await MongoChatFavouriteApp.countDocuments({ teamId, appId })).toBe(0);

    // 验证快捷应用设置被更新
    const chatSettings = await MongoChatSetting.findOne({ teamId });
    expect(chatSettings?.quickAppIds).not.toContain(appId);

    // 验证权限数据被删除
    expect(
      await MongoResourcePermission.countDocuments({
        resourceType: PerResourceTypeEnum.app,
        teamId,
        resourceId: appId
      })
    ).toBe(0);

    // 验证日志密钥被删除
    expect(await MongoAppLogKeys.countDocuments({ appId })).toBe(0);
  }

  // 辅助函数：清理测试数据
  async function cleanupTestData(appId: string, teamId: string) {
    await mongoSessionRun(async (session) => {
      await MongoChat.deleteMany({ appId }, { session });
      await MongoChatItem.deleteMany({ appId }, { session });
      await MongoChatItemResponse.deleteMany({ appId }, { session });
      await MongoOutLink.deleteMany({ appId }, { session });
      await MongoOpenApi.deleteMany({ appId }, { session });
      await MongoAppVersion.deleteMany({ appId }, { session });
      await MongoChatInputGuide.deleteMany({ appId }, { session });
      await MongoChatFavouriteApp.deleteMany({ teamId, appId }, { session });
      await MongoResourcePermission.deleteMany(
        {
          resourceType: PerResourceTypeEnum.app,
          teamId,
          resourceId: appId
        },
        { session }
      );
      await MongoAppLogKeys.deleteMany({ appId }, { session });
      await MongoChatSetting.deleteMany({ teamId }, { session });
    });
  }
});
