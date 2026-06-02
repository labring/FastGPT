import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const { getFileContentByUrlMock } = vi.hoisted(() => ({
  getFileContentByUrlMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/utils/file', () => ({
  getFileContentByUrl: getFileContentByUrlMock
}));

import { dispatchReadFileTool } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/tools/file';

describe('dispatchReadFileTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records the built-in file nodeResponse with agent-compatible params and file preview', async () => {
    getFileContentByUrlMock.mockImplementation(async ({ url }: { url: string }) => {
      if (url === 'https://files/a.pdf') {
        return {
          name: 'a.pdf',
          content: 'Alpha'
        };
      }

      return {
        name: 'b.pdf',
        content: 'Beta'
      };
    });

    const result = await dispatchReadFileTool({
      files: [
        {
          id: 'file_a',
          url: 'https://files/a.pdf'
        },
        {
          id: 'file_b',
          url: 'https://files/b.pdf'
        }
      ],
      toolCallId: 'call_read',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      customPdfParse: true,
      usageId: 'usage_1'
    });

    expect(result.response).toContain('<id>file_a</id>');
    expect(result.response).toContain('<content>Alpha</content>');
    expect(result.response).toContain('<id>file_b</id>');
    expect(result.response).toContain('<content>Beta</content>');
    expect(result.flowResponse.builtinNodeResponses).toEqual([
      expect.objectContaining({
        id: 'call_read',
        nodeId: 'call_read',
        moduleType: FlowNodeTypeEnum.readFiles,
        moduleName: 'chat:read_file',
        moduleLogo: 'core/workflow/template/readFiles',
        toolId: 'read_files',
        toolInput: {
          ids: ['file_a', 'file_b']
        },
        toolRes: result.response,
        totalPoints: 0,
        readFiles: [
          {
            name: 'a.pdf',
            url: 'https://files/a.pdf'
          },
          {
            name: 'b.pdf',
            url: 'https://files/b.pdf'
          }
        ]
      })
    ]);
    const nodeResponse = result.flowResponse.builtinNodeResponses?.[0];
    expect(nodeResponse?.readFilesResult).toContain('## a.pdf');
    expect(nodeResponse?.readFilesResult).toContain('Alpha');
    expect(nodeResponse?.readFilesResult).toContain('## b.pdf');
    expect(nodeResponse?.readFilesResult).toContain('Beta');
    expect(result.flowResponse.runtimeNodeResponseSummary).toEqual(
      expect.objectContaining({
        responseIds: ['call_read'],
        childResponseCount: 1
      })
    );
    expect(getFileContentByUrlMock).toHaveBeenCalledWith({
      url: 'https://files/a.pdf',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      customPdfParse: true,
      usageId: 'usage_1'
    });
  });
});
