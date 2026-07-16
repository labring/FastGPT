import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authChatTargetCrud: vi.fn(),
  getTeamPlanStatus: vi.fn(),
  authFrequencyLimit: vi.fn(),
  createUploadChatFileURL: vi.fn(),
  findAppById: vi.fn(),
  chatSettingExists: vi.fn(),
  getAppLatestVersion: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatTargetCrud: mocks.authChatTargetCrud
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

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: mocks.findAppById
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion
}));

vi.mock('@fastgpt/service/core/chat/setting/schema', () => ({
  MongoChatSetting: {
    exists: mocks.chatSettingExists
  }
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

    mocks.authChatTargetCrud.mockResolvedValue({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
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
    mocks.findAppById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: appId,
        chatConfig: {}
      })
    });
    mocks.getAppLatestVersion.mockResolvedValue({
      chatConfig: {
        fileSelectConfig: {
          canSelectImg: true
        }
      }
    });
    mocks.chatSettingExists.mockResolvedValue(false);
  });

  it('ignores forged request config and uses the published app config', async () => {
    await expect(
      callHandler({
        filename,
        contentType: 'image/png',
        size: 1234,
        appId,
        chatId,
        fileSelectConfig: {
          canSelectCustomFileExtension: true,
          customFileExtensionList: ['.exe']
        }
      })
    ).resolves.toMatchObject({
      url: 'https://example.com/upload-token'
    });

    expect(mocks.findAppById).toHaveBeenCalledWith(appId);
    expect(mocks.getAppLatestVersion).toHaveBeenCalledWith(
      appId,
      expect.objectContaining({ _id: appId })
    );
    expect(mocks.createUploadChatFileURL).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        chatId,
        filename,
        contentType: 'image/png',
        size: 1234,
        uId: 'user-id',
        allowedExtensions: expect.arrayContaining([
          '.jpg',
          '.jpeg',
          '.png',
          '.gif',
          '.bmp',
          '.webp'
        ]),
        extensionRules: expect.arrayContaining([
          expect.objectContaining({
            extension: '.png',
            source: 'builtin',
            verification: 'content'
          })
        ])
      })
    );
  });

  it('passes declared hints and opaque custom extension rules', async () => {
    mocks.getAppLatestVersion.mockResolvedValueOnce({
      chatConfig: {
        fileSelectConfig: {
          canSelectCustomFileExtension: true,
          customFileExtensionList: ['DAT']
        }
      }
    });

    await expect(
      callHandler({
        filename: 'download',
        declaredExtension: '.dat',
        declaredFilename: 'download.dat',
        appId,
        chatId
      })
    ).resolves.toMatchObject({
      url: 'https://example.com/upload-token'
    });

    expect(mocks.createUploadChatFileURL).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'download',
        declaredExtension: '.dat',
        declaredFilename: 'download.dat',
        allowedExtensions: ['.dat'],
        extensionRules: [
          {
            extension: '.dat',
            source: 'custom',
            verification: 'opaque'
          }
        ]
      })
    );
  });

  it('uses the server-owned Home Chat upload policy for hidden apps', async () => {
    mocks.chatSettingExists.mockResolvedValueOnce(true);
    mocks.findAppById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        _id: appId,
        type: AppTypeEnum.hidden
      })
    });

    await expect(
      callHandler({
        filename: 'image.png',
        contentType: 'image/png',
        appId,
        chatId,
        fileSelectConfig: {
          canSelectCustomFileExtension: true,
          customFileExtensionList: ['.exe']
        }
      })
    ).resolves.toMatchObject({
      url: 'https://example.com/upload-token'
    });

    expect(mocks.chatSettingExists).toHaveBeenCalledWith({
      teamId: 'team-id',
      appId
    });
    expect(mocks.getAppLatestVersion).not.toHaveBeenCalled();
    expect(mocks.createUploadChatFileURL).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedExtensions: expect.arrayContaining(['.txt', '.pdf', '.png']),
        extensionRules: expect.not.arrayContaining([expect.objectContaining({ extension: '.exe' })])
      })
    );
  });

  it('passes zero-size file hints because size is not a policy limit', async () => {
    mocks.getAppLatestVersion.mockResolvedValueOnce({
      chatConfig: {
        fileSelectConfig: {
          canSelectFile: true
        }
      }
    });

    await expect(
      callHandler({
        filename: 'empty.txt',
        contentType: 'text/plain',
        size: 0,
        appId,
        chatId
      })
    ).resolves.toMatchObject({
      url: 'https://example.com/upload-token'
    });

    expect(mocks.createUploadChatFileURL).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'empty.txt',
        contentType: 'text/plain',
        size: 0
      })
    );
  });

  it('rejects Skill Edit uploads from the runtime endpoint', async () => {
    const skillId = '507f1f77bcf86cd799439012';
    mocks.authChatTargetCrud.mockResolvedValueOnce({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      teamId: 'team-id',
      uid: 'skill-user-id'
    });

    await expect(
      callHandler({
        filename,
        skillId,
        chatId
      })
    ).rejects.toBe(S3ErrEnum.fileUploadDisabled);

    expect(mocks.authChatTargetCrud).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatId,
        authToken: true,
        authApiKey: true
      })
    );
    expect(mocks.findAppById).not.toHaveBeenCalled();
    expect(mocks.createUploadChatFileURL).not.toHaveBeenCalled();
  });

  it('uses the server-owned ChatAgentHelper upload config', async () => {
    mocks.authChatTargetCrud.mockResolvedValueOnce({
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      sourceId: appId,
      teamId: 'team-id',
      uid: 'helper-user-id'
    });

    await expect(
      callHandler({
        filename,
        appId,
        sourceType: ChatSourceTypeEnum.chatAgentHelper,
        chatId
      })
    ).resolves.toMatchObject({
      url: 'https://example.com/upload-token'
    });

    expect(mocks.findAppById).not.toHaveBeenCalled();
    expect(mocks.createUploadChatFileURL).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.chatAgentHelper,
        sourceId: appId,
        uId: 'helper-user-id',
        allowedExtensions: expect.arrayContaining(['.txt', '.png', '.mp4', '.mp3'])
      })
    );
  });

  it('uses resolved app source for shared chat upload', async () => {
    const resolvedAppId = '507f1f77bcf86cd799439099';
    mocks.authChatTargetCrud.mockResolvedValueOnce({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: resolvedAppId,
      teamId: 'team-id',
      uid: 'share-user-id'
    });

    await expect(
      callHandler({
        filename,
        chatId,
        outLinkAuthData: {
          shareId: 'share-id',
          outLinkUid: 'share-user-id'
        }
      })
    ).resolves.toMatchObject({
      url: 'https://example.com/upload-token'
    });

    expect(mocks.authChatTargetCrud).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: undefined,
        outLinkAuthData: {
          shareId: 'share-id',
          outLinkUid: 'share-user-id'
        },
        chatId,
        authToken: true,
        authApiKey: true
      })
    );
    expect(mocks.createUploadChatFileURL).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: resolvedAppId,
        chatId,
        filename,
        uId: 'share-user-id'
      })
    );
  });

  it('rejects upload when published config disables files even if request config enables exe', async () => {
    mocks.getAppLatestVersion.mockResolvedValueOnce({
      chatConfig: {
        fileSelectConfig: {}
      }
    });

    await expect(
      callHandler({
        filename: 'tool.exe',
        appId,
        chatId,
        fileSelectConfig: {
          canSelectCustomFileExtension: true,
          customFileExtensionList: ['.exe']
        }
      })
    ).rejects.toBe(S3ErrEnum.fileUploadDisabled);

    expect(mocks.createUploadChatFileURL).not.toHaveBeenCalled();
  });
});
