import { describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  parseWorkflowAIInputFiles,
  rewriteWorkflowAIUserMessageWithFiles
} from '@fastgpt/service/core/workflow/dispatch/ai/fileContext';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import type { WorkflowFileContext } from '@fastgpt/service/core/workflow/utils/fileContext';

describe('parseWorkflowAIInputFiles', () => {
  it('returns no files when maxFiles is zero', () => {
    expect(
      parseWorkflowAIInputFiles({
        files: [
          {
            type: ChatFileTypeEnum.file,
            name: 'report.pdf',
            url: 'https://files.example.com/report.pdf'
          }
        ],
        maxFiles: 0
      })
    ).toEqual([]);
  });

  it('accepts absolute URLs, deduplicates them and preserves multimodal types', () => {
    const result = parseWorkflowAIInputFiles({
      files: [
        {
          type: ChatFileTypeEnum.file,
          name: 'report.pdf',
          url: 'https://files.example.com/report.pdf'
        },
        {
          type: ChatFileTypeEnum.file,
          name: 'report-copy.pdf',
          url: 'https://files.example.com/report.pdf'
        },
        {
          type: ChatFileTypeEnum.image,
          name: 'chart.png',
          url: 'https://files.example.com/chart.png'
        },
        {
          type: ChatFileTypeEnum.audio,
          name: 'ignored.mp3',
          url: 'https://files.example.com/ignored.mp3'
        },
        {
          type: ChatFileTypeEnum.file,
          name: 'invalid.pdf',
          url: 'https://'
        }
      ],
      maxFiles: 2
    });

    expect(result).toEqual([
      {
        name: 'report.pdf',
        type: ChatFileTypeEnum.file,
        url: 'https://files.example.com/report.pdf'
      },
      {
        name: 'chart.png',
        type: ChatFileTypeEnum.image,
        url: 'https://files.example.com/chart.png'
      }
    ]);
  });

  it('uses Workflow Context identity and modelUrl for registered files', () => {
    const inputUrl = 'https://app.example.com/api/system/file/d/signed';
    const modelUrl = 'https://model-files.example.com/report.pdf?signature=1';
    const fileContext = {
      limits: { maxFiles: 20, maxBytesPerFile: 1024 },
      resolve: vi.fn((url: string) =>
        url === inputUrl
          ? {
              id: 'ref-1',
              name: 'report.pdf',
              type: ChatFileTypeEnum.file,
              modelUrl,
              source: { type: 'chatObject', objectKey: 'chat/report.pdf' }
            }
          : undefined
      ),
      resolveChatFile: vi.fn((url: string) =>
        url === modelUrl
          ? {
              name: 'report.pdf',
              type: ChatFileTypeEnum.file,
              url: modelUrl
            }
          : undefined
      ),
      getIdentity: vi.fn(() => 'chat:report.pdf'),
      resolveInputFile: vi.fn(),
      read: vi.fn(),
      derive: vi.fn()
    } as unknown as WorkflowFileContext;

    runWithContext({ mcpClientMemory: {}, fileContext }, () => {
      expect(
        parseWorkflowAIInputFiles({
          files: [
            {
              type: ChatFileTypeEnum.file,
              name: '',
              url: inputUrl
            }
          ],
          maxFiles: 20
        })
      ).toEqual([
        {
          name: 'report.pdf',
          type: ChatFileTypeEnum.file,
          url: modelUrl
        }
      ]);
    });
  });
});

describe('rewriteWorkflowAIUserMessageWithFiles', () => {
  it('moves documents into the reminder and keeps multimodal URLs as message files', () => {
    const message: ChatItemMiniType = {
      obj: ChatRoleEnum.Human,
      value: runtimePrompt2ChatsValue({
        text: 'analyze all inputs',
        files: [
          {
            type: ChatFileTypeEnum.file,
            name: 'report.pdf',
            url: 'https://files.example.com/report.pdf'
          },
          {
            type: ChatFileTypeEnum.image,
            name: 'chart.png',
            url: 'https://files.example.com/chart.png'
          },
          {
            type: ChatFileTypeEnum.audio,
            name: 'voice.mp3',
            url: 'https://files.example.com/voice.mp3'
          },
          {
            type: ChatFileTypeEnum.video,
            name: 'demo.mp4',
            url: 'https://files.example.com/demo.mp4'
          }
        ]
      })
    };

    const { message: result, files: inputFiles } = rewriteWorkflowAIUserMessageWithFiles({
      message,
      maxFiles: 20
    });
    const { text, files } = chatValue2RuntimePrompt(result.value);

    expect(inputFiles).toHaveLength(4);
    expect(files.map((file) => file.type)).toEqual([
      ChatFileTypeEnum.image,
      ChatFileTypeEnum.audio,
      ChatFileTypeEnum.video
    ]);
    expect(text).toContain('analyze all inputs');
    expect(text).toContain('<url>https://files.example.com/report.pdf</url>');
    expect(text).toContain('<url>https://files.example.com/chart.png</url>');
    expect(text).not.toContain('<id>');
  });
});
