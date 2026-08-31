import { describe, expect, it, vi } from 'vitest';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { ChatFileTypeEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { resolveAuthorizedChatFiles } from '@fastgpt/service/core/chat/fileContext';

describe('resolveAuthorizedChatFiles', () => {
  const scope = {
    sourceType: ChatSourceTypeEnum.workflowBuilder,
    sourceId: 'app-1',
    uid: 'member-1',
    chatId: 'chat-1'
  };
  const key = 'chat/workflowBuilder/app-1/member-1/chat-1/requirements.md';

  it('validates the S3 key scope and replaces the client URL with a trusted preview URL', async () => {
    const getPreviewUrl = vi.fn(async () => 'https://trusted.test/requirements.md');

    await expect(
      resolveAuthorizedChatFiles({
        files: [
          {
            type: ChatFileTypeEnum.file,
            name: 'requirements.md',
            key,
            url: 'https://untrusted.test/requirements.md'
          }
        ],
        ...scope,
        getPreviewUrl
      })
    ).resolves.toEqual([
      {
        type: ChatFileTypeEnum.file,
        name: 'requirements.md',
        key,
        url: 'https://trusted.test/requirements.md'
      }
    ]);
    expect(getPreviewUrl).toHaveBeenCalledWith(key);
  });

  it.each([
    ['missing key', undefined, scope],
    ['wrong source', key, { ...scope, sourceType: ChatSourceTypeEnum.chatAgentHelper }],
    ['wrong source id', key, { ...scope, sourceId: 'app-2' }],
    ['wrong member', key, { ...scope, uid: 'member-2' }],
    ['wrong chat', key, { ...scope, chatId: 'chat-2' }]
  ])('rejects %s before signing the file URL', async (_name, fileKey, invalidScope) => {
    const getPreviewUrl = vi.fn();

    await expect(
      resolveAuthorizedChatFiles({
        files: [{ key: fileKey, url: 'https://untrusted.test/file' }],
        ...invalidScope,
        getPreviewUrl
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
    expect(getPreviewUrl).not.toHaveBeenCalled();
  });

  it('returns an empty list without creating preview URLs', async () => {
    const getPreviewUrl = vi.fn();

    await expect(
      resolveAuthorizedChatFiles({ files: [], ...scope, getPreviewUrl })
    ).resolves.toEqual([]);
    expect(getPreviewUrl).not.toHaveBeenCalled();
  });
});
