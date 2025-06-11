import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/core/app/del';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { findAppAndAllChildren } from '@fastgpt/service/core/app/controller';
import { deleteChatFiles } from '@fastgpt/service/core/chat/controller';
import { removeImageByPath } from '@fastgpt/service/common/file/image/controller';
import { addOperationLog } from '@fastgpt/service/support/operationLog/addOperationLog';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

vi.mock('@fastgpt/service/support/permission/app/auth');
vi.mock('@fastgpt/service/core/app/controller');
vi.mock('@fastgpt/service/core/chat/controller');
vi.mock('@fastgpt/service/common/file/image/controller');
vi.mock('@fastgpt/service/support/operationLog/addOperationLog');
vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn((callback) => callback({ session: {} }))
}));

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    deleteMany: vi.fn()
  }
}));
vi.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: {
    deleteMany: vi.fn()
  }
}));
vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: {
    deleteMany: vi.fn().mockReturnValue({ session: vi.fn() })
  }
}));
vi.mock('@fastgpt/service/support/openapi/schema', () => ({
  MongoOpenApi: {
    deleteMany: vi.fn().mockReturnValue({ session: vi.fn() })
  }
}));
vi.mock('@fastgpt/service/core/app/version/schema', () => ({
  MongoAppVersion: {
    deleteMany: vi.fn().mockReturnValue({ session: vi.fn() })
  }
}));
vi.mock('@fastgpt/service/core/chat/inputGuide/schema', () => ({
  MongoChatInputGuide: {
    deleteMany: vi.fn().mockReturnValue({ session: vi.fn() })
  }
}));
vi.mock('@fastgpt/service/support/permission/schema', () => ({
  MongoResourcePermission: {
    deleteMany: vi.fn().mockReturnValue({ session: vi.fn() })
  }
}));
vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    deleteOne: vi.fn()
  }
}));

describe('api/core/app/del', () => {
  const mockApp = {
    _id: 'app-123',
    name: 'Test App',
    type: 'test',
    avatar: 'avatar.png'
  };

  const mockReq = {
    query: {
      appId: mockApp._id
    }
  };

  const mockRes = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete app successfully', async () => {
    vi.mocked(authApp).mockResolvedValue({
      teamId: 'team-123',
      tmbId: 'tmb-123',
      userId: 'user-123',
      app: mockApp
    });

    vi.mocked(findAppAndAllChildren).mockResolvedValue([mockApp]);

    await handler(mockReq as any, mockRes as any);

    expect(deleteChatFiles).toHaveBeenCalledWith({ appId: mockApp._id });
    expect(MongoChat.deleteMany).toHaveBeenCalled();
    expect(MongoChatItem.deleteMany).toHaveBeenCalled();
    expect(MongoOutLink.deleteMany).toHaveBeenCalled();
    expect(MongoOpenApi.deleteMany).toHaveBeenCalled();
    expect(MongoAppVersion.deleteMany).toHaveBeenCalled();
    expect(MongoChatInputGuide.deleteMany).toHaveBeenCalled();
    expect(MongoResourcePermission.deleteMany).toHaveBeenCalled();
    expect(MongoApp.deleteOne).toHaveBeenCalled();
    expect(removeImageByPath).toHaveBeenCalledWith(mockApp.avatar, expect.any(Object));
    expect(addOperationLog).toHaveBeenCalled();
  });

  it('should throw error if appId is missing', async () => {
    const reqWithoutAppId = {
      query: {}
    };

    await expect(handler(reqWithoutAppId as any, mockRes as any)).rejects.toThrow('参数错误');
  });

  it('should handle authentication error', async () => {
    vi.mocked(authApp).mockRejectedValue(new Error('Auth failed'));

    await expect(handler(mockReq as any, mockRes as any)).rejects.toThrow('Auth failed');
  });

  it('should handle deletion error', async () => {
    vi.mocked(authApp).mockResolvedValue({
      teamId: 'team-123',
      tmbId: 'tmb-123',
      userId: 'user-123',
      app: mockApp
    });

    vi.mocked(findAppAndAllChildren).mockRejectedValue(new Error('Delete failed'));

    await expect(handler(mockReq as any, mockRes as any)).rejects.toThrow('Delete failed');
  });

  it('should handle deletion with existing session', async () => {
    const mockSession = { id: 'test-session' };
    vi.mocked(findAppAndAllChildren).mockResolvedValue([mockApp]);

    await handler(mockReq as any, mockRes as any);

    expect(mongoSessionRun).toHaveBeenCalled();
  });
});
