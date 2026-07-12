import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const { getFileContentByUrlMock } = vi.hoisted(() => ({
  getFileContentByUrlMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/fileContext', () => ({
  getFileContentByUrl: getFileContentByUrlMock
}));

import { dispatchReadFileTool } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/tools/file';

describe('dispatchReadFileTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records parsed files on the read-file node response', async () => {
    getFileContentByUrlMock.mockResolvedValue({
      name: 'parsed.pdf',
      content: 'Alpha content'
    });

    const result = await dispatchReadFileTool({
      files: [
        {
          id: 'file_0',
          name: 'input.pdf',
          url: '/files/input.pdf'
        }
      ],
      toolCallId: 'call_read_file',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      customPdfParse: true,
      usageId: 'usage_1'
    });

    expect(getFileContentByUrlMock).toHaveBeenCalledWith({
      url: '/files/input.pdf',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      customPdfParse: true,
      usageId: 'usage_1'
    });
    expect(result.response).toContain('<name>input.pdf</name>');
    expect(result.flowResponse.flowResponses[0]).toEqual(
      expect.objectContaining({
        id: 'call_read_file',
        nodeId: 'call_read_file',
        moduleType: FlowNodeTypeEnum.readFiles,
        moduleName: 'chat:read_file',
        readFiles: [
          {
            name: 'input.pdf',
            url: '/files/input.pdf'
          }
        ]
      })
    );
    expect(result.flowResponse.flowResponses[0]).not.toHaveProperty('readFilesResult');
  });
});
