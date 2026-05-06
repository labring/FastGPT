import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authChatCrud: vi.fn(),
  getTeamPlanStatus: vi.fn(),
  authFrequencyLimit: vi.fn(),
  createUploadChatFileURL: vi.fn(),
  findAppById: vi.fn(),
  chatSettingExists: vi.fn(),
  authApp: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatCrud: mocks.authChatCrud
}));

vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  getTeamPlanStatus: mocks.getTeamPlanStatus
}));

vi.mock('@fastgpt/service/common/system/frequencyLimit/utils', () => ({
  authFrequencyLimit: mocks.authFrequencyLimit
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    createUploadChatFileURL: mocks.createUploadChatFileURL
  })
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    SKIP_FILE_TYPE_CHECK: false
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: mocks.findAppById
  }
}));

vi.mock('@fastgpt/service/core/chat/setting/schema', () => ({
  MongoChatSetting: {
    exists: mocks.chatSettingExists
  }
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authApp
}));

import handler from '@/pages/api/core/chat/file/presignChatFilePostUrl';

const appId = '507f1f77bcf86cd799439011';
const chatId = 'chat-id';
const filename = 'demo.png';
const presignHandler = handler as unknown as (req: ApiRequestProps) => Promise<unknown>;

const callHandler = (body: Record<string, unknown>) =>
  presignHandler({
    body
  } as ApiRequestProps);

describe('presignChatFilePostUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authChatCrud.mockResolvedValue({
      teamId: 'team-id',
      uid: 'user-id'
    });
    mocks.getTeamPlanStatus.mockResolvedValue({
      standard: {
        maxUploadFileCount: 20,
        maxUploadFileSize: 15
      }
    });
    mocks.createUploadChatFileURL.mockResolvedValue({
      url: 'https://example.com/upload-token',
      key: 'chat/app/user/chat/demo.png',
      headers: {
        'content-type': 'image/png'
      },
      maxSize: 15 * 1024 * 1024
    });
  });

  it('uses request fileSelectConfig as upload constraints without reading app chatConfig', async () => {
    await expect(
      callHandler({
        filename,
        appId,
        chatId,
        fileSelectConfig: {
          canSelectImg: true
        }
      })
    ).resolves.toMatchObject({
      url: 'https://example.com/upload-token'
    });

    expect(mocks.findAppById).not.toHaveBeenCalled();
    expect(mocks.chatSettingExists).not.toHaveBeenCalled();
    expect(mocks.authApp).not.toHaveBeenCalled();
    expect(mocks.createUploadChatFileURL).toHaveBeenCalledWith(
      expect.objectContaining({
        appId,
        chatId,
        filename,
        uId: 'user-id',
        allowedExtensions: expect.arrayContaining([
          '.jpg',
          '.jpeg',
          '.png',
          '.gif',
          '.bmp',
          '.webp'
        ])
      })
    );
  });

  it('rejects upload when fileSelectConfig does not enable any file type', async () => {
    await expect(
      callHandler({
        filename,
        appId,
        chatId,
        fileSelectConfig: {}
      })
    ).rejects.toBe(S3ErrEnum.fileUploadDisabled);

    expect(mocks.createUploadChatFileURL).not.toHaveBeenCalled();
  });
});
