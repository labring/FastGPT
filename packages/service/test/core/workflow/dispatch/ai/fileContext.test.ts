import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  it('returns no files when maxFileAmount is zero', async () => {
    expect(
      await parseWorkflowAIInputFiles({
        files: [
          {
            type: ChatFileTypeEnum.file,
            name: 'report.pdf',
            url: 'https://files.example.com/report.pdf'
          }
        ],
        maxFileAmount: 0
      })
    ).toEqual([]);
  });

  it('accepts absolute URLs, deduplicates them and preserves multimodal types', async () => {
    const result = await parseWorkflowAIInputFiles({
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
      maxFileAmount: 2
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

  it('uses Workflow Context identity and modelUrl for registered files', async () => {
    const inputUrl = 'https://app.example.com/api/system/file/d/signed';
    const modelUrl = 'https://model-files.example.com/report.pdf?signature=1';
    const fileContext = {
      limits: { maxFileAmount: 20, maxBytesPerFile: 1024 },
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

    await runWithContext({ mcpClientMemory: {}, fileContext }, async () => {
      expect(
        await parseWorkflowAIInputFiles({
          files: [
            {
              type: ChatFileTypeEnum.file,
              name: '',
              url: inputUrl
            }
          ],
          maxFileAmount: 20
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
  it('moves documents into the reminder and keeps multimodal URLs as message files', async () => {
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

    const { message: result, files: inputFiles } = await rewriteWorkflowAIUserMessageWithFiles({
      message,
      maxFileAmount: 20
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

describe('asynchronous classification ordering', () => {
  it('assigns duplicate filenames in input order even when the second probe finishes first', async () => {
    const context = await import('../../../../../core/workflow/utils/context');
    let releaseFirst!: (file: { name: string; url: string; type: ChatFileTypeEnum }) => void;
    const first = new Promise<{ name: string; url: string; type: ChatFileTypeEnum }>((resolve) => {
      releaseFirst = resolve;
    });
    const urls = ['https://files.example.com/first', 'https://files.example.com/second'];
    const spy = vi
      .spyOn(context, 'parseUrlToFileType')
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ name: 'report.pdf', type: ChatFileTypeEnum.file, url: urls[1] });
    try {
      const result = parseWorkflowAIInputFiles({
        files: urls.map((url) => ({ name: 'report.pdf', type: ChatFileTypeEnum.file, url })),
        maxFileAmount: 2
      });
      await Promise.resolve();
      releaseFirst({ name: 'report.pdf', type: ChatFileTypeEnum.file, url: urls[0] });
      expect(await result).toEqual([
        { name: 'report.pdf', type: ChatFileTypeEnum.file, url: urls[0] },
        { name: 'report-1.pdf', type: ChatFileTypeEnum.file, url: urls[1] }
      ]);
    } finally {
      spy.mockRestore();
    }
  });
});

// 分类测试隔离外部服务，避免无后缀样例发出真实网络请求。
beforeEach(async () => {
  const { axios } = await import('@fastgpt/service/common/api/axios');
  vi.spyOn(axios, 'head').mockResolvedValue({
    headers: { 'content-type': 'application/octet-stream' }
  } as any);
});
afterEach(() => vi.restoreAllMocks());
