import { describe, expect, it } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  getUploadChatFileType,
  isChatFileAllowedBySelectConfig
} from '@/components/core/chat/ChatContainer/ChatBox/utils/file';

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

describe('isChatFileAllowedBySelectConfig', () => {
  it('allows configured document and image extensions', () => {
    expect(
      isChatFileAllowedBySelectConfig({
        file: { name: 'README.MD', type: 'text/markdown' },
        fileSelectConfig: { canSelectFile: true }
      })
    ).toBe(true);
    expect(
      isChatFileAllowedBySelectConfig({
        file: { name: 'photo.png', type: '' },
        fileSelectConfig: { canSelectImg: true }
      })
    ).toBe(true);
  });

  it('allows configured audio, video and custom extensions', () => {
    const fileSelectConfig = {
      canSelectAudio: true,
      canSelectVideo: true,
      canSelectCustomFileExtension: true,
      customFileExtensionList: ['dat']
    };

    expect(
      isChatFileAllowedBySelectConfig({
        file: { name: 'VOICE.MP3', type: 'audio/mpeg' },
        fileSelectConfig
      })
    ).toBe(true);
    expect(
      isChatFileAllowedBySelectConfig({
        file: { name: 'movie.webm', type: 'video/webm' },
        fileSelectConfig
      })
    ).toBe(true);
    expect(
      isChatFileAllowedBySelectConfig({
        file: { name: 'binary.dat', type: 'application/octet-stream' },
        fileSelectConfig
      })
    ).toBe(true);
  });

  it('rejects extensions whose category is disabled even when MIME claims media', () => {
    expect(
      isChatFileAllowedBySelectConfig({
        file: { name: 'voice.mp3', type: 'audio/mpeg' },
        fileSelectConfig: { canSelectAudio: false, canSelectFile: true }
      })
    ).toBe(false);
    expect(
      isChatFileAllowedBySelectConfig({
        file: { name: 'payload.exe', type: 'audio/mpeg' },
        fileSelectConfig: { canSelectAudio: true }
      })
    ).toBe(false);
  });

  it('uses configured media MIME fallback only when filename has no extension', () => {
    expect(
      isChatFileAllowedBySelectConfig({
        file: { name: 'clipboard-audio', type: 'audio/mpeg' },
        fileSelectConfig: { canSelectAudio: true }
      })
    ).toBe(true);
    expect(
      isChatFileAllowedBySelectConfig({
        file: { name: 'clipboard-audio', type: 'audio/mpeg' },
        fileSelectConfig: { canSelectAudio: false }
      })
    ).toBe(false);
    expect(
      isChatFileAllowedBySelectConfig({
        file: { name: 'clipboard-image', type: 'image/png' },
        fileSelectConfig: { canSelectImg: true }
      })
    ).toBe(true);
    expect(
      isChatFileAllowedBySelectConfig({
        file: { name: 'clipboard-video', type: 'video/mp4' },
        fileSelectConfig: { canSelectVideo: true }
      })
    ).toBe(true);
    expect(
      isChatFileAllowedBySelectConfig({
        file: { name: 'unknown', type: 'application/octet-stream' },
        fileSelectConfig: { canSelectFile: true }
      })
    ).toBe(false);
  });
});
