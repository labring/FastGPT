import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authChatTargetCrud: vi.fn(),
  authApp: vi.fn(),
  getTeamPlanStatus: vi.fn(),
  authFrequencyLimit: vi.fn(),
  createUploadChatFileURL: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatTargetCrud: mocks.authChatTargetCrud
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authApp
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

import handler from '@/pages/api/core/chat/file/presignDraftChatFilePostUrl';

const appId = '507f1f77bcf86cd799439011';
const chatId = 'chat-id';
const presignHandler = handler as unknown as (req: ApiRequestProps) => Promise<unknown>;

const callHandler = (body: Record<string, unknown>) =>
  presignHandler({
    body
  } as ApiRequestProps);

describe('presignDraftChatFilePostUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authChatTargetCrud.mockResolvedValue({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      teamId: 'team-id',
      uid: 'user-id'
    });
    mocks.authApp.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'user-id'
    });
    mocks.getTeamPlanStatus.mockResolvedValue({
      standard: {
        maxUploadFileCount: 20,
        maxUploadFileSize: 15
      }
    });
    mocks.createUploadChatFileURL.mockResolvedValue({
      url: 'https://example.com/upload-token',
      key: 'chat/app/user/chat/tool.exe',
      headers: {
        'content-type': 'application/octet-stream'
      },
      maxSize: 15 * 1024 * 1024
    });
  });

  it('allows an App editor to use an unsaved custom extension config', async () => {
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
    ).resolves.toMatchObject({
      url: 'https://example.com/upload-token'
    });

    expect(mocks.authApp).toHaveBeenCalledWith(
      expect.objectContaining({
        appId,
        authToken: true,
        authApiKey: true,
        per: WritePermissionVal
      })
    );
    expect(mocks.createUploadChatFileURL).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        allowedExtensions: ['.exe'],
        extensionRules: [
          {
            extension: '.exe',
            source: 'custom',
            verification: 'opaque'
          }
        ]
      })
    );
  });

  it('rejects a read-only App caller before signing the upload URL', async () => {
    mocks.authApp.mockRejectedValueOnce(new Error('forbidden'));

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
    ).rejects.toThrow('forbidden');

    expect(mocks.createUploadChatFileURL).not.toHaveBeenCalled();
  });

  it('requires Skill write permission for Skill Edit uploads', async () => {
    const skillId = '507f1f77bcf86cd799439012';
    mocks.authChatTargetCrud.mockResolvedValueOnce({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      teamId: 'team-id',
      uid: 'user-id'
    });

    await expect(
      callHandler({
        filename: 'notes.txt',
        skillId,
        chatId,
        fileSelectConfig: {
          canSelectFile: true
        }
      })
    ).resolves.toMatchObject({
      url: 'https://example.com/upload-token'
    });

    expect(mocks.authChatTargetCrud).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        per: WritePermissionVal
      })
    );
    expect(mocks.authApp).not.toHaveBeenCalled();
  });

  it('rejects ChatAgentHelper targets from the draft endpoint', async () => {
    await expect(
      callHandler({
        filename: 'notes.txt',
        appId,
        sourceType: ChatSourceTypeEnum.chatAgentHelper,
        chatId,
        fileSelectConfig: {
          canSelectFile: true
        }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);

    expect(mocks.authChatTargetCrud).not.toHaveBeenCalled();
    expect(mocks.createUploadChatFileURL).not.toHaveBeenCalled();
  });

  it('rejects draft uploads when no file type is enabled', async () => {
    await expect(
      callHandler({
        filename: 'notes.txt',
        appId,
        chatId,
        fileSelectConfig: {}
      })
    ).rejects.toBe(S3ErrEnum.fileUploadDisabled);

    expect(mocks.createUploadChatFileURL).not.toHaveBeenCalled();
  });

  it('does not accept an external-link-only target', async () => {
    await expect(
      callHandler({
        filename: 'notes.txt',
        chatId,
        fileSelectConfig: {
          canSelectFile: true
        },
        outLinkAuthData: {
          shareId: 'share-id',
          outLinkUid: 'share-user-id'
        }
      })
    ).rejects.toBeDefined();

    expect(mocks.authChatTargetCrud).not.toHaveBeenCalled();
  });
});
