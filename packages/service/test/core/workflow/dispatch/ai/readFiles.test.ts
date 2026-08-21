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
      usageId: 'usage_1',
      maxFileAmount: 20
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

  it('returns per-file failures through error without mixing them into content', async () => {
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
      tmbId: 'tmb_1',
      maxFileAmount: 20
    });

    expect(JSON.parse(result.response)).toEqual([
      {
        name: 'report.pdf',
        content: '',
        error: 'download failed'
      },
      {
        name: 'https://files.example.com/unknown.pdf',
        content: '',
        error: 'download failed'
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

  it('only reads the first maxFileAmount items with at most 5 concurrent tasks', async () => {
    let activeTasks = 0;
    let maxActiveTasks = 0;
    const pendingResolvers: Array<() => void> = [];
    getFileContentByUrlMock.mockImplementation(async ({ url }: { url: string }) => {
      activeTasks += 1;
      maxActiveTasks = Math.max(maxActiveTasks, activeTasks);
      await new Promise<void>((resolve) => pendingResolvers.push(resolve));
      activeTasks -= 1;

      return {
        name: url.split('/').at(-1) ?? 'file',
        content: `content:${url}`
      };
    });

    const resultPromise = dispatchWorkflowReadFiles({
      files: Array.from({ length: 8 }, (_, index) => ({
        url: `https://files.example.com/${index + 1}.pdf`
      })),
      teamId: 'team_1',
      tmbId: 'tmb_1',
      maxFileAmount: 7
    });

    await vi.waitFor(() => expect(getFileContentByUrlMock).toHaveBeenCalledTimes(5));
    expect(activeTasks).toBe(5);

    pendingResolvers.splice(0, 5).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(getFileContentByUrlMock).toHaveBeenCalledTimes(7));
    pendingResolvers.splice(0).forEach((resolve) => resolve());

    const result = await resultPromise;
    expect(maxActiveTasks).toBe(5);
    expect(getFileContentByUrlMock).toHaveBeenCalledTimes(7);
    expect(JSON.parse(result.response)).toHaveLength(7);
    expect(result.nodeResponse.readFiles.at(-1)?.url).toBe('https://files.example.com/7.pdf');
  });
});
