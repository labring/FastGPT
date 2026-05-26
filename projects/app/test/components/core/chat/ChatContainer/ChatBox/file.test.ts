import { describe, expect, it } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getUploadChatFileType } from '@/components/core/chat/ChatContainer/ChatBox/utils/file';

describe('getUploadChatFileType', () => {
  it('detects image, audio and video mime types', () => {
    expect(getUploadChatFileType({ type: 'image/png' } as File)).toBe(ChatFileTypeEnum.image);
    expect(getUploadChatFileType({ type: 'audio/mpeg' } as File)).toBe(ChatFileTypeEnum.audio);
    expect(getUploadChatFileType({ type: 'video/mp4' } as File)).toBe(ChatFileTypeEnum.video);
  });

  it('falls back to common file type for unknown or empty mime types', () => {
    expect(getUploadChatFileType({ type: 'application/pdf' } as File)).toBe(ChatFileTypeEnum.file);
    expect(getUploadChatFileType({ type: '' } as File)).toBe(ChatFileTypeEnum.file);
  });
});
