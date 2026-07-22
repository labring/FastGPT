import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AgentNodeResponseDisplay } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';

const { getFileContentByUrlMock } = vi.hoisted(() => ({
  getFileContentByUrlMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/fileContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/chat/fileContext')>()),
  getFileContentByUrl: getFileContentByUrlMock
}));

import { dispatchWorkflowReadFiles } from '@fastgpt/service/core/workflow/dispatch/ai/readFiles';

describe('dispatchWorkflowReadFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the shared JSON response and node response for parsed files', async () => {
    getFileContentByUrlMock.mockResolvedValue({
      name: 'parsed.pdf',
      content: 'Alpha content'
    });

    const result = await dispatchWorkflowReadFiles({
      files: [{ url: 'https://files.example.com/input.pdf' }],
      teamId: 'team_1',
      tmbId: 'tmb_1',
      customPdfParse: true,
      usageId: 'usage_1'
    });

    expect(getFileContentByUrlMock).toHaveBeenCalledWith({
      url: 'https://files.example.com/input.pdf',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      customPdfParse: true,
      usageId: 'usage_1',
      fileContext: undefined,
      validateExternalUrlDomain: false
    });
    expect(JSON.parse(result.response)).toEqual([
      {
        url: 'https://files.example.com/input.pdf',
        name: 'parsed.pdf',
        content: 'Alpha content'
      }
    ]);
    expect(result.usages).toEqual([]);
    expect(result.nodeResponse).toEqual({
      moduleType: FlowNodeTypeEnum.readFiles,
      moduleName: 'chat:read_file',
      moduleLogo: AgentNodeResponseDisplay.readFile.moduleLogo,
      readFiles: [
        {
          name: 'parsed.pdf',
          url: 'https://files.example.com/input.pdf'
        }
      ]
    });
  });

  it('keeps per-file failures in the same JSON and node response shape', async () => {
    getFileContentByUrlMock.mockRejectedValue(new Error('download failed'));

    const result = await dispatchWorkflowReadFiles({
      files: [
        {
          name: 'report.pdf',
          url: 'https://files.example.com/report.pdf'
        },
        {
          url: 'https://files.example.com/unknown.pdf'
        }
      ],
      teamId: 'team_1',
      tmbId: 'tmb_1'
    });

    expect(JSON.parse(result.response)).toEqual([
      {
        url: 'https://files.example.com/report.pdf',
        name: 'report.pdf',
        content: 'download failed'
      },
      {
        url: 'https://files.example.com/unknown.pdf',
        name: 'https://files.example.com/unknown.pdf',
        content: 'download failed'
      }
    ]);
    expect(result.nodeResponse.readFiles).toEqual([
      {
        name: 'report.pdf',
        url: 'https://files.example.com/report.pdf'
      },
      {
        name: 'https://files.example.com/unknown.pdf',
        url: 'https://files.example.com/unknown.pdf'
      }
    ]);
  });
});
