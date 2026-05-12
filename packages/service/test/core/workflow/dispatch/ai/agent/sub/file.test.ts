import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const { getRawTextBufferMock, compressLargeContentMock } = vi.hoisted(() => ({
  getRawTextBufferMock: vi.fn(),
  compressLargeContentMock: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/rawText/index', () => ({
  getS3RawTextSource: () => ({
    getRawTextBuffer: getRawTextBufferMock,
    addRawTextBuffer: vi.fn()
  })
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: vi.fn(() => ({
    model: 'gpt-4',
    name: 'GPT-4',
    maxContext: 128000
  }))
}));

vi.mock('@fastgpt/service/core/ai/llm/compress/constants', () => ({
  calculateCompressionThresholds: vi.fn(() => ({
    fileReadResponse: {
      threshold: 4000
    }
  }))
}));

vi.mock('@fastgpt/service/core/ai/llm/compress', () => ({
  compressLargeContent: compressLargeContentMock
}));

vi.mock('@fastgpt/web/i18n/utils', () => ({
  i18nT: vi.fn((key: string) => key)
}));

import { dispatchFileRead } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/file';

describe('dispatchFileRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records compression LLM request ids on node response', async () => {
    getRawTextBufferMock.mockResolvedValue({
      filename: 'doc.txt',
      text: 'large file content'
    });
    compressLargeContentMock.mockResolvedValue({
      compressed: 'compressed file content',
      usage: {
        moduleName: 'account_usage:llm_compress_text',
        model: 'GPT-4',
        totalPoints: 0.2,
        inputTokens: 20,
        outputTokens: 5
      },
      requestIds: ['req_file_compress']
    });

    const result = await dispatchFileRead({
      files: [
        {
          index: '0',
          url: 'file_raw_text_id'
        }
      ],
      teamId: 'team_1',
      tmbId: 'tmb_1',
      model: 'gpt-4'
    });

    expect(result.response).toBe('compressed file content');
    expect(result.usages).toEqual([
      {
        moduleName: 'account_usage:llm_compress_text',
        model: 'GPT-4',
        totalPoints: 0.2,
        inputTokens: 20,
        outputTokens: 5
      }
    ]);
    expect(result.nodeResponse).toEqual({
      moduleType: FlowNodeTypeEnum.readFiles,
      moduleName: 'chat:read_file',
      llmRequestIds: ['req_file_compress'],
      compressTextAgent: {
        inputTokens: 20,
        outputTokens: 5,
        totalPoints: 0.2
      }
    });
  });
});
