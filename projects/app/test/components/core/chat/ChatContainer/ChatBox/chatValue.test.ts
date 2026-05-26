import { describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  formatChatValue2InputType,
  stripChatValueFileUrls
} from '@/components/core/chat/ChatContainer/ChatBox/utils/chatValue';
import type { ChatItemValueItemType } from '@fastgpt/global/core/chat/type';

describe('formatChatValue2InputType', () => {
  it('joins text fragments and converts file values into input files', () => {
    const value: ChatItemValueItemType[] = [
      {
        file: {
          type: ChatFileTypeEnum.image,
          name: 'image.png',
          url: 'https://example.com/image.png',
          key: 'chat/image.png'
        }
      },
      {
        text: {
          content: 'hello '
        }
      },
      {
        text: {
          content: 'FastGPT'
        }
      }
    ];

    const result = formatChatValue2InputType(value);

    expect(result.text).toBe('hello FastGPT');
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      id: 'https://example.com/image.png',
      type: ChatFileTypeEnum.image,
      name: 'image.png',
      url: 'https://example.com/image.png',
      key: 'chat/image.png'
    });
    expect(result.files[0].icon).toBeTruthy();
  });

  it('returns an empty input for missing values', () => {
    expect(formatChatValue2InputType()).toEqual({
      text: '',
      files: []
    });
  });

  it('guards against non-array values', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(formatChatValue2InputType({ text: { content: 'bad' } } as any)).toEqual({
      text: '',
      files: []
    });
    expect(consoleSpy).toHaveBeenCalledWith('value is error', {
      text: {
        content: 'bad'
      }
    });

    consoleSpy.mockRestore();
  });
});

describe('stripChatValueFileUrls', () => {
  it('removes signed urls only from keyed files before sending messages', () => {
    const value: ChatItemValueItemType[] = [
      {
        file: {
          type: ChatFileTypeEnum.image,
          name: 'image.png',
          key: 'chat/files/image.png',
          url: 'https://preview.example.com/image.png'
        }
      },
      {
        file: {
          type: ChatFileTypeEnum.file,
          name: 'external.pdf',
          url: 'https://external.example.com/external.pdf'
        }
      },
      {
        text: {
          content: 'hello'
        }
      }
    ];

    expect(stripChatValueFileUrls(value)).toEqual([
      {
        file: {
          type: ChatFileTypeEnum.image,
          name: 'image.png',
          key: 'chat/files/image.png',
          url: ''
        }
      },
      {
        file: {
          type: ChatFileTypeEnum.file,
          name: 'external.pdf',
          url: 'https://external.example.com/external.pdf'
        }
      },
      {
        text: {
          content: 'hello'
        }
      }
    ]);
    expect(value[0].file.url).toBe('https://preview.example.com/image.png');
  });

  it('returns an empty array for missing values', () => {
    expect(stripChatValueFileUrls()).toEqual([]);
  });
});
