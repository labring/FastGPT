import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  buildSkillDebugUserContext,
  parseSkillDebugInputFiles
} from '@fastgpt/service/core/ai/skill/debugChat/userContext';
import { describe, expect, it } from 'vitest';

describe('Skill Debug user context', () => {
  it('normalizes, deduplicates and limits input files', () => {
    const result = parseSkillDebugInputFiles({
      files: [
        {
          type: ChatFileTypeEnum.file,
          name: 'first.txt',
          url: ' https://files.example.com/first.txt '
        },
        {
          type: ChatFileTypeEnum.file,
          name: 'duplicate.txt',
          url: 'https://files.example.com/first.txt'
        },
        ...Array.from({ length: 11 }, (_, index) => ({
          type: ChatFileTypeEnum.file,
          name: `${index}.txt`,
          url: `https://files.example.com/${index}.txt`
        }))
      ]
    });

    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({
      name: 'first.txt',
      type: ChatFileTypeEnum.file,
      url: 'https://files.example.com/first.txt'
    });
    expect(result.filter((file) => file.url.endsWith('/first.txt'))).toHaveLength(1);
  });

  it('uses read_files for documents and retains multimodal current inputs', () => {
    const result = buildSkillDebugUserContext({
      histories: [
        {
          dataId: 'history-id',
          obj: ChatRoleEnum.Human,
          value: [
            {
              file: {
                type: ChatFileTypeEnum.file,
                name: 'history.txt',
                url: 'https://files.example.com/history.txt'
              }
            },
            { text: { content: 'previous question' } }
          ]
        }
      ],
      currentUserValue: [
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'guide.pdf',
            url: 'https://files.example.com/guide.pdf'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.image,
            name: 'diagram.png',
            url: 'https://files.example.com/diagram.png'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.video,
            name: 'demo.mp4',
            url: 'https://files.example.com/demo.mp4'
          }
        },
        { text: { content: 'summarize this' } }
      ],
      currentDataId: 'current-id',
      requestOrigin: 'https://app.example.com',
      skillInfos: [
        {
          name: 'test-skill',
          description: 'Test skill',
          directory: '/workspace/skills/test-skill',
          skillMdPath: '/workspace/skills/test-skill/SKILL.md'
        }
      ],
      currentWorkingDirectory: '/workspace',
      currentTime: '2026-07-28 12:00:00'
    });

    expect(result.readableFileUrls).toEqual([
      'https://files.example.com/history.txt',
      'https://files.example.com/guide.pdf'
    ]);
    expect(result.messages).toHaveLength(2);
    const currentMessage = result.messages[1];
    expect(currentMessage).toMatchObject({ role: 'user' });
    expect(JSON.stringify(currentMessage.content)).toContain('read_files');
    expect(JSON.stringify(currentMessage.content)).toContain(
      '/workspace/skills/test-skill/SKILL.md'
    );
    expect(currentMessage.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image_url',
          image_url: { url: 'https://files.example.com/diagram.png' }
        }),
        expect.objectContaining({
          type: 'file_url',
          name: 'demo.mp4',
          url: 'https://files.example.com/demo.mp4',
          fileType: ChatFileTypeEnum.video
        })
      ])
    );
    expect(JSON.stringify(currentMessage.content)).not.toContain('"fileType":"file"');
    expect(result.askContinuationMessages).toHaveLength(1);
    expect(JSON.stringify(result.askContinuationMessages)).toContain(
      'https://files.example.com/demo.mp4'
    );
    expect(JSON.stringify(result.askContinuationMessages)).not.toContain('summarize this');
  });
});
