import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  buildSkillEditUserContext,
  parseSkillEditInputFiles
} from '@fastgpt/service/core/ai/auxiliaryGeneration/skillEdit/userContext';
import type { SkillEditInputFileType } from '@fastgpt/service/core/ai/auxiliaryGeneration/skillEdit/utils';
import { describe, expect, it } from 'vitest';

describe('skillEdit user context', () => {
  it('normalizes, deduplicates and limits input files with stable ids', () => {
    const files = [
      {
        type: ChatFileTypeEnum.file,
        name: 'first.txt',
        url: ' http://test.local/files/first.txt '
      },
      {
        type: ChatFileTypeEnum.file,
        name: 'duplicate.txt',
        url: 'http://test.local/files/first.txt'
      },
      ...Array.from({ length: 11 }, (_, index) => ({
        type: ChatFileTypeEnum.file,
        name: `${index}.txt`,
        url: `http://test.local/files/${index}.txt`
      }))
    ];

    const result = parseSkillEditInputFiles({
      files,
      prefixId: 'message-id',
      requestOrigin: 'http://test.local'
    });

    expect(result).toHaveLength(10);
    expect(result.map((file: SkillEditInputFileType) => file.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `message-id-${index}`)
    );
    expect(result[0]).toEqual({
      id: 'message-id-0',
      name: 'first.txt',
      type: ChatFileTypeEnum.file,
      url: '/files/first.txt'
    });
    expect(
      result.filter((file: SkillEditInputFileType) => file.url === '/files/first.txt')
    ).toHaveLength(1);
  });

  it('exposes documents through read_files while retaining multimodal model inputs', () => {
    const result = buildSkillEditUserContext({
      histories: [
        {
          dataId: 'history-id',
          obj: ChatRoleEnum.Human,
          value: [
            {
              file: {
                type: ChatFileTypeEnum.file,
                name: 'history.txt',
                url: '/files/history.txt'
              }
            },
            { text: { content: 'previous question' } }
          ]
        }
      ],
      contextMessages: [],
      currentUserValue: [
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'guide.pdf',
            url: '/files/guide.pdf'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.image,
            name: 'diagram.png',
            url: '/files/diagram.png'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.video,
            name: 'demo.mp4',
            url: '/files/demo.mp4'
          }
        },
        { text: { content: 'summarize this' } }
      ],
      currentDataId: 'current-id',
      requestOrigin: 'http://test.local',
      skillInfos: [
        {
          name: 'test-skill',
          description: 'Test skill',
          directory: '/workspace/skills/test-skill',
          skillMdPath: '/workspace/skills/test-skill/SKILL.md'
        }
      ],
      currentWorkingDirectory: '/workspace',
      currentTime: '2026-07-10 12:00:00'
    });

    expect(result.filesMap).toEqual({
      'history-id-0': '/files/history.txt',
      'current-id-0': '/files/guide.pdf'
    });
    expect(result.messages).toHaveLength(2);

    const historyMessage = result.messages[0];
    expect(historyMessage.role).toBe('user');
    expect(historyMessage.content).toEqual(expect.stringContaining('<id>history-id-0</id>'));

    const currentMessage = result.messages[1];
    expect(currentMessage.role).toBe('user');
    expect(currentMessage.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image_url',
          image_url: { url: '/files/diagram.png' }
        }),
        expect.objectContaining({
          type: 'file_url',
          name: 'demo.mp4',
          url: '/files/demo.mp4',
          fileType: ChatFileTypeEnum.video
        }),
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('<id>current-id-0</id>')
        })
      ])
    );
    expect(JSON.stringify(currentMessage.content)).not.toContain('"fileType":"file"');
    expect(JSON.stringify(currentMessage.content)).toContain('不会自动进入 sandbox 或 workspace');
    expect(result.resumeFileMessages).toHaveLength(1);
    expect(JSON.stringify(result.resumeFileMessages)).toContain('/files/demo.mp4');
    expect(JSON.stringify(result.resumeFileMessages)).toContain('<id>current-id-0</id>');
    expect(JSON.stringify(result.resumeFileMessages)).not.toContain('summarize this');
  });
});
