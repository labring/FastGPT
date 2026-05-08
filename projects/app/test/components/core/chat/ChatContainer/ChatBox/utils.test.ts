import { describe, expect, it } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { stripChatValueFileUrls } from '@/components/core/chat/ChatContainer/ChatBox/utils';

describe('stripChatValueFileUrls', () => {
  it('removes signed urls from keyed files before sending messages', () => {
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
});
