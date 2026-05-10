import { describe, expect, it } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { formatFileInput } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/file/utils';

describe('formatFileInput', () => {
  it('should return empty image urls when no files are provided', () => {
    const result = formatFileInput({
      fileUrls: [],
      maxFiles: 20,
      histories: [],
      useSkill: false
    });

    expect(result.queryImageUrls).toEqual([]);
    expect(result.filesMap).toEqual({});
    expect(result.allFilesMap).toEqual({});
  });

  it('should collect only current user image urls for dataset image search', () => {
    const historyImageUrl = '/api/file/history.png';
    const histories: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            file: {
              type: ChatFileTypeEnum.image,
              name: 'history.png',
              url: historyImageUrl
            }
          }
        ]
      }
    ];

    const result = formatFileInput({
      fileUrls: [
        'https://fastgpt.local/api/file/current.png',
        '/api/file/manual.pdf',
        'data:image/png;base64,aaa',
        'data:text/plain;base64,bbb',
        'local/path/invalid.png'
      ],
      requestOrigin: 'https://fastgpt.local',
      maxFiles: 20,
      histories,
      useSkill: false
    });

    expect(result.queryImageUrls).toEqual(['/api/file/current.png', 'data:image/png;base64,aaa']);
    expect(result.queryImageUrls).not.toContain(historyImageUrl);
    expect(result.filesMap).toEqual({
      '2': '/api/file/manual.pdf'
    });
    expect(Object.values(result.allFilesMap).map((file) => file.url)).toEqual([
      '/api/file/current.png',
      '/api/file/manual.pdf',
      'data:image/png;base64,aaa',
      historyImageUrl
    ]);
  });
});
